import Badge from "./Badge";
import { DOCUMENT_STATUS_LABELS } from "@/lib/utils";

type BadgeVariant = "blue" | "green" | "yellow" | "red" | "orange" | "gray" | "brand";

// Document status → badge variant
const DOCUMENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  uploaded:       "gray",
  ocr_processing: "yellow",
  ocr_done:       "blue",
  ai_processing:  "yellow",
  ai_extracted:   "orange",
  confirmed:      "green",
  rejected:       "red",
};

// Contract status → badge variant + label
const CONTRACT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT:  "gray",
  SENT:   "blue",
  SIGNED: "green",
};
const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT:  "Entwurf",
  SENT:   "Versendet",
  SIGNED: "Unterschrieben",
};

// Meter reading status → badge variant + label
const READING_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  estimated: "yellow",
  measured:  "green",
  submitted: "blue",
};
const READING_STATUS_LABELS: Record<string, string> = {
  estimated: "Geschätzt",
  measured:  "Gemessen",
  submitted: "Eingereicht",
};

interface StatusBadgeProps {
  status: string;
  type: "document" | "contract" | "reading";
  size?: "sm" | "md";
}

export default function StatusBadge({ status, type, size = "md" }: StatusBadgeProps) {
  let variant: BadgeVariant = "gray";
  let label = status;

  if (type === "document") {
    variant = DOCUMENT_STATUS_VARIANTS[status] ?? "gray";
    label = DOCUMENT_STATUS_LABELS[status] ?? status;
  } else if (type === "contract") {
    variant = CONTRACT_STATUS_VARIANTS[status] ?? "gray";
    label = CONTRACT_STATUS_LABELS[status] ?? status;
  } else if (type === "reading") {
    variant = READING_STATUS_VARIANTS[status] ?? "gray";
    label = READING_STATUS_LABELS[status] ?? status;
  }

  return (
    <Badge variant={variant} size={size}>
      {label}
    </Badge>
  );
}
