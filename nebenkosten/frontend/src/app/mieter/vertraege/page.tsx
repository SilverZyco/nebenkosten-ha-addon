"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { tenantApi, tenantRentalContractsApi, tenantRentIncreasesApi, tenantHouseDocumentsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Download, BookOpen, PenLine, X, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, TrendingUp, FolderOpen, FileText } from "lucide-react";
import toast from "react-hot-toast";

interface Document {
  id: string;
  original_filename: string;
  document_type: string;
  year: number | null;
  upload_date: string;
}

interface RentIncreaseNotice {
  id: string;
  apartment_code: string | null;
  apartment_name: string | null;
  old_monthly_rent: number;
  old_advance_payment: number;
  new_monthly_rent: number;
  new_advance_payment: number;
  effective_date: string;
  status: "sent" | "signed";
  tenant_signed_at: string | null;
  has_pdf: boolean;
}

interface RentalContract {
  id: string;
  apartment_code: string | null;
  apartment_name: string | null;
  apartment_area_sqm: number | null;
  tenant_name: string;
  start_date: string;
  monthly_rent: number;
  advance_payment: number;
  kitchen_fee: number | null;
  deposit: number;
  special_notes: string | null;
  contract_paragraphs: Record<string, string> | null;
  status: "sent" | "signed";
  tenant_signed_at: string | null;
  has_pdf: boolean;
}

interface HouseDoc {
  id: string;
  template_filename: string;
  title: string;
  document_text: string;
  apartment_label: string;
  tenant_name: string | null;
  status: "sent" | "signed";
  tenant_signed_at: string | null;
  has_pdf: boolean;
  created_at: string;
}

const FLOOR_LABELS: Record<string, string> = {
  EG: "Erdgeschoss",
  OG: "Obergeschoss",
  DG: "Dachgeschoss",
  DU: "Büro",
};

const PARA_TITLES: Record<string, string> = {
  p1: "§ 1 Mietgegenstand",
  p2: "§ 2 Mietzeit",
  p3: "§ 3 Miete",
  p4: "§ 4 Zahlungsweise",
  p5: "§ 5 Kaution",
  p6: "§ 6 Betriebskosten / Nebenkosten",
  p7: "§ 7 Schlüssel",
  p8: "§ 8 Schönheitsreparaturen",
  p9: "§ 9 Instandhaltung und Reparaturen",
  p10: "§ 10 Lüften und Heizen",
  p11: "§ 11 Tierhaltung",
  p12: "§ 12 Nichtraucher-Wohnung",
  p13: "§ 13 Untervermietung",
  p14: "§ 14 Garten und Gemeinschaftsflächen",
  p15: "§ 15 Rauchwarnmelder",
  p16: "§ 16 Hausordnung",
  p17: "§ 17 Kündigung",
  p18: "§ 18 Übergabe und Rückgabe",
  p19: "§ 19 Datenschutz",
  p20: "§ 20 Sondervereinbarungen",
};

