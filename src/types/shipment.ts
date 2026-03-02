export type ShipmentStatus = "detajet_plotësuara" | "ngarkuar" | "në_transit" | "dorëzuar";

export const SHIPMENT_STATUS_STEPS: { key: ShipmentStatus; label: string }[] = [
  { key: "detajet_plotësuara", label: "Detajet plotësuar" },
  { key: "ngarkuar",           label: "Ngarkuar" },
  { key: "në_transit",         label: "Në transit" },
  { key: "dorëzuar",           label: "Dorëzuar" },
];

export interface ShipmentDetails {
  id: string;
  request_id: string;
  contact_name: string;
  contact_phone: string;
  pickup_address: string;
  notes?: string | null;
  weight_kg?: number | null;
  shipment_status: ShipmentStatus;
  /**
   * Set to true automatically when shipment_status transitions to "dorëzuar".
   * Once true, weight, pickup_address, and documents become read-only for all parties.
   */
  is_locked?: boolean;
  /**
   * Set to true by the business after verifying the Proof of Delivery document.
   * Triggers automatic route closure (routes.status → "completed").
   */
  delivery_confirmed?: boolean;
  delivery_confirmed_at?: string | null;
  created_at?: string;
}
