export type UserRole = "transporter" | "business" | "admin";

export interface User {
  id: string;
  role: UserRole;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  vat_number?: string | null;
  address?: string | null;
  created_at?: string;
  is_suspended?: boolean;
}

