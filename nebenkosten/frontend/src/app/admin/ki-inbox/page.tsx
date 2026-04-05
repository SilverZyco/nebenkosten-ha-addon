"use client";

import { useEffect, useState } from "react";
import { kiInboxApi, apartmentsApi } from "@/lib/api";
import { formatEur, DOCUMENT_TYPE_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Bot,
  Info,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";

interface KIDocument {
  id: string;
  original_filename: string;
  document_type: string;
  status: string;
  ocr_text: string | null;
  ai_json: Record<string, unknown> | null;
  total_amount: string | null;
  rainwater_amount: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  service_period_from: string | null;
  service_period_to: string | null;
  bill_total_kwh: string | null;
  year: number | null;
  is_billable: boolean;
  is_visible_to_tenant: boolean;
}

interface Apartment { id: string; code: string; name: string; }
interface WasteBinMapping { id: string; bin_id: string; apartment_id: string; }

interface EvsBin {
  bin_id: string;
  bin_size?: string;
  base_fee?: number;
  total?: number;
  emptyings?: { count: number; price_per_emptying?: number; amount?: number; description?: string }[];
  extra_emptyings?: { count: number; amount?: number; description?: string }[];
}

const inputCls =
  "w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm " +
  "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 " +
  "focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 " +
  "placeholder-gray-400 dark:placeholder-gray-500";

const labelCls = "text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block";

export default function KIInboxPage() {
  const [docs, setDocs] = useState<KIDocument[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [existingBinMappings, setExistingBinMappings] = useState<WasteBinMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, Record<string, string>>>({});
  // binAssignments[docId][binId] = apartmentId
  const [binAssignments, setBinAssignments] = useState<Record<string, Record<string, string>>>({});
  // Reject confirmation modal
  const [rejectDoc, setRejectDoc] = useState<KIDocument | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const [docsRes, aptRes, binsRes] = await Promise.all([
        kiInboxApi.list(),
        apartmentsApi.list(),
        apartmentsApi.listWasteBins(),
      ]);
      setDocs(docsRes.data);
      setApartments(aptRes.data);
      setExistingBinMappings(binsRes.data);
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);

  const normBinId = (id: string) => id.replace(/^0+/, "") || id;

  const initEdit = (doc: KIDocument) => {
    const ai = doc.ai_json as Record<string, unknown> || {};
    setEditData((prev) => ({
      ...prev,
      [doc.id]: {
        document_type: doc.document_type,
        total_amount: doc.total_amount || String(ai.total_amount || ""),
        supplier_name: doc.supplier_name || String(ai.supplier_name || ""),
        invoice_date: doc.invoice_date || String(ai.invoice_date || ""),
        service_period_from: doc.service_period_from || String(ai.service_period_from || ""),
        service_period_to: doc.service_period_to || String(ai.service_period_to || ""),
        bill_total_kwh: doc.bill_total_kwh || String(ai.bill_total_kwh || ""),
        rainwater_amount: doc.rainwater_amount || String(ai.rainwater_amount || ""),
        year: String(doc.year || (ai.service_period_from ? new Date(String(ai.service_period_from)).getFullYear() : new Date().getFullYear())),
        is_billable: String(doc.is_billable),
        is_visible_to_tenant: String(doc.is_visible_to_tenant),
      },
    }));

    // Pre-populate bin assignments from existing mappings (normalize IDs, support shared bins)
    const bins = (doc.ai_json?.bins as EvsBin[] | undefined) || [];
    if (bins.length > 0) {
      const pre: Record<string, string> = {};
      for (const bin of bins) {
        const nid = normBinId(String(bin.bin_id));
        const existingForBin = existingBinMappings.filter(m => normBinId(m.bin_id) === nid);
        if (existingForBin.length > 1) {
          pre[nid] = "__shared__";
        } else if (existingForBin.length === 1) {
          pre[nid] = existingForBin[0].apartment_id;
        }
      }
      setBinAssignments(prev => ({ ...prev, [doc.id]: { ...(prev[doc.id] || {}), ...pre } }));
    }
  };

  const toggleExpand = (id: string, doc: KIDocument) => {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      if (!editData[id]) initEdit(doc);
    }
  };

  const updateField = (docId: string, field: string, value: string) => {
    setEditData((prev) => ({
      ...prev,
      [docId]: { ...prev[docId], [field]: value },
    }));
  };

  const setBinApt = (docId: string, binId: string, aptId: string) => {
    setBinAssignments(prev => ({
      ...prev,
      [docId]: { ...(prev[docId] || {}), [binId]: aptId },
    }));
  };

  const confirm = async (doc: KIDocument) => {
    const ed = editData[doc.id] || {};
    const payload: Record<string, unknown> = {
      document_type: ed.document_type || doc.document_type,
      year: ed.year ? parseInt(ed.year) : doc.year,
      is_billable: ed.is_billable === "true",
      is_visible_to_tenant: ed.is_visible_to_tenant === "true",
    };
    if (ed.total_amount) payload.total_amount = parseFloat(ed.total_amount);
    if (ed.supplier_name) payload.supplier_name = ed.supplier_name;
    if (ed.invoice_date) payload.invoice_date = ed.invoice_date;
    if (ed.service_period_from) payload.service_period_from = ed.service_period_from;
    if (ed.service_period_to) payload.service_period_to = ed.service_period_to;
    if (ed.bill_total_kwh) payload.bill_total_kwh = parseFloat(ed.bill_total_kwh);
    if (ed.rainwater_amount) payload.rainwater_amount = parseFloat(ed.rainwater_amount);

    const docBins = binAssignments[doc.id] || {};
    const newAssignments = Object.entries(docBins)
      .filter(([binId, aptId]) => {
        if (!aptId || aptId === "__shared__") return false;
        const alreadyExists = existingBinMappings.some(
          m => normBinId(m.bin_id) === normBinId(binId) && m.apartment_id === aptId
        );
        return !alreadyExists;
      })
      .map(([bin_id, apartment_id]) => ({ bin_id, apartment_id }));

    if (newAssignments.length > 0) {
      payload.bin_assignments = newAssignments;
    }

    try {
      await kiInboxApi.confirm(doc.id, payload);
      toast.success(
        newAssignments.length > 0
          ? `Bestätigt + ${newAssignments.length} Tonne(n) Wohnung zugewiesen`
          : "Daten bestätigt und gebucht"
      );
      fetchDocs();
      setExpanded(null);
    } catch {
      toast.error("Fehler beim Bestätigen");
    }
  };

  const rejectConfirmed = async () => {
    if (!rejectDoc) return;
    try {
      await kiInboxApi.reject(rejectDoc.id);
      toast.success("Abgelehnt – bitte manuell nacharbeiten");
      setRejectDoc(null);
      fetchDocs();
    } catch {
      toast.error("Fehler");
    }
  };

  const reprocess = async (doc: KIDocument) => {
    try {
      await kiInboxApi.reprocess(doc.id);
      toast.success("Verarbeitung neu gestartet");
      fetchDocs();
    } catch {
      toast.error("Fehler");
    }
  };

  return (
    <>
      {/* Reject Confirmation Modal */}
      <Modal
        open={rejectDoc !== null}
        onClose={() => setRejectDoc(null)}
        title="KI-Daten ablehnen?"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setRejectDoc(null)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Abbrechen
            </button>
            <button
              onClick={rejectConfirmed}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              <XCircle className="w-4 h-4" />
              Ablehnen
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Das Dokument <strong className="text-gray-900 dark:text-gray-100">{rejectDoc?.original_filename}</strong> wird abgelehnt.
          Es bleibt gespeichert, muss aber manuell in der Dokumentenverwaltung nachbearbeitet werden.
        </p>
      </Modal>

      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        <PageHeader
          title="KI-Inbox"
          subtitle="Von der KI extrahierte Daten prüfen und bestätigen"
          actions={
            <div className="flex items-center gap-3">
              {!loading && docs.length > 0 && (
                <Badge variant="yellow" size="md">
                  {docs.length} offen
                </Badge>
              )}
              <button
                onClick={fetchDocs}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Aktualisieren
              </button>
            </div>
          }
        />

        {/* Info Box */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Wie funktioniert die KI-Inbox?</strong>{" "}
            Hier prüfst du die von der KI automatisch erkannten Daten. Bestätige oder korrigiere jeden Eintrag –
            erst nach der Bestätigung werden die Daten in die Abrechnung übernommen.
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <Card>
            <EmptyState
              icon={CheckCircle}
              title="Keine offenen Einträge"
              description="Alle Dokumente wurden geprüft. Sobald neue Dokumente hochgeladen werden, erscheinen sie hier."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {docs.map((doc) => {
              const isOpen = expanded === doc.id;
              const ai = doc.ai_json as Record<string, unknown> || {};
              const ed = editData[doc.id] || {};
              const docType = ed.document_type || doc.document_type;
              const isEvs = docType === "waste_invoice_evs";
              const evsBins = (ai.bins as EvsBin[] | undefined) || [];

              return (
                <Card key={doc.id} className="overflow-hidden p-0">
                  {/* Header Row */}
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => toggleExpand(doc.id, doc)}
                  >
                    <div className="w-9 h-9 bg-brand-100 dark:bg-brand-900/40 rounded-lg flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {doc.original_filename}
                        </span>
                        <Badge variant="blue" size="sm">
                          {doc.status === "ai_extracted" ? "KI fertig" : doc.status}
                        </Badge>
                        {isEvs && evsBins.length > 0 && (
                          <Badge variant="green" size="sm">
                            {evsBins.length} Tonne(n) erkannt
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
                        {Boolean(ai.document_type) && (
                          <span>{DOCUMENT_TYPE_LABELS[String(ai.document_type)] || String(ai.document_type)}</span>
                        )}
                        {Boolean(ai.supplier_name) && <span>{String(ai.supplier_name)}</span>}
                        {Boolean(ai.total_amount) && (
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {formatEur(Number(ai.total_amount))}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isOpen && (
                    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="px-5 py-5 space-y-6">

                        {/* Edit Form */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            KI-extrahierte Felder bearbeiten
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            <div>
                              <label className={labelCls}>Dokumenttyp</label>
                              <select
                                value={ed.document_type || doc.document_type}
                                onChange={(e) => updateField(doc.id, "document_type", e.target.value)}
                                className={inputCls}
                              >
                                {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>Jahr</label>
                              <input
                                type="number"
                                value={ed.year || ""}
                                onChange={(e) => updateField(doc.id, "year", e.target.value)}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Lieferant</label>
                              <input
                                type="text"
                                value={ed.supplier_name || ""}
                                onChange={(e) => updateField(doc.id, "supplier_name", e.target.value)}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Betrag (€)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={ed.total_amount || ""}
                                onChange={(e) => updateField(doc.id, "total_amount", e.target.value)}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Rechnungsdatum</label>
                              <input
                                type="date"
                                value={ed.invoice_date || ""}
                                onChange={(e) => updateField(doc.id, "invoice_date", e.target.value)}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Zeitraum von</label>
                              <input
                                type="date"
                                value={ed.service_period_from || ""}
                                onChange={(e) => updateField(doc.id, "service_period_from", e.target.value)}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Zeitraum bis</label>
                              <input
                                type="date"
                                value={ed.service_period_to || ""}
                                onChange={(e) => updateField(doc.id, "service_period_to", e.target.value)}
                                className={inputCls}
                              />
                            </div>
                            {!isEvs && (
                              <div>
                                <label className={labelCls}>Gas kWh (falls Gasrechnung)</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={ed.bill_total_kwh || ""}
                                  onChange={(e) => updateField(doc.id, "bill_total_kwh", e.target.value)}
                                  className={inputCls}
                                />
                              </div>
                            )}
                            {(ed.document_type === "water_invoice" || doc.document_type === "water_invoice") && (
                              <div>
                                <label className={labelCls}>
                                  Niederschlagswasser-Anteil (€)
                                  <span
                                    className="ml-1 text-blue-500 dark:text-blue-400"
                                    title="Falls die Wasserrechnung auch Niederschlagswassergebühr enthält, hier den Betrag eintragen"
                                  >
                                    ⓘ
                                  </span>
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={ed.rainwater_amount || ""}
                                  onChange={(e) => updateField(doc.id, "rainwater_amount", e.target.value)}
                                  className={inputCls}
                                  placeholder="0.00"
                                />
                              </div>
                            )}
                            <div className="flex items-end pb-1.5">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ed.is_billable === "true"}
                                  onChange={(e) => updateField(doc.id, "is_billable", String(e.target.checked))}
                                  className="w-4 h-4 rounded accent-brand-600"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Umlagefähig</span>
                              </label>
                            </div>
                            <div className="flex items-end pb-1.5">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ed.is_visible_to_tenant === "true"}
                                  onChange={(e) => updateField(doc.id, "is_visible_to_tenant", String(e.target.checked))}
                                  className="w-4 h-4 rounded accent-brand-600"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Für Mieter sichtbar</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* EVS Bins — detailed section */}
                        {isEvs && evsBins.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                              Mülltonnen (EVS) — Wohnung zuweisen
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                              Jeder Tonne muss eine Wohnung zugewiesen sein, damit die Kosten in der Abrechnung erscheinen.
                              Bereits zugeordnete Tonnen werden automatisch erkannt.
                            </p>
                            <div className="space-y-2">
                              {evsBins.map((bin) => {
                                const binId = normBinId(String(bin.bin_id ?? ""));
                                const totalEmptyings =
                                  (bin.emptyings || []).reduce((s, e) => s + (e.count || 0), 0) +
                                  (bin.extra_emptyings || []).reduce((s, e) => s + (e.count || 0), 0);
                                const binTotal =
                                  bin.total ??
                                  ((bin.base_fee || 0) +
                                    (bin.emptyings || []).reduce((s, e) => s + (e.amount || 0), 0) +
                                    (bin.extra_emptyings || []).reduce((s, e) => s + (e.amount || 0), 0));
                                const assignedAptId = binAssignments[doc.id]?.[binId] || "";
                                const isShared = assignedAptId === "__shared__";
                                const mappedApts = existingBinMappings
                                  .filter(m => normBinId(m.bin_id) === binId)
                                  .map(m => apartments.find(a => a.id === m.apartment_id)?.code)
                                  .filter(Boolean);
                                const isAssigned = isShared || Boolean(assignedAptId);
                                const currentApt = !isShared ? apartments.find(a => a.id === assignedAptId) : null;

                                return (
                                  <div
                                    key={binId}
                                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                                      isAssigned
                                        ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                                        : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700"
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="font-mono font-bold text-brand-700 dark:text-brand-300 text-sm">
                                          Tonne {binId}
                                        </span>
                                        {bin.bin_size && (
                                          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                            {bin.bin_size}
                                          </span>
                                        )}
                                        {isShared && (
                                          <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded font-medium">
                                            geteilt: {mappedApts.join(", ")}
                                          </span>
                                        )}
                                        {!isShared && mappedApts.length === 1 && (
                                          <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">
                                            bereits zugeordnet
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                                        {totalEmptyings > 0 && <span>{totalEmptyings}× Leerung</span>}
                                        {bin.base_fee ? <span>Grundgeb. {formatEur(bin.base_fee)}</span> : null}
                                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                                          Gesamt: {formatEur(binTotal)}
                                        </span>
                                      </div>
                                      {(bin.emptyings || []).map((emp, i) => (
                                        <div key={i} className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                          {emp.description || "Leerung"}: {emp.count}× à {formatEur(emp.price_per_emptying || 0)} = {formatEur(emp.amount || 0)}
                                        </div>
                                      ))}
                                      {(bin.extra_emptyings || []).map((emp, i) => (
                                        <div key={i} className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                          {emp.description || "Sonderleerung"}: {emp.count}× = {formatEur(emp.amount || 0)}
                                        </div>
                                      ))}
                                    </div>

                                    <div className="shrink-0 flex items-center gap-2 mt-0.5">
                                      {isShared ? (
                                        <div className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
                                          <CheckCircle className="w-4 h-4" />
                                          Kosten ÷ {mappedApts.length}
                                        </div>
                                      ) : (
                                        <>
                                          {!assignedAptId && (
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                          )}
                                          <select
                                            value={assignedAptId}
                                            onChange={(e) => setBinApt(doc.id, binId, e.target.value)}
                                            className={`px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                                              assignedAptId
                                                ? "border-green-300 dark:border-green-600"
                                                : "border-amber-300 dark:border-amber-600"
                                            }`}
                                          >
                                            <option value="">– Wohnung –</option>
                                            {apartments.map((a) => (
                                              <option key={a.id} value={a.id}>
                                                {a.code} – {a.name}
                                              </option>
                                            ))}
                                          </select>
                                          {currentApt && (
                                            <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                                              → {currentApt.code}
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {evsBins.some(b => {
                              const v = binAssignments[doc.id]?.[normBinId(String(b.bin_id ?? ""))];
                              return !v || v === "";
                            }) && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Nicht zugeordnete Tonnen werden in der Abrechnung nicht berücksichtigt.
                              </p>
                            )}
                          </div>
                        )}

                        {/* No bins extracted but EVS type */}
                        {isEvs && evsBins.length === 0 && (
                          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div>
                              <strong>Keine Tonnen-Daten erkannt.</strong>{" "}
                              Entweder ist kein OpenAI API-Key konfiguriert oder die Extraktion hat keine Tonnennummern gefunden.
                              Bitte prüfe den OCR-Text und klicke „Neu verarbeiten" falls ein API-Key vorhanden ist.
                            </div>
                          </div>
                        )}

                        {/* OCR Text */}
                        {doc.ocr_text && (
                          <details className="group">
                            <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1.5 select-none">
                              <Eye className="w-4 h-4" /> OCR-Text anzeigen
                            </summary>
                            <pre className="mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400 overflow-auto max-h-48 whitespace-pre-wrap">
                              {doc.ocr_text.substring(0, 3000)}
                              {doc.ocr_text.length > 3000 && "...[abgeschnitten]"}
                            </pre>
                          </details>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => confirm(doc)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors shadow-sm"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Bestätigen & buchen
                          </button>
                          <button
                            onClick={() => setRejectDoc(doc)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 rounded-lg text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                            Ablehnen
                          </button>
                          <button
                            onClick={() => reprocess(doc)}
                            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Neu verarbeiten
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
