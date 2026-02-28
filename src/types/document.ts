export type DocumentType = "cmr" | "fatura" | "lista_paketimit" | "prove_dorezimi" | "tjeter";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cmr:              "CMR",
  fatura:           "Faturë",
  lista_paketimit:  "Lista e Paketimit",
  prove_dorezimi:   "Provë e Dorëzimit",
  tjeter:           "Tjetër",
};

export interface ShipmentDocument {
  id: string;
  shipment_id: string;
  uploader_id: string;
  file_name: string;
  file_path: string;
  document_type: DocumentType;
  created_at: string;
}
