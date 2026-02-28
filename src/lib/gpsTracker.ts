export interface GPSPoint {
  lat: number;
  lng: number;
  accuracy: number;       // metres — from GPS hardware
  speed: number | null;   // m/s
  heading: number | null; // degrees 0–360
  altitude: number | null;
  ts: number;             // Date.now()
}

export type OnPoint = (point: GPSPoint) => void;
export type OnError = (error: GeolocationPositionError) => void;
export type OnPermission = (state: "granted" | "denied" | "requesting") => void;

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

export class GPSTracker {
  private watchId: number | null = null;
  private kalmanLat: KalmanState | null = null;
  private kalmanLng: KalmanState | null = null;
  private lastEmittedPoint: GPSPoint | null = null;
  private lastEmitTs = 0;
  private lastRawTs = 0;
  /** Fired once as soon as the browser delivers any position (= permission granted). */
  private permissionNotified = false;

  constructor(
    private readonly onPoint: OnPoint,
    private readonly onError: OnError,
    private readonly onPermission: OnPermission,
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
    this.permissionNotified = false;
  }

  get isRunning(): boolean {
    return this.watchId !== null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

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

    // 3. Kalman-smooth the coordinates
    const dtMs = this.lastRawTs ? now - this.lastRawTs : 1_000;
    this.lastRawTs = now;

    if (!this.kalmanLat || !this.kalmanLng) {
      // First valid reading — seed the filter
      this.kalmanLat = { value: latitude, variance: accuracy * accuracy };
      this.kalmanLng = { value: longitude, variance: accuracy * accuracy };
    } else {
      this.kalmanLat = kalmanStep(this.kalmanLat, latitude, accuracy, dtMs);
      this.kalmanLng = kalmanStep(this.kalmanLng, longitude, accuracy, dtMs);
    }

    const smoothedLat = this.kalmanLat.value;
    const smoothedLng = this.kalmanLng.value;

    // 3. Rate-limit emissions — skip for the very first point so map loads immediately
    const isFirstPoint = this.lastEmitTs === 0;
    if (!isFirstPoint && now - this.lastEmitTs < EMIT_INTERVAL_MS) return;

    // 4. Skip if driver hasn't moved enough — but always send the very first point
    if (
      this.lastEmittedPoint &&
      haversineM(
        this.lastEmittedPoint.lat, this.lastEmittedPoint.lng,
        smoothedLat, smoothedLng,
      ) < MIN_MOVE_M
    ) {
      return;
    }
    // Always emit the first point immediately so the business map shows something

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
