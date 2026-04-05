import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEur(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "–";
  const num = parseFloat(String(value));
  if (isNaN(num)) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "–";
  // Parse YYYY-MM-DD without timezone shift
  const parts = String(dateStr).split("T")[0].split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  water_invoice: "Wasserrechnung",
  gas_invoice: "Gasrechnung",
  waste_invoice_evs: "Müll/EVS-Rechnung",
  maintenance_invoice: "Wartungsrechnung",
  chimney_sweep_invoice: "Schornsteinfeger",
  electricity_common_invoice: "Allgemeinstrom",
  rainwater_fee_invoice: "Niederschlagswasser",
  property_tax_notice: "Grundsteuerbescheid",
  insurance_invoice: "Gebäudeversicherung",
  contract: "Mietvertrag",
  meter_reading: "Ableseprotokoll",
  handover_protocol: "Übergabeprotokoll",
  house_rules: "Hausordnung",
  instruction: "Belehrung",
  ancillary_costs_notice: "Nebenkostenankündigung",
  other: "Sonstiges",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  uploaded: "Hochgeladen",
  ocr_processing: "OCR läuft...",
  ocr_done: "OCR fertig",
  ai_processing: "KI analysiert...",
  ai_extracted: "KI fertig (Prüfung ausstehend)",
  confirmed: "Bestätigt",
  rejected: "Abgelehnt",
};

export const METER_TYPE_LABELS: Record<string, string> = {
  water_apartment: "Wohnungswasserzähler",
  water_washer: "Waschmaschinenzähler",
  water_main: "Hauptwasserzähler",
  zenner_heat: "Wärmemengenzähler (Zenner)",
  gas_main: "Hausgaszähler",
  gas_apartment: "Gaszähler Eigentümer",
  electricity_common: "Allgemeinstrom",
};

export const COST_CATEGORY_LABELS: Record<string, string> = {
  water: "Wasserversorgung",
  gas: "Heizung / Gas",
  rainwater: "Niederschlagswasser",
  electricity_common: "Allgemeinstrom",
  property_tax: "Grundsteuer",
  insurance: "Gebäudeversicherung",
  maintenance: "Wartung",
  chimney_sweep: "Schornsteinfeger",
  heating_other: "Sonstige Heizungskosten",
  waste: "Müllentsorgung",
};
