export interface GPSPoint {
  lat: number;
  lng: number;
  accuracy: number;       // metres — from GPS hardware
  speed: number | null;   // m/s
  heading: number | null; // degrees 0–360
  altitude: number | null;
  ts: number;             // Date.now()
}

// ---------------------------------------------------------------------------
// Anti-spoofing types
// ---------------------------------------------------------------------------

/** Reason a GPS reading was flagged as suspicious. */
export type SpoofReason =
  | "impossible_coordinates" // lat/lng outside physical bounds
  | "position_jump"          // teleportation: > MAX_JUMP_KM in < MAX_JUMP_SECS
  | "speed_anomaly";         // implied speed between points exceeds MAX_SPEED_KMH

export interface SpoofEvent {
  reason: SpoofReason;
  /** Calculated speed in km/h between last clean point and flagged point (null for coord errors). */
  impliedSpeedKmh: number | null;
  /** The raw coordinates that were rejected. */
  rawLat: number;
  rawLng: number;
  /** How many consecutive flags have been raised (resets on a clean reading). */
  consecutiveCount: number;
}

export type OnPoint      = (point: GPSPoint) => void;
export type OnError      = (error: GeolocationPositionError) => void;
export type OnPermission = (state: "granted" | "denied" | "requesting") => void;
/** Called every time a point is flagged as suspicious (but not yet blocked). */
export type OnSpoofWarning  = (event: SpoofEvent) => void;
/** Called when MAX_CONSECUTIVE_FLAGS bad readings arrive in a row — tracker auto-stops. */
export type OnSpoofDetected = (lastEvent: SpoofEvent) => void;

// ---------------------------------------------------------------------------
// Kalman filter — one-dimensional, applied independently to lat and lng
// ---------------------------------------------------------------------------
interface KalmanState {
  value: number;
  variance: number; // uncertainty (accuracy² initially)
}

/**
 * One step of the 1-D Kalman filter.
 * @param prev  Last estimated state
 * @param measurement  New GPS reading
 * @param measurementSigma  Accuracy of the new reading in metres
 * @param dtMs  Milliseconds since last update (used to grow uncertainty over time)
 */
function kalmanStep(
  prev: KalmanState,
  measurement: number,
  measurementSigma: number,
  dtMs: number,
): KalmanState {
  // Process noise: position uncertainty grows ~3 m²/s while vehicle moves
  const processNoise = 9; // m²/s  (≈ ±3 m/s uncertainty)
  const decayedVariance = prev.variance + processNoise * (dtMs / 1000);

  const R = measurementSigma * measurementSigma; // measurement variance
  const K = decayedVariance / (decayedVariance + R); // Kalman gain [0–1]

  return {
    value: prev.value + K * (measurement - prev.value),
    variance: (1 - K) * decayedVariance,
  };
}

// ---------------------------------------------------------------------------
// Haversine distance in metres between two lat/lng points
// ---------------------------------------------------------------------------
function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// GPSTracker class
// ---------------------------------------------------------------------------

/** How often we call onPoint (and therefore upload). First point is immediate. */
const EMIT_INTERVAL_MS = 8_000;

/**
 * Reject readings only if accuracy is completely unusable (>5 km = IP-only).
 * Wi-Fi desktop: 100–500 m (passes). Phone GPS: 3–50 m (passes).
 * Pure IP geolocation: 1000–5000 m (still passes for basic map display).
 */
const MAX_ACCURACY_M = 5000;

/**
 * Don't emit a new point if the driver hasn't moved more than this.
 * Avoids polluting the database while the truck is stationary.
 */
const MIN_MOVE_M = 5;

// ---------------------------------------------------------------------------
// Anti-spoofing thresholds
// ---------------------------------------------------------------------------

/** Maximum physically plausible road speed (sports car absolute limit). */
const MAX_SPEED_KMH = 250;

