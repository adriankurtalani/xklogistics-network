export interface Location {
  id: string;
  country: string;
  city: string;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
