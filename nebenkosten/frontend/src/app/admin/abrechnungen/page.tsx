"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { billingApi } from "@/lib/api";
import { formatEur } from "@/lib/utils";
import toast from "react-hot-toast";
import { Calculator, FileText, CheckCircle, AlertTriangle, Download, Send, RefreshCw, XCircle, Info, ExternalLink, Receipt } from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

interface PreflightCheck {
  key: string;
  label: string;
  status: "ok" | "warning" | "error" | "info";
  detail: string;
  link: string;
}

interface PreflightResult {
  year: number;
  checks: PreflightCheck[];
  can_calculate: boolean;
  error_count: number;
  warning_count: number;
}

interface BillingPeriod {
  id: string;
  year: number;
  status: string;
  warnings: string[] | null;
  generated_at: string | null;
}

interface ApartmentBilling {
  id: string;
  billing_period_id: string;
  apartment_id: string;
  apartment_code: string | null;
  tenant_name: string | null;
  total_costs: string;
  advance_payments: string;
  balance: string;
  cost_breakdown: Record<string, unknown> | null;
  is_released: boolean;
  pdf_filename: string | null;
  year: number | null;
  tenancy_start: string | null;
  tenancy_end: string | null;
  receipt_filename: string | null;
}

const COST_LABELS: Record<string, string> = {
  water: "Wasser",
  gas: "Heizung/Gas",
  rainwater: "Niederschlagswasser",
  electricity_common: "Allgemeinstrom",
  property_tax: "Grundsteuer",
  insurance: "Gebäudeversicherung",
  maintenance: "Wartung",
  chimney_sweep: "Schornsteinfeger",
  waste: "Müll (EVS)",
};