/**
 * Maximum legitimate position jump within the short-window check.
 * 50 km in under MAX_JUMP_SECS seconds is physically impossible on any road.
 */
const MAX_JUMP_KM   = 50;
const MAX_JUMP_SECS = 30;

/**
 * After this many consecutive flagged readings the tracker auto-stops and
 * fires onSpoofDetected. Resets to 0 on any clean reading.
 */
const MAX_CONSECUTIVE_FLAGS = 3;

export class GPSTracker {
  private watchId: number | null = null;
  private kalmanLat: KalmanState | null = null;
  private kalmanLng: KalmanState | null = null;
  private lastEmittedPoint: GPSPoint | null = null;
  private lastEmitTs = 0;
  private lastRawTs = 0;
  /** Consecutive suspicious-reading counter — resets on any clean point. */
  private consecutiveFlags = 0;
  /** Fired once as soon as the browser delivers any position (= permission granted). */
  private permissionNotified = false;

  constructor(
    private readonly onPoint: OnPoint,
    private readonly onError: OnError,
    private readonly onPermission: OnPermission,
    private readonly onSpoofWarning?: OnSpoofWarning,
    private readonly onSpoofDetected?: OnSpoofDetected,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (!navigator.geolocation) {
      console.error("[GPS] Geolocation API not supported in this browser.");
      return;
    }

    this.onPermission("requesting");

    // Check permission without triggering browser prompt first (Chrome/Firefox)
    if ("permissions" in navigator) {
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "denied") {
          this.onPermission("denied");
          return;
        }
      } catch {
        // permissions API not supported — proceed anyway
      }
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePosition(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.onPermission("denied");
        }
        this.onError(err);
      },
      {
        enableHighAccuracy: true, // force GPS chip, not cell-tower / Wi-Fi
        timeout: 20_000,          // wait up to 20 s for a fix
        maximumAge: 0,            // never serve a cached position
      },
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.kalmanLat = null;
    this.kalmanLng = null;
    this.lastEmittedPoint = null;
    this.lastEmitTs = 0;
    this.lastRawTs = 0;
    this.consecutiveFlags = 0;
    this.permissionNotified = false;
  }

  get isRunning(): boolean {
    return this.watchId !== null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  // ── Anti-spoofing helpers ─────────────────────────────────────────────────

  /** Raise a spoof warning; auto-stop and fire onSpoofDetected after MAX_CONSECUTIVE_FLAGS. */
  private flagSuspiciousPoint(event: SpoofEvent): void {
    console.warn(
      `[GPS] Suspicious point flagged (${event.reason}) — ` +
      `implied speed: ${event.impliedSpeedKmh != null ? Math.round(event.impliedSpeedKmh) + " km/h" : "N/A"}, ` +
      `raw: (${event.rawLat.toFixed(5)}, ${event.rawLng.toFixed(5)}), ` +
      `consecutive: ${event.consecutiveCount}`,
    );
    this.onSpoofWarning?.(event);
    if (event.consecutiveCount >= MAX_CONSECUTIVE_FLAGS) {
      console.error("[GPS] Auto-stopping — too many consecutive suspicious readings.");
      this.onSpoofDetected?.(event);
      this.stop();
    }
  }

  // ── Core position handler ─────────────────────────────────────────────────

  private handlePosition(pos: GeolocationPosition): void {
    const { latitude, longitude, accuracy, speed, heading, altitude } = pos.coords;
    const now = Date.now();

    // 1. Permission confirmed — browser fired the callback, so access was allowed.
    //    Notify once regardless of accuracy so the UI never stays stuck.
    if (!this.permissionNotified) {
      this.permissionNotified = true;
      this.onPermission("granted");
    }

    // 2. Reject low-accuracy / junk readings (still filter for uploads)
    if (accuracy > MAX_ACCURACY_M) return;

    // 3. ── Anti-spoofing Layer 1: Impossible coordinate bounds ────────────────
    //    Physical limits: lat ∈ [-90, 90], lng ∈ [-180, 180].
    //    Any value outside these is a hard proof of tampering.
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      this.consecutiveFlags++;
      this.flagSuspiciousPoint({
        reason: "impossible_coordinates",
        impliedSpeedKmh: null,
        rawLat: latitude,
        rawLng: longitude,
        consecutiveCount: this.consecutiveFlags,
      });
      return;
    }

    // 4. Kalman-smooth the coordinates
    const dtMs = this.lastRawTs ? now - this.lastRawTs : 1_000;
    this.lastRawTs = now;

    if (!this.kalmanLat || !this.kalmanLng) {
      this.kalmanLat = { value: latitude, variance: accuracy * accuracy };
      this.kalmanLng = { value: longitude, variance: accuracy * accuracy };
    } else {
      this.kalmanLat = kalmanStep(this.kalmanLat, latitude, accuracy, dtMs);
      this.kalmanLng = kalmanStep(this.kalmanLng, longitude, accuracy, dtMs);
    }

    const smoothedLat = this.kalmanLat.value;
    const smoothedLng = this.kalmanLng.value;

    // 5. Rate-limit emissions — skip for the very first point so map loads immediately
    const isFirstPoint = this.lastEmitTs === 0;
    if (!isFirstPoint && now - this.lastEmitTs < EMIT_INTERVAL_MS) return;

    // 6. Skip if driver hasn't moved enough — but always send the very first point
    if (
      this.lastEmittedPoint &&
      haversineM(
        this.lastEmittedPoint.lat, this.lastEmittedPoint.lng,
        smoothedLat, smoothedLng,
      ) < MIN_MOVE_M
    ) {
      return;
    }

    // 7. ── Anti-spoofing Layer 2 & 3: Speed anomaly + Position jump ───────────
    //    Compare the new smoothed point against the last emitted (Kalman-filtered)
    //    point. Using the emitted point (not every raw reading) prevents GPS
    //    jitter from generating false positives.
    if (this.lastEmittedPoint) {
      const distM = haversineM(
        this.lastEmittedPoint.lat, this.lastEmittedPoint.lng,
        smoothedLat, smoothedLng,
      );
      const dtSec = (now - this.lastEmittedPoint.ts) / 1000;
      const impliedSpeedKmh = dtSec > 0 ? (distM / dtSec) * 3.6 : Infinity;
      const distKm = distM / 1000;

      // Layer 2 — Position jump: > MAX_JUMP_KM in < MAX_JUMP_SECS seconds.
      // Even a helicopter (≈300 km/h) couldn't cover 50 km in 30 seconds.
      if (distKm > MAX_JUMP_KM && dtSec < MAX_JUMP_SECS) {
        this.consecutiveFlags++;
        this.flagSuspiciousPoint({
          reason: "position_jump",
          impliedSpeedKmh,
          rawLat: latitude,
          rawLng: longitude,
          consecutiveCount: this.consecutiveFlags,
        });
        return;
      }

      // Layer 3 — Speed anomaly: implied speed between two Kalman-smoothed
      // points exceeds the maximum physically plausible road speed.
      if (impliedSpeedKmh > MAX_SPEED_KMH) {
        this.consecutiveFlags++;
        this.flagSuspiciousPoint({
          reason: "speed_anomaly",
          impliedSpeedKmh,
          rawLat: latitude,
          rawLng: longitude,
          consecutiveCount: this.consecutiveFlags,
        });
        return;
      }
    }

    // 8. Clean reading — reset the consecutive flag counter
    this.consecutiveFlags = 0;

    const point: GPSPoint = {
      lat: smoothedLat,
      lng: smoothedLng,
      accuracy,
      speed: speed ?? null,
      heading: heading ?? null,
      altitude: altitude ?? null,
      ts: now,
    };

    this.lastEmittedPoint = point;
    this.lastEmitTs = now;
    this.onPoint(point);
  }
}
