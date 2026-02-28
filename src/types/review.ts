export interface Review {
  id: string;
  request_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: "business" | "transporter";
  rating: number;
  comment?: string | null;
  created_at: string;
}
