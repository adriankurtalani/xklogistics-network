import type { Location } from "./location";
import type { Corridor } from "./corridor";

export type RouteStatus = "available" | "in_transit" | "completed";

export interface Route {
  id: string;
  transporter_id: string;
  origin_location_id: string;
  destination_location_id: string;
  corridor_id?: string | null;
  departure_date: string;
  available_capacity: number;
  status: RouteStatus;
  created_at?: string;
  // Populated via Supabase join
  origin?: Location;
  destination?: Location;
  corridor?: Corridor | null;
}
