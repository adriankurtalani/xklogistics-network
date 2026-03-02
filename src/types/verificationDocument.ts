export type DocType   = "license" | "company_registration" | "insurance";
export type DocStatus = "pending" | "approved" | "rejected";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  license:              "Leja e Drejtimit / Licenca CMR",
  company_registration: "Regjistrimi i Kompanisë",
  insurance:            "Provë Sigurimi",
};

export const DOC_TYPE_DESCRIPTIONS: Record<DocType, string> = {
  license:              "Licenca e transportit ndërkombëtar (CMR) ose leja e drejtimit të mjetit.",
  company_registration: "Certifikata e regjistrimit të kompanisë (Ekstrakti i ARBK).",
  insurance:            "Polica e sigurimit të mjetit dhe ngarkesës.",
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending:  "Në pritje",
  approved: "Aprovuar",
  rejected: "Refuzuar",
};

export const DOC_STATUS_COLORS: Record<DocStatus, string> = {
  pending:  "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

export const ALL_DOC_TYPES: DocType[] = [
  "license",
  "company_registration",
  "insurance",
];

export interface VerificationDocument {
  id: string;
  transporter_id: string;
  doc_type: DocType;
  file_path: string;
  file_name: string;
  status: DocStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
}