export default function AbrechnungenPage() {
  const searchParams = useSearchParams();
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<BillingPeriod | null>(null);
  const [apartmentBillings, setApartmentBillings] = useState<ApartmentBilling[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const currentYear = new Date().getFullYear();
  const [calcYear, setCalcYear] = useState(String(currentYear));
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [releaseConfirmAb, setReleaseConfirmAb] = useState<ApartmentBilling | null>(null);
  const [receiptAb, setReceiptAb] = useState<ApartmentBilling | null>(null);
  const [receiptMethod, setReceiptMethod] = useState<"bar" | "ueberweisung">("bar");
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptSig, setReceiptSig] = useState(false);
  const [receiptHasSig, setReceiptHasSig] = useState(false);
  const [receiptGenerating, setReceiptGenerating] = useState(false);
  const receiptCanvasRef = useRef<HTMLCanvasElement>(null);
  const [receiptDrawing, setReceiptDrawing] = useState(false);

  const runPreflight = useCallback(async (year: string) => {
    setPreflightLoading(true);
    try {
      const res = await billingApi.preflight(parseInt(year));
      setPreflight(res.data);
    } catch {
      setPreflight(null);
    } finally {
      setPreflightLoading(false);
    }
  }, []);

  useEffect(() => {
    billingApi.list().then((res) => {
      setPeriods(res.data);
      const yearParam = searchParams.get("year");
      if (yearParam) {
        const p = res.data.find((p: BillingPeriod) => p.year === parseInt(yearParam));
        if (p) selectPeriod(p);
      }
    });
    runPreflight(calcYear);
  }, []); // eslint-disable-line

  const selectPeriod = async (period: BillingPeriod) => {
    setSelectedPeriod(period);
    setLoading(true);
    try {
      const res = await billingApi.listApartments(period.id);
      setApartmentBillings(res.data);
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  const calculate = async () => {
    setCalculating(true);
    try {
      const res = await billingApi.calculate(parseInt(calcYear));
      toast.success(`Abrechnung ${calcYear} berechnet`);
      const periods_res = await billingApi.list();
      setPeriods(periods_res.data);
      await selectPeriod(res.data);
      await runPreflight(calcYear);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler bei Berechnung";
      toast.error(msg);
    } finally {
      setCalculating(false);
    }
  };

  const generatePdf = async (ab: ApartmentBilling) => {
    try {
      await billingApi.generatePdf(ab.billing_period_id, ab.id);
      toast.success("PDF erstellt");
      if (selectedPeriod) await selectPeriod(selectedPeriod);
    } catch {
      toast.error("PDF-Fehler");
    }
  };

  const release = async (ab: ApartmentBilling) => {
    try {
      await billingApi.release(ab.billing_period_id, ab.id);
      toast.success("Abrechnung freigegeben – Mieter kann sie jetzt einsehen");
      setReleaseConfirmAb(null);
      if (selectedPeriod) await selectPeriod(selectedPeriod);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler";
      toast.error(msg);
    }
  };

  const generateReceipt = async () => {
    if (!receiptAb) return;
    setReceiptGenerating(true);
    try {
      let signature: string | null = null;
      if (receiptSig && receiptHasSig && receiptCanvasRef.current) {
        signature = receiptCanvasRef.current.toDataURL("image/png");
      }
      const res = await billingApi.generateReceipt(receiptAb.billing_period_id, receiptAb.id, {
        payment_method: receiptMethod,
        payment_date: receiptDate,
        notes: receiptNotes,
        signature,
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quittung_${receiptAb.year || ""}_${receiptAb.apartment_code || "apt"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Quittung erstellt");
      setReceiptAb(null);
      if (selectedPeriod) await selectPeriod(selectedPeriod);
    } catch {
      toast.error("Fehler beim Erstellen der Quittung");
    } finally {
      setReceiptGenerating(false);
    }
  };

  const errorCount = preflight?.error_count ?? 0;
  const warningCount = preflight?.warning_count ?? 0;

  return (
    <>
      <div className="p-6 space-y-5 flex-1 overflow-y-auto">
        <PageHeader
          title="Abrechnungen"
          subtitle="Nebenkostenabrechnung berechnen, prüfen und für Mieter freigeben"
          actions={
            <a
              href={billingApi.demoPdfUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              <FileText className="w-4 h-4" />
              Demo-PDF ansehen
            </a>
          }
        />

        {/* Calculate New */}
        <Card className="p-6">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Neue Abrechnung berechnen</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Wähle das Abrechnungsjahr und prüfe, ob alle Pflichtdaten vorhanden sind. Erst wenn die Datenprüfung keine Fehler zeigt, kann die Abrechnung gestartet werden.
          </p>

          <div className="flex items-end gap-4 mb-6">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Abrechnungsjahr</label>
              <select
                value={calcYear}
                onChange={(e) => { setCalcYear(e.target.value); runPreflight(e.target.value); }}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button
              onClick={calculate}
              disabled={calculating || errorCount > 0}
              className="flex items-center gap-2 bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={errorCount > 0 ? "Bitte zuerst alle Fehler beheben" : ""}
            >
              {calculating ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Calculator className="w-4 h-4" />
              )}
              Jetzt berechnen
            </button>
            <button
              onClick={() => runPreflight(calcYear)}
              disabled={preflightLoading}
              className="flex items-center gap-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 rounded-lg text-sm disabled:opacity-50"
              title="Datenprüfung neu laden"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${preflightLoading ? "animate-spin" : ""}`} />
              Prüfen
            </button>
          </div>

          {/* Preflight checklist */}
          {preflightLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
              <span className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-brand-500 rounded-full animate-spin" />
              Daten werden geprüft…
            </div>
          )}

          {preflight && preflight.year === parseInt(calcYear) && !preflightLoading && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Summary bar */}
              <div className={`px-4 py-3 flex items-center justify-between text-sm font-medium border-b ${
                errorCount > 0
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
                  : warningCount > 0
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                  : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
              }`}>
                <span className="flex items-center gap-2">
                  {errorCount === 0 && warningCount === 0 ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : errorCount > 0 ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  Datenprüfung für {preflight.year}
                </span>
                <span className="flex gap-2 text-xs">
                  {errorCount > 0 && (
                    <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                      {errorCount} Fehler – Abrechnung gesperrt
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                      {warningCount} Warnungen
                    </span>
                  )}
                  {errorCount === 0 && warningCount === 0 && (
                    <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">Alles bereit</span>
                  )}
                </span>
              </div>

              {/* Check rows */}
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {preflight.checks.map((c) => (
                  <div key={c.key} className={`flex items-start gap-3 px-4 py-3 text-sm ${c.status === "info" ? "opacity-60" : ""}`}>
                    <div className="mt-0.5 shrink-0">
                      {c.status === "ok"      && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {c.status === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      {c.status === "error"   && <XCircle className="w-4 h-4 text-red-500" />}
                      {c.status === "info"    && <Info className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{c.label}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className={
                        c.status === "error" ? "text-red-600 dark:text-red-400" :
                        c.status === "warning" ? "text-amber-700 dark:text-amber-400" :
                        c.status === "ok" ? "text-green-700 dark:text-green-400" : "text-gray-400 dark:text-gray-500"
                      }>{c.detail}</span>
                    </div>
                    {c.link && c.status !== "ok" && c.status !== "info" && (
                      <Link
                        href={c.link}
                        className="shrink-0 text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 flex items-center gap-0.5 text-xs whitespace-nowrap"
                      >
                        Beheben <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Period List */}
        {periods.length > 0 && (
          <Card>
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Berechnete Abrechnungen</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Klicke auf eine Zeile um die Wohnungsabrechnungen anzuzeigen</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jahr</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Warnungen</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {periods.map((p) => (
                    <tr
                      key={p.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${selectedPeriod?.id === p.id ? "bg-blue-50 dark:bg-blue-900/10" : ""}`}
                      onClick={() => selectPeriod(p)}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{p.year}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === "finalized" ? "green" : p.status === "calculated" ? "blue" : "gray"}>
                          {p.status === "calculated" ? "Berechnet" : p.status === "finalized" ? "Finalisiert" : p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {p.warnings && p.warnings.length > 0 ? (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {p.warnings.length} Warnung(en)
                          </span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400 text-xs flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-brand-600 dark:text-brand-400 font-medium">
                        Details anzeigen →
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Warnings */}
        {selectedPeriod?.warnings && selectedPeriod.warnings.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">Warnungen bei der Berechnung</p>
                <ul className="mt-1 space-y-1">
                  {selectedPeriod.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-700 dark:text-amber-400">• {w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Apartment Billings */}
        {selectedPeriod && (
          <Card>
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                  Wohnungsabrechnungen {selectedPeriod.year}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Erstelle zuerst das PDF, dann gib die Abrechnung für den Mieter frei. Eine freigegebene Abrechnung kann nicht mehr geändert werden.
                </p>
              </div>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wohnung</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mieter</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nebenkosten</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vorauszahl.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Saldo</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {apartmentBillings.map((ab) => {
                      const balance = parseFloat(ab.balance);
                      return (
                        <tr key={ab.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3">
                            <span className="font-bold text-brand-700 dark:text-brand-400">{ab.apartment_code}</span>
                            {(ab.tenancy_start || ab.tenancy_end) && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 font-normal mt-0.5">
                                {ab.tenancy_start ? formatDate(ab.tenancy_start) : "?"} – {ab.tenancy_end ? formatDate(ab.tenancy_end) : "aktuell"}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{ab.tenant_name || "–"}</td>
                          <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{formatEur(ab.total_costs)}</td>
                          <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{formatEur(ab.advance_payments)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${balance > 0 ? "text-red-600 dark:text-red-400" : balance < 0 ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}>
                            {balance > 0 ? "+" : ""}{formatEur(ab.balance)}
                            <span className="text-xs font-normal ml-1 opacity-75">
                              {balance > 0 ? "Nachzahlung" : balance < 0 ? "Erstattung" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {ab.is_released ? (
                              <Badge variant="green">Freigegeben</Badge>
                            ) : (
                              <Badge variant="gray">Ausstehend</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => generatePdf(ab)}
                                title="PDF generieren"
                                className="p-2 text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              {ab.pdf_filename && (
                                <a
                                  href={billingApi.pdfUrl(ab.billing_period_id, ab.id)}
                                  target="_blank"
                                  title="PDF herunterladen"
                                  className="p-2 text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                              {!ab.is_released && (
                                <button
                                  onClick={() => setReleaseConfirmAb(ab)}
                                  title="Für Mieter freigeben"
                                  className="p-2 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setReceiptAb(ab);
                                  setReceiptMethod("bar");
                                  setReceiptDate(new Date().toISOString().split("T")[0]);
                                  setReceiptNotes("");
                                  setReceiptSig(false);
                                  setReceiptHasSig(false);
                                  setTimeout(() => {
                                    receiptCanvasRef.current?.getContext("2d")?.clearRect(0, 0, 700, 160);
                                  }, 50);
                                }}
                                title="Quittung erstellen"
                                className="p-2 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                              >
                                <Receipt className="w-4 h-4" />
                              </button>
                              {ab.receipt_filename && (
                                <a
                                  href={billingApi.receiptUrl(ab.billing_period_id, ab.id)}
                                  target="_blank"
                                  title="Quittung herunterladen"
                                  className="p-2 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                  <Receipt className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Cost Breakdown */}
                {apartmentBillings.some(ab => ab.cost_breakdown) && (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-700">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                        Kostenaufschlüsselung anzeigen
                      </summary>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Kostenart</th>
                              {apartmentBillings.map(ab => (
                                <th key={ab.id} className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">{ab.apartment_code}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(COST_LABELS).map((cat) => (
                              <tr key={cat} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{COST_LABELS[cat]}</td>
                                {apartmentBillings.map(ab => {
                                  type WasteEmp = { count?: number; price_per_emptying?: number; amount?: number; description?: string };
                                  type WasteLine = { description: string; amount: string; bin_id?: string; bin_size?: string; std_count?: number; extra_count?: number; total_emptyings?: number; emptyings?: WasteEmp[]; extra_emptyings?: WasteEmp[]; share_n?: number };
                                  const bd = ab.cost_breakdown as Record<string, {cost: string; lines?: WasteLine[]}> | null;
                                  const catData = bd?.[cat];
                                  const val = catData?.cost;
                                  const wasteLines = cat === "waste" ? (catData?.lines ?? []) : [];
                                  return (
                                    <td key={ab.id} className="px-3 py-1.5 text-right font-mono align-top text-gray-900 dark:text-gray-100">
                                      {val ? formatEur(val) : "–"}
                                      {wasteLines.length > 0 && (
                                        <div className="text-left font-sans mt-1 space-y-2">
                                          {wasteLines.map((wl, i) => {
                                            const shareN = wl.share_n ?? 1;
                                            return (
                                              <div key={i} className="text-xs border-l-2 border-gray-200 dark:border-gray-600 pl-2">
                                                <div className="font-semibold text-gray-700 dark:text-gray-300">
                                                  Tonne {wl.bin_id}{wl.bin_size ? ` (${wl.bin_size})` : ""}{shareN > 1 ? ` – 1/${shareN} Anteil` : ""}
                                                </div>
                                                {(wl.emptyings ?? []).map((emp, j) => (
                                                  <div key={j} className="text-gray-500 dark:text-gray-400">
                                                    {emp.description || "Standardleerung"}: {emp.count}×
                                                    {emp.price_per_emptying && shareN === 1 ? ` à ${formatEur(emp.price_per_emptying)} = ${formatEur(emp.amount ?? 0)}` : ""}
                                                  </div>
                                                ))}
                                                {(wl.extra_emptyings ?? []).map((emp, j) => (
                                                  <div key={j} className="text-gray-500 dark:text-gray-400">
                                                    {emp.description || "Zusatzleerung"}: {emp.count}×
                                                    {emp.amount && shareN === 1 ? ` = ${formatEur(emp.amount)}` : ""}
                                                  </div>
                                                ))}
                                                {(wl.total_emptyings ?? 0) > 0 && (
                                                  <div className="font-medium text-gray-700 dark:text-gray-300">
                                                    Gesamt: {wl.total_emptyings} Leerung{wl.total_emptyings !== 1 ? "en" : ""} = {formatEur(wl.amount)}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Release Confirmation Modal */}
      <Modal
        open={!!releaseConfirmAb}
        onClose={() => setReleaseConfirmAb(null)}
        title="Abrechnung freigeben"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setReleaseConfirmAb(null)}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Abbrechen
            </button>
            <button
              onClick={() => releaseConfirmAb && release(releaseConfirmAb)}
              className="flex items-center gap-2 bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              Jetzt freigeben
            </button>
          </>
        }
      >
        {releaseConfirmAb && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <strong>Achtung:</strong> Nach der Freigabe kann die Abrechnung nicht mehr geändert werden. Der Mieter kann sie sofort einsehen.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <Receipt className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">Wohnung {releaseConfirmAb.apartment_code}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Mieter: {releaseConfirmAb.tenant_name || "–"} ·{" "}
                  Saldo: <span className={parseFloat(releaseConfirmAb.balance) > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-green-600 dark:text-green-400 font-semibold"}>
                    {parseFloat(releaseConfirmAb.balance) > 0 ? "+" : ""}{formatEur(releaseConfirmAb.balance)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Receipt Modal ────────────────────────────────────────────────── */}
      {receiptAb && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-lg my-8 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-500" />
                Quittung erstellen
              </h2>
              <button onClick={() => setReceiptAb(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Summary */}
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 space-y-1 text-sm">
              <div className="font-semibold text-gray-900 dark:text-white">
                Wohnung {receiptAb.apartment_code} · {receiptAb.year}
              </div>
              <div className="text-gray-500">{receiptAb.tenant_name || "–"}</div>
              <div className="flex gap-4 pt-1 text-xs">
                <span>Kosten: <b>{formatEur(receiptAb.total_costs)}</b></span>
                <span>Vorauszahlung: <b>{formatEur(receiptAb.advance_payments)}</b></span>
                <span className={parseFloat(receiptAb.balance) > 0 ? "text-red-600 font-bold" : parseFloat(receiptAb.balance) < 0 ? "text-green-600 font-bold" : ""}>
                  Saldo: {parseFloat(receiptAb.balance) > 0 ? "+" : ""}{formatEur(receiptAb.balance)}
                  {parseFloat(receiptAb.balance) > 0 ? " (Nachzahlung)" : parseFloat(receiptAb.balance) < 0 ? " (Erstattung)" : ""}
                </span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Payment method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zahlungsart</label>
                <div className="flex gap-3">
                  {(["bar", "ueberweisung"] as const).map((m) => (
                    <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" value={m} checked={receiptMethod === m}
                        onChange={() => setReceiptMethod(m)} className="accent-purple-600" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {m === "bar" ? "Barzahlung" : "Überweisung"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zahlungsdatum</label>
                <input
                  type="date" value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hinweis (optional)</label>
                <input
                  type="text" value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="z.B. Quittungsnr. 123..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Signature toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={receiptSig} onChange={(e) => setReceiptSig(e.target.checked)}
                    className="w-4 h-4 accent-purple-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Unterschrift auf Quittung (optional)</span>
                </label>
              </div>

              {receiptSig && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unterschrift Vermieter:</p>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 touch-none">
                    <canvas
                      ref={receiptCanvasRef}
                      width={700} height={160}
                      className="w-full h-32 cursor-crosshair rounded-lg"
                      style={{ background: "white" }}
                      onMouseDown={(e) => {
                        const c = receiptCanvasRef.current; if (!c) return;
                        setReceiptDrawing(true);
                        const r = c.getBoundingClientRect();
                        const ctx = c.getContext("2d"); if (!ctx) return;
                        ctx.beginPath(); ctx.moveTo((e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height);
                      }}
                      onMouseMove={(e) => {
                        if (!receiptDrawing) return;
                        const c = receiptCanvasRef.current; if (!c) return;
                        const r = c.getBoundingClientRect();
                        const ctx = c.getContext("2d"); if (!ctx) return;
                        ctx.lineTo((e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height);
                        ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
                        setReceiptHasSig(true);
                      }}
                      onMouseUp={() => setReceiptDrawing(false)}
                      onMouseLeave={() => setReceiptDrawing(false)}
                    />
                  </div>
                  <button
                    onClick={() => { receiptCanvasRef.current?.getContext("2d")?.clearRect(0, 0, 700, 160); setReceiptHasSig(false); }}
                    className="mt-1 text-xs text-gray-400 hover:text-red-500 underline"
                  >Löschen</button>
                </div>
              )}
            </div>

            <div className="px-5 py-4 flex gap-3 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setReceiptAb(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                Abbrechen
              </button>
              <button onClick={generateReceipt} disabled={receiptGenerating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                <Receipt className="w-4 h-4" />
                {receiptGenerating ? "Erstelle..." : "Quittung herunterladen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
