export type RequestStatus = "pending" | "accepted" | "rejected" | "expired";

export interface Request {
  id: string;
  route_id: string;
  business_id: string;
  status: RequestStatus;
  created_at?: string;
}