function fmtEur(v: number) {
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function getFloorLabel(c: RentalContract) {
  return c.apartment_code
    ? FLOOR_LABELS[c.apartment_code] || c.apartment_name || c.apartment_code
    : c.apartment_name || "–";
}

// Generate default paragraph texts from contract data (client-side, for display only)
function buildDefaultParagraphs(c: RentalContract): Record<string, string> {
  const floorLabel = c.apartment_code
    ? (FLOOR_LABELS[c.apartment_code] || c.apartment_code)
    : "Wohnung";
  const areaStr = c.apartment_area_sqm ? `${c.apartment_area_sqm.toFixed(1)} m²` : "– m²";
  const startStr = formatDate(c.start_date);
  const rentStr = fmtEur(c.monthly_rent);
  const advStr = fmtEur(c.advance_payment);
  const kitchenStr = c.kitchen_fee ? fmtEur(c.kitchen_fee) : null;
  const totalWarm = c.monthly_rent + c.advance_payment + (c.kitchen_fee || 0);
  const totalStr = fmtEur(totalWarm);
  const depositStr = fmtEur(c.deposit);

  const kitchenPara = kitchenStr
    ? `Für die Mitbenutzung der Einbauküche wird ein gesondertes Entgelt von ${kitchenStr} monatlich vereinbart. Dieses Entgelt ist zusammen mit der Miete fällig.`
    : "Eine Einbauküche ist nicht Gegenstand dieses Mietvertrages.";

  return {
    p1: `Der Vermieter vermietet an den Mieter die Wohnung im ${floorLabel} des Hauses Nauwies 7, 66802 Überherrn. Die Wohnfläche beträgt ca. ${areaStr}. Zur Wohnung gehören: Flur, Wohnzimmer, Schlafzimmer, Küche, Bad/WC sowie ein Kellerabteil. Der Mieter ist berechtigt, den gemeinschaftlichen Garten und die Gemeinschaftsflächen mitzubenutzen.`,
    p2: `Das Mietverhältnis beginnt am ${startStr} und wird auf unbestimmte Zeit geschlossen. Eine Befristung ist nicht vereinbart.`,
    p3: `Die monatliche Kaltmiete beträgt ${rentStr}. Zusätzlich ist eine monatliche Vorauszahlung auf die Betriebskosten (Nebenkosten) in Höhe von ${advStr} zu entrichten. ${kitchenPara} Die Gesamtmiete beläuft sich somit auf ${totalStr} monatlich.`,
    p4: "Die Miete ist monatlich im Voraus, spätestens am 3. Werktag eines jeden Monats, auf das Konto des Vermieters zu überweisen. Der Verwendungszweck soll die Wohnungsbezeichnung und den Monat enthalten.",
    p5: `Der Mieter leistet eine Sicherheitskaution in Höhe von ${depositStr} (entspricht drei Monatskaltmieten). Die Kaution ist spätestens bei Beginn des Mietverhältnisses in voller Höhe zu entrichten.`,
    p6: "Der Mieter trägt anteilig die anfallenden Betriebskosten gemäß Betriebskostenverordnung (BetrKV). Hierzu zählen insbesondere: Wasser/Abwasser, Müllentsorgung, Gebäudeversicherung, Grundsteuer, Niederschlagswassergebühr, Allgemeinstrom sowie Schornsteinfegerkosten. Über die geleisteten Vorauszahlungen wird jährlich abgerechnet.",
    p7: "Der Mieter erhält die erforderlichen Schlüssel für Wohnungstür, Haustür und Keller. Bei Verlust eines Schlüssels trägt der Mieter die Kosten für die Wiederbeschaffung. Alle Schlüssel sind bei Auszug vollständig zurückzugeben.",
    p8: "Der Mieter ist verpflichtet, Schönheitsreparaturen während der Mietzeit nach Bedarf durchzuführen und die Wohnung bei Auszug in einem ordnungsgemäßen Zustand zurückzugeben.",
    p9: "Der Vermieter trägt die Kosten für die Instandhaltung der Mietsache, soweit nicht der Mieter die Schäden verursacht hat. Kleinreparaturen bis zu 100,00 € je Einzelreparatur, maximal 8 % der Jahresnettomiete, trägt der Mieter.",
    p10: "Der Mieter ist verpflichtet, die Wohnung angemessen zu lüften und zu heizen, um Feuchtigkeit und Schimmelbildung zu vermeiden. Mindestens dreimal täglich ist stoßzulüften.",
    p11: "Die Haltung von Kleintieren (z.B. Hamster, Vögel, Zierfische) ist gestattet. Die Haltung von Hunden und Katzen bedarf der ausdrücklichen schriftlichen Zustimmung des Vermieters.",
    p12: "In der Wohnung sowie in allen Gemeinschaftsflächen des Hauses ist das Rauchen nicht gestattet.",
    p13: "Eine Untervermietung der Wohnung oder von Teilen davon ist ohne vorherige schriftliche Zustimmung des Vermieters nicht zulässig.",
    p14: "Dem Mieter wird das Recht zur Mitbenutzung des Gartens und der Gemeinschaftsflächen eingeräumt. Die Nutzung erfolgt auf eigene Gefahr.",
    p15: "In der Wohnung sind Rauchwarnmelder installiert. Der Mieter ist verpflichtet, die Funktionsfähigkeit regelmäßig zu überprüfen. Das Entfernen oder Deaktivieren von Rauchwarnmeldern ist untersagt.",
    p16: "Der Mieter verpflichtet sich, die Hausordnung zu beachten. Mittagsruhe ist von 13:00 bis 15:00 Uhr, Nachtruhe von 22:00 bis 07:00 Uhr einzuhalten.",
    p17: "Das Mietverhältnis kann vom Mieter mit einer Frist von drei Monaten zum Monatsende schriftlich gekündigt werden.",
    p18: "Zu Beginn des Mietverhältnisses wird ein Übergabeprotokoll erstellt. Bei Beendigung ist die Wohnung besenrein zurückzugeben.",
    p19: "Der Vermieter verarbeitet personenbezogene Daten des Mieters ausschließlich zur Durchführung des Mietvertrages (Art. 6 Abs. 1 lit. b DSGVO).",
    p20: c.special_notes?.trim() || "Keine Sondervereinbarungen.",
  };
}

export default function TenantVertraege() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [rentIncreases, setRentIncreases] = useState<RentIncreaseNotice[]>([]);
  const [houseDocs, setHouseDocs] = useState<HouseDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Signing modal (rental contracts)
  const [signingContract, setSigningContract] = useState<RentalContract | null>(null);
  const [signing, setSigning] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showFullContract, setShowFullContract] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Signing modal (rent increases)
  const [signingIncrease, setSigningIncrease] = useState<RentIncreaseNotice | null>(null);
  const [signingIncSaving, setSigningIncSaving] = useState(false);
  const incCanvasRef = useRef<HTMLCanvasElement>(null);
  const [incIsDrawing, setIncIsDrawing] = useState(false);
  const [incHasSignature, setIncHasSignature] = useState(false);

  // Signing modal (house documents)
  const [signingHouseDoc, setSigningHouseDoc] = useState<HouseDoc | null>(null);
  const [signingHdSaving, setSigningHdSaving] = useState(false);
  const hdCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hdIsDrawing, setHdIsDrawing] = useState(false);
  const [hdHasSignature, setHdHasSignature] = useState(false);
  const [hdCheckboxStates, setHdCheckboxStates] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [docRes, contractRes, increaseRes, houseDocRes] = await Promise.all([
        tenantApi.listDocuments({ document_type: "contract" }),
        tenantRentalContractsApi.list(),
        tenantRentIncreasesApi.list(),
        tenantHouseDocumentsApi.list(),
      ]);
      setDocs(docRes.data);
      setContracts(contractRes.data);
      setRentIncreases(increaseRes.data);
      setHouseDocs(houseDocRes.data);
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a3a5c";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasSignature(true);
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setIsDrawing(false);
  }

  function fillWhite(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillWhite(canvas);
    setHasSignature(false);
  }

  function openSignModal(c: RentalContract) {
    setSigningContract(c);
    setHasSignature(false);
    setAgreedToTerms(false);
    setShowFullContract(false);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        fillWhite(canvas);
      }
    }, 50);
  }

  // ── Rent increase canvas functions ────────────────────────────────────────
  function getIncPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  }

  function startIncDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = incCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIncIsDrawing(true);
    const pos = getIncPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function drawInc(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!incIsDrawing) return;
    const canvas = incCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getIncPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a3a5c";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setIncHasSignature(true);
  }

  function endIncDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setIncIsDrawing(false);
  }

  function fillIncWhite(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function clearIncCanvas() {
    const canvas = incCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillIncWhite(canvas);
    setIncHasSignature(false);
  }

  function openIncSignModal(n: RentIncreaseNotice) {
    setSigningIncrease(n);
    setIncHasSignature(false);
    setTimeout(() => {
      const canvas = incCanvasRef.current;
      if (canvas) fillIncWhite(canvas);
    }, 50);
  }

  async function handleSignIncrease() {
    if (!signingIncrease || !incHasSignature) {
      toast.error("Bitte unterschreiben Sie zuerst");
      return;
    }
    const canvas = incCanvasRef.current;
    if (!canvas) return;
    const signatureB64 = canvas.toDataURL("image/jpeg", 0.95);
    setSigningIncSaving(true);
    try {
      await tenantRentIncreasesApi.sign(signingIncrease.id, signatureB64);
      toast.success("Mieterhöhung erfolgreich unterschrieben!");
      setSigningIncrease(null);
      load();
    } catch {
      toast.error("Unterschrift konnte nicht gespeichert werden");
    } finally {
      setSigningIncSaving(false);
    }
  }

  async function handleSign() {
    if (!signingContract || !hasSignature) {
      toast.error("Bitte unterschreiben Sie zuerst");
      return;
    }
    if (!agreedToTerms) {
      toast.error("Bitte bestätigen Sie, dass Sie den Vertrag gelesen haben");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureB64 = canvas.toDataURL("image/jpeg", 0.95);

    setSigning(true);
    try {
      await tenantRentalContractsApi.sign(signingContract.id, signatureB64);
      toast.success("Vertrag erfolgreich unterschrieben!");
      setSigningContract(null);
      load();
    } catch {
      toast.error("Unterschrift konnte nicht gespeichert werden");
    } finally {
      setSigning(false);
    }
  }

  function parseDocText(text: string): Array<{ type: "text"; content: string } | { type: "checkbox"; index: number; checked: boolean }> {
    const parts = text.split(/(\[[ x]\])/);
    const result: Array<{ type: "text"; content: string } | { type: "checkbox"; index: number; checked: boolean }> = [];
    let cbIdx = 0;
    parts.forEach((part) => {
      if (part === "[ ]" || part === "[x]") {
        result.push({ type: "checkbox", index: cbIdx++, checked: part === "[x]" });
      } else if (part) {
        result.push({ type: "text", content: part });
      }
    });
    return result;
  }

  function applyCheckboxes(text: string, states: Record<number, boolean>): string {
    let idx = 0;
    return text.replace(/\[([ x])\]/g, () => (states[idx++] ? "[x]" : "[ ]"));
  }

  async function handleSignHouseDoc() {
    const canvas = hdCanvasRef.current;
    if (!canvas || !hdHasSignature || !signingHouseDoc) return;
    const agreeBox = document.getElementById("hd-agree") as HTMLInputElement | null;
    if (agreeBox && !agreeBox.checked) { toast.error("Bitte bestätigen Sie, das Dokument gelesen zu haben"); return; }
    const signature = canvas.toDataURL("image/png");
    setSigningHdSaving(true);
    try {
      const updatedText = signingHouseDoc.document_text ? applyCheckboxes(signingHouseDoc.document_text, hdCheckboxStates) : undefined;
      await tenantHouseDocumentsApi.sign(signingHouseDoc.id, signature, updatedText);
      toast.success("Erfolgreich unterschrieben!");
      setSigningHouseDoc(null);
      load();
    } catch {
      toast.error("Fehler beim Speichern der Unterschrift");
    } finally {
      setSigningHdSaving(false);
    }
  }

  const docTypeLabel: Record<string, string> = {
    contract: "Mietvertrag",
    handover_protocol: "Übergabeprotokoll",
    house_rules: "Hausordnung",
    other: "Sonstiges",
  };

  const pendingContracts = contracts.filter((c) => c.status === "sent");
  const signedContracts = contracts.filter((c) => c.status === "signed");
  const pendingIncreases = rentIncreases.filter((n) => n.status === "sent");
  const signedIncreases = rentIncreases.filter((n) => n.status === "signed");
  const pendingHouseDocs = houseDocs.filter((h) => h.status === "sent");

  return (
    <>
      <Topbar title="Verträge & Hausunterlagen" subtitle="Ihre Verträge und Hausunterlagen" />

      <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-5">

        {/* ── Pending signature banner ──────────────────────────────────────── */}
        {!loading && pendingContracts.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span className="font-semibold text-amber-800">
                {pendingContracts.length === 1
                  ? "Ein Mietvertrag wartet auf Ihre Unterschrift"
                  : `${pendingContracts.length} Mietverträge warten auf Ihre Unterschrift`}
              </span>
            </div>
            {pendingContracts.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-lg border border-amber-200 mt-2 overflow-hidden"
              >
                <div className="flex items-start justify-between p-4 gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      Mietvertrag – {getFloorLabel(c)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Mietbeginn: {formatDate(c.start_date)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Kaltmiete: {fmtEur(c.monthly_rent)} · Kaution: {fmtEur(c.deposit)}
                    </div>
                  </div>
                  <button
                    onClick={() => openSignModal(c)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 font-medium shrink-0"
                  >
                    <PenLine className="w-4 h-4" />
                    <span className="hidden sm:inline">Unterschreiben</span>
                    <span className="sm:hidden">Sign</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pending house docs banner ─────────────────────────────────────── */}
        {!loading && pendingHouseDocs.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-xl p-4">
            <div className="flex items-start gap-2 mb-2">
              <FolderOpen className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <span className="font-semibold text-blue-800 dark:text-blue-300">
                {pendingHouseDocs.length === 1
                  ? "Eine Hausunterlage wartet auf Ihre Unterschrift"
                  : `${pendingHouseDocs.length} Hausunterlagen warten auf Ihre Unterschrift`}
              </span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-400 ml-7">
              Bitte scrollen Sie nach unten zu „Hausunterlagen" um zu unterschreiben.
            </p>
          </div>
        )}

        {/* ── Signed digital contracts ──────────────────────────────────────── */}
        {signedContracts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Unterzeichnete Mietverträge</h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {signedContracts.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between px-4 py-3 gap-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="font-medium text-sm truncate">
                        Mietvertrag – {getFloorLabel(c)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 ml-6">
                      Unterschrieben: {c.tenant_signed_at ? formatDate(c.tenant_signed_at) : "–"}
                    </div>
                  </div>
                  {c.has_pdf && (
                    <a
                      href={tenantRentalContractsApi.pdfUrl(c.id)}
                      target="_blank"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pending rent increase banner ──────────────────────────────────── */}
        {!loading && pendingIncreases.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <div className="flex items-start gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span className="font-semibold text-amber-800">
                {pendingIncreases.length === 1
                  ? "Eine Mieterhöhung wartet auf Ihre Unterschrift"
                  : `${pendingIncreases.length} Mieterhöhungen warten auf Ihre Unterschrift`}
              </span>
            </div>
            {pendingIncreases.map((n) => (
              <div key={n.id} className="bg-white rounded-lg border border-amber-200 mt-2 overflow-hidden">
                <div className="flex items-start justify-between p-4 gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      Mieterhöhung – {n.apartment_code ? (FLOOR_LABELS[n.apartment_code] || n.apartment_name) : n.apartment_name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Gültig ab: {formatDate(n.effective_date)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Neue Kaltmiete: {fmtEur(n.new_monthly_rent)} · NK-Vorauszahlung: {fmtEur(n.new_advance_payment)}
                    </div>
                  </div>
                  <button
                    onClick={() => openIncSignModal(n)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 font-medium shrink-0"
                  >
                    <PenLine className="w-4 h-4" />
                    <span className="hidden sm:inline">Unterschreiben</span>
                    <span className="sm:hidden">Sign</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Signed rent increases ──────────────────────────────────────────── */}
        {signedIncreases.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Unterzeichnete Mieterhöhungen</h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {signedIncreases.map((n, i) => (
                <div
                  key={n.id}
                  className={`flex items-center justify-between px-4 py-3 gap-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="font-medium text-sm truncate">
                        Mieterhöhung ab {formatDate(n.effective_date)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 ml-6">
                      Neu: {fmtEur(n.new_monthly_rent)} Kaltmiete · Unterschrieben: {n.tenant_signed_at ? formatDate(n.tenant_signed_at) : "–"}
                    </div>
                  </div>
                  {n.has_pdf && (
                    <a
                      href={tenantRentIncreasesApi.pdfUrl(n.id)}
                      target="_blank"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Uploaded documents ────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 && contracts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>Keine Vertragsunterlagen vorhanden</p>
            <p className="text-sm mt-1 text-gray-400">Wenden Sie sich an Ihren Vermieter</p>
          </div>
        ) : docs.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Dokumente</h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{d.original_filename}</div>
                      <div className="text-xs text-gray-500">{docTypeLabel[d.document_type] || d.document_type} · {formatDate(d.upload_date)}</div>
                    </div>
                    <a
                      href={tenantApi.downloadDocumentUrl(d.id)}
                      target="_blank"
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-700 border border-gray-300 rounded-lg hover:bg-gray-50 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <table className="hidden md:table w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Dokument</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Typ</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Hochgeladen</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{d.original_filename}</td>
                      <td className="px-4 py-3 text-gray-500">{docTypeLabel[d.document_type] || d.document_type}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(d.upload_date)}</td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={tenantApi.downloadDocumentUrl(d.id)}
                          target="_blank"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* ── Hausunterlagen ────────────────────────────────────────────────── */}
        {houseDocs.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-blue-500" />
              Hausunterlagen
            </h3>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {houseDocs.map((hd, i) => (
                <div
                  key={hd.id}
                  className={`flex items-center justify-between px-4 py-3 gap-3 ${i > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="font-medium text-sm text-gray-900 dark:text-white">{hd.title}</span>
                      {hd.status === "signed" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Unterschrieben
                        </span>
                      )}
                      {hd.status === "sent" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          Unterschrift ausstehend
                        </span>
                      )}
                    </div>
                    {hd.tenant_signed_at && (
                      <div className="text-xs text-gray-400 mt-0.5 ml-6">
                        Unterzeichnet am {formatDate(hd.tenant_signed_at)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Sign */}
                    {hd.status === "sent" && (
                      <button
                        onClick={() => {
                          setSigningHouseDoc(hd);
                          setHdHasSignature(false);
                          // Pre-populate from already-checked [x] items
                          const states: Record<number, boolean> = {};
                          let i = 0;
                          for (const match of hd.document_text.matchAll(/\[([ x])\]/g)) {
                            states[i++] = match[1] === "x";
                          }
                          setHdCheckboxStates(states);
                          setTimeout(() => {
                            const canvas = hdCanvasRef.current;
                            if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
                          }, 50);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium"
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        Unterschreiben
                      </button>
                    )}
                    {/* PDF download */}
                    {hd.has_pdf && (
                      <a
                        href={tenantHouseDocumentsApi.pdfUrl(hd.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Rent Increase Signature Modal ────────────────────────────────── */}
      {signingIncrease && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4 md:my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">Mieterhöhung unterschreiben</h2>
              <button onClick={() => setSigningIncrease(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="text-gray-500">Gültig ab:</span>{" "}
                  <strong>{formatDate(signingIncrease.effective_date)}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Wohnung:</span>{" "}
                  <strong>
                    {signingIncrease.apartment_code
                      ? (FLOOR_LABELS[signingIncrease.apartment_code] || signingIncrease.apartment_name)
                      : signingIncrease.apartment_name}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-500">Bisherige Kaltmiete:</span>{" "}
                  <strong>{fmtEur(signingIncrease.old_monthly_rent)}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Neue Kaltmiete:</span>{" "}
                  <strong className="text-blue-700">{fmtEur(signingIncrease.new_monthly_rent)}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Bisherige NK-Vorauszahlung:</span>{" "}
                  <strong>{fmtEur(signingIncrease.old_advance_payment)}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Neue NK-Vorauszahlung:</span>{" "}
                  <strong className="text-blue-700">{fmtEur(signingIncrease.new_advance_payment)}</strong>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 bg-amber-50 border-b border-gray-200">
              <p className="text-sm text-gray-700">
                Mit Ihrer Unterschrift bestätigen Sie Ihr Einverständnis mit der Mieterhöhung
                gemäß § 558 BGB. Die neue Miete gilt ab dem angegebenen Datum.
              </p>
            </div>

            <div className="px-5 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Ihre Unterschrift
                  <span className="text-xs text-gray-400 ml-2">(mit Finger oder Maus zeichnen)</span>
                </label>
                <button onClick={clearIncCanvas} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                  Löschen
                </button>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 touch-none">
                <canvas
                  ref={incCanvasRef}
                  width={600}
                  height={200}
                  className="w-full rounded-lg cursor-crosshair"
                  style={{ height: "160px", background: "white" }}
                  onMouseDown={startIncDraw}
                  onMouseMove={drawInc}
                  onMouseUp={endIncDraw}
                  onMouseLeave={endIncDraw}
                  onTouchStart={startIncDraw}
                  onTouchMove={drawInc}
                  onTouchEnd={endIncDraw}
                />
              </div>
              {!incHasSignature && (
                <p className="text-xs text-gray-400 mt-1 text-center">
                  Bitte zeichnen Sie Ihre Unterschrift in das Feld oben
                </p>
              )}
            </div>

            <div className="px-5 py-4 flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setSigningIncrease(null)}
                className="order-2 sm:order-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSignIncrease}
                disabled={signingIncSaving || !incHasSignature}
                className="order-1 sm:order-2 flex items-center justify-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                <CheckCircle2 className="w-4 h-4" />
                {signingIncSaving ? "Speichern…" : "Verbindlich unterschreiben"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Signature Modal ───────────────────────────────────────────────── */}
      {signingContract && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4 md:my-8">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">Mietvertrag unterschreiben</h2>
              <button
                onClick={() => setSigningContract(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contract summary */}
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="text-gray-500">Wohnung:</span>{" "}
                  <strong>{getFloorLabel(signingContract)}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Mietbeginn:</span>{" "}
                  <strong>{formatDate(signingContract.start_date)}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Kaltmiete:</span>{" "}
                  <strong>{fmtEur(signingContract.monthly_rent)}</strong>
                </div>
                <div>
                  <span className="text-gray-500">NK-Vorauszahlung:</span>{" "}
                  <strong>{fmtEur(signingContract.advance_payment)}</strong>
                </div>
                {signingContract.kitchen_fee && (
                  <div>
                    <span className="text-gray-500">Küchenentgelt:</span>{" "}
                    <strong>{fmtEur(signingContract.kitchen_fee)}</strong>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Kaution:</span>{" "}
                  <strong>{fmtEur(signingContract.deposit)}</strong>
                </div>
              </div>
            </div>

            {/* Full contract text toggle */}
            <div className="border-b border-gray-200">
              <button
                type="button"
                onClick={() => setShowFullContract(!showFullContract)}
                className="flex items-center justify-between w-full px-5 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium">
                  {showFullContract ? "Vertragstext ausblenden" : "Alle 20 §§ anzeigen"}
                </span>
                {showFullContract ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {showFullContract && (
                <div className="px-5 pb-4 max-h-72 overflow-y-auto bg-gray-50 space-y-4 text-sm">
                  <div className="pt-3 pb-2 border-b border-gray-200">
                    <p className="font-semibold text-brand-900 text-base">Wohnraummietvertrag</p>
                    <p className="text-xs text-gray-500">Vermieter: Alexander Klingel, Nauwies 7, 66802 Überherrn</p>
                  </div>
                  {(() => {
                    const paras = signingContract.contract_paragraphs || buildDefaultParagraphs(signingContract);
                    return Object.entries(PARA_TITLES).map(([key, title]) => {
                      const text = paras[key];
                      if (!text) return null;
                      return (
                        <div key={key}>
                          <p className="font-semibold text-gray-800 mb-0.5">{title}</p>
                          <p className="text-gray-600 leading-relaxed">{text}</p>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Agreement checkbox */}
            <div className="px-5 py-4 border-b border-gray-200 bg-amber-50">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-700 shrink-0"
                />
                <span className="text-sm text-gray-700">
                  Ich habe den vollständigen Mietvertrag gelesen und bin mit allen Bedingungen einverstanden.
                  Mit meiner Unterschrift erkläre ich mich rechtsverbindlich damit einverstanden.
                </span>
              </label>
            </div>

            {/* Signature canvas */}
            <div className="px-5 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Ihre Unterschrift
                  <span className="text-xs text-gray-400 ml-2">(mit Finger oder Maus zeichnen)</span>
                </label>
                <button
                  onClick={clearCanvas}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Löschen
                </button>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 touch-none">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="w-full rounded-lg cursor-crosshair"
                  style={{ height: "160px", background: "white" }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
              </div>
              {!hasSignature && (
                <p className="text-xs text-gray-400 mt-1 text-center">
                  Bitte zeichnen Sie Ihre Unterschrift in das Feld oben
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setSigningContract(null)}
                className="order-2 sm:order-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSign}
                disabled={signing || !hasSignature || !agreedToTerms}
                className="order-1 sm:order-2 flex items-center justify-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                <CheckCircle2 className="w-4 h-4" />
                {signing ? "Speichern…" : "Verbindlich unterschreiben"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── House Document Signature Modal ────────────────────────────────── */}
      {signingHouseDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Hausunterlage unterschreiben</h2>
              <button onClick={() => setSigningHouseDoc(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-52 overflow-y-auto">
                <p className="font-semibold text-sm text-gray-900 dark:text-white mb-2">{signingHouseDoc.title}</p>
                {signingHouseDoc.document_text ? (
                  <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {parseDocText(signingHouseDoc.document_text).map((seg, i) =>
                      seg.type === "text" ? (
                        <span key={i}>{seg.content}</span>
                      ) : (
                        <input
                          key={i}
                          type="checkbox"
                          checked={hdCheckboxStates[seg.index] !== undefined ? hdCheckboxStates[seg.index] : seg.checked}
                          onChange={(e) => setHdCheckboxStates(prev => ({ ...prev, [seg.index]: e.target.checked }))}
                          className="w-3.5 h-3.5 align-middle accent-blue-600 cursor-pointer mx-0.5"
                        />
                      )
                    )}
                  </pre>
                ) : (
                  <p className="text-xs text-gray-400">Bitte lesen Sie das Dokument sorgfältig durch.</p>
                )}
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" id="hd-agree" className="mt-0.5 w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Ich habe das Dokument vollständig gelesen und verstanden.
                </span>
              </label>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ihre Unterschrift:</p>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 touch-none">
                  <canvas
                    ref={hdCanvasRef}
                    width={600}
                    height={150}
                    className="w-full h-36 cursor-crosshair rounded-lg"
                    style={{ background: "white" }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const canvas = hdCanvasRef.current;
                      if (!canvas) return;
                      setHdIsDrawing(true);
                      const rect = canvas.getBoundingClientRect();
                      const ctx = canvas.getContext("2d");
                      if (ctx) ctx.beginPath(), ctx.moveTo((e.clientX - rect.left) * canvas.width / rect.width, (e.clientY - rect.top) * canvas.height / rect.height);
                    }}
                    onMouseMove={(e) => {
                      if (!hdIsDrawing) return;
                      e.preventDefault();
                      const canvas = hdCanvasRef.current;
                      if (!canvas) return;
                      const rect = canvas.getBoundingClientRect();
                      const ctx = canvas.getContext("2d");
                      if (!ctx) return;
                      ctx.lineTo((e.clientX - rect.left) * canvas.width / rect.width, (e.clientY - rect.top) * canvas.height / rect.height);
                      ctx.strokeStyle = "#1e293b";
                      ctx.lineWidth = 2;
                      ctx.lineCap = "round";
                      ctx.stroke();
                      setHdHasSignature(true);
                    }}
                    onMouseUp={() => setHdIsDrawing(false)}
                    onMouseLeave={() => setHdIsDrawing(false)}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      const canvas = hdCanvasRef.current;
                      if (!canvas) return;
                      setHdIsDrawing(true);
                      const rect = canvas.getBoundingClientRect();
                      const ctx = canvas.getContext("2d");
                      const t = e.touches[0];
                      if (ctx) ctx.beginPath(), ctx.moveTo((t.clientX - rect.left) * canvas.width / rect.width, (t.clientY - rect.top) * canvas.height / rect.height);
                    }}
                    onTouchMove={(e) => {
                      if (!hdIsDrawing) return;
                      e.preventDefault();
                      const canvas = hdCanvasRef.current;
                      if (!canvas) return;
                      const rect = canvas.getBoundingClientRect();
                      const ctx = canvas.getContext("2d");
                      const t = e.touches[0];
                      if (!ctx) return;
                      ctx.lineTo((t.clientX - rect.left) * canvas.width / rect.width, (t.clientY - rect.top) * canvas.height / rect.height);
                      ctx.strokeStyle = "#1e293b";
                      ctx.lineWidth = 2;
                      ctx.lineCap = "round";
                      ctx.stroke();
                      setHdHasSignature(true);
                    }}
                    onTouchEnd={() => setHdIsDrawing(false)}
                  />
                </div>
                <button
                  onClick={() => {
                    const canvas = hdCanvasRef.current;
                    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
                    setHdHasSignature(false);
                  }}
                  className="mt-1 text-xs text-gray-400 hover:text-red-500 underline"
                >
                  Unterschrift löschen
                </button>
              </div>
            </div>
            <div className="px-5 py-4 flex flex-col sm:flex-row justify-end gap-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSigningHouseDoc(null)}
                className="order-2 sm:order-1 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSignHouseDoc}
                disabled={signingHdSaving || !hdHasSignature}
                className="order-1 sm:order-2 flex items-center justify-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                <CheckCircle2 className="w-4 h-4" />
                {signingHdSaving ? "Speichern…" : "Verbindlich unterschreiben"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
