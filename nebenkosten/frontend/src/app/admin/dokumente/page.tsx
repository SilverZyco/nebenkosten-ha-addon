"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { documentsApi, apartmentsApi } from "@/lib/api";
import { formatEur, formatDate, DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";
import { Upload, Download, Trash2, Eye, EyeOff, RefreshCw, ChevronDown, ChevronUp, Brain, Pencil, Check, X, FilePlus, FileText, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";

interface Document {
  id: string;
  filename: string;
  original_filename: string;
  document_type: string;
  status: string;
  year: number | null;
  invoice_date: string | null;
  service_period_from: string | null;
  service_period_to: string | null;
  total_amount: string | null;
  rainwater_amount: string | null;
  wastewater_amount: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  is_billable: boolean;
  is_visible_to_tenant: boolean;
  uploader_name: string | null;
  upload_date: string;
  ai_json: Record<string, unknown> | null;
  apartment_id: string | null;
}

interface Apartment { id: string; code: string; name: string; waste_bin_mappings: { bin_id: string; apartment_id: string }[] }
interface EvsBin { bin_id: string; bin_size?: string; base_fee?: number; total?: number; emptyings?: { count: number; price_per_emptying?: number; amount?: number }[] }


export default function DokumentePage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    document_type: "property_tax_notice",
    year: String(new Date().getFullYear()),
    total_amount: "",
    supplier_name: "",
    invoice_number: "",
    invoice_date: "",
    notes: "",
    is_billable: true,
    is_visible_to_tenant: false,
  });
  const [savingManual, setSavingManual] = useState(false);
  const [editingRainwater, setEditingRainwater] = useState<string | null>(null);
  const [rainwaterValue, setRainwaterValue] = useState<string>("");
  const [editingWastewater, setEditingWastewater] = useState<string | null>(null);
  const [wastewaterValue, setWastewaterValue] = useState<string>("");
  const [editingTotal, setEditingTotal] = useState<string | null>(null);
  const [totalValue, setTotalValue] = useState<string>("");
  const [editingYear, setEditingYear] = useState<string | null>(null);
  const [yearValue, setYearValue] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (filterYear) params.year = parseInt(filterYear);
      if (filterType) params.document_type = filterType;
      if (filterStatus) params.status = filterStatus;
      const [docsRes, aptRes] = await Promise.all([
        documentsApi.list(params),
        apartmentsApi.list(),
      ]);
      setDocs(docsRes.data);
      setApartments(aptRes.data);
    } catch {
      toast.error("Fehler beim Laden der Dokumente");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, [filterYear, filterType, filterStatus]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const year = new Date().getFullYear();
        fd.append("year", String(year));
        await documentsApi.upload(fd);
        uploaded++;
      } catch {
        toast.error(`Fehler bei ${file.name}`);
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      toast.success(`${uploaded} Datei(en) hochgeladen`);
      fetchDocs();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleVisibility = async (doc: Document) => {
    try {
      await documentsApi.update(doc.id, { is_visible_to_tenant: !doc.is_visible_to_tenant });
      toast.success("Sichtbarkeit geändert");
      fetchDocs();
    } catch {
      toast.error("Fehler");
    }
  };

  const toggleBillable = async (doc: Document) => {
    try {
      const newBillable = !doc.is_billable;
      await documentsApi.update(doc.id, {
        is_billable: newBillable,
        is_visible_to_tenant: newBillable,
      });
      toast.success("Umlagefähigkeit geändert");
      fetchDocs();
    } catch {
      toast.error("Fehler");
    }
  };

  const deleteDoc = async (doc: Document) => {
    if (!window.confirm(`Dokument "${doc.original_filename}" wirklich löschen?`)) return;
    try {
      await documentsApi.delete(doc.id);
      toast.success("Dokument gelöscht");
      fetchDocs();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  const saveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.total_amount) return toast.error("Betrag ist Pflichtfeld");
    setSavingManual(true);
    try {
      await documentsApi.createManual({
        document_type: manualForm.document_type,
        year: parseInt(manualForm.year),
        total_amount: parseFloat(manualForm.total_amount),
        supplier_name: manualForm.supplier_name || undefined,
        invoice_number: manualForm.invoice_number || undefined,
        invoice_date: manualForm.invoice_date || undefined,
        notes: manualForm.notes || undefined,
        is_billable: manualForm.is_billable,
        is_visible_to_tenant: manualForm.is_visible_to_tenant,
      });
      toast.success("Dokument manuell erfasst");
      setShowManualForm(false);
      setManualForm({ document_type: "property_tax_notice", year: String(new Date().getFullYear()), total_amount: "", supplier_name: "", invoice_number: "", invoice_date: "", notes: "", is_billable: true, is_visible_to_tenant: false });
      fetchDocs();
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSavingManual(false);
    }
  };

  const startRename = (doc: Document) => {
    setRenaming(doc.id);
    setRenameValue(doc.original_filename);
  };

  const saveRename = async (docId: string) => {
    if (!renameValue.trim()) return;
    try {
      await documentsApi.update(docId, { original_filename: renameValue.trim() });
      toast.success("Dateiname geändert");
      setRenaming(null);
      fetchDocs();
    } catch {
      toast.error("Fehler beim Umbenennen");
    }
  };

  const saveRainwater = async (docId: string) => {
    const val = parseFloat(rainwaterValue);
    try {
      await documentsApi.update(docId, { rainwater_amount: isNaN(val) ? null : val });
      toast.success("Niederschlagsbetrag gespeichert");
      setEditingRainwater(null);
      fetchDocs();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const saveWastewater = async (docId: string) => {
    const val = parseFloat(wastewaterValue);
    try {
      await documentsApi.update(docId, { wastewater_amount: isNaN(val) ? null : val });
      toast.success("Schmutzwasserbetrag gespeichert");
      setEditingWastewater(null);
      fetchDocs();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const saveTotal = async (docId: string) => {
    const val = parseFloat(totalValue);
    if (isNaN(val) || val <= 0) return toast.error("Ungültiger Betrag");
    try {
      await documentsApi.update(docId, { total_amount: val });
      toast.success("Gesamtbetrag gespeichert");
      setEditingTotal(null);
      fetchDocs();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const saveYear = async (docId: string) => {
    const val = parseInt(yearValue);
    if (isNaN(val) || val < 2000 || val > 2100) return toast.error("Ungültiges Jahr");
    try {
      await documentsApi.update(docId, { year: val });
      toast.success("Jahr gespeichert");
      setEditingYear(null);
      fetchDocs();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const assignApartment = async (docId: string, apartmentId: string | null) => {
    try {
      await documentsApi.update(docId, { apartment_id: apartmentId || null });
      toast.success(apartmentId ? "Wohnung zugeordnet" : "Zuordnung entfernt");
      fetchDocs();
    } catch {
      toast.error("Fehler bei Zuordnung");
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const binToApt: Record<string, string> = {};
  for (const apt of apartments) {
    for (const bm of apt.waste_bin_mappings || []) {
      const normalized = bm.bin_id.replace(/^0+/, "") || bm.bin_id;
      binToApt[normalized] = apt.code;
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
        className="hidden"
        onChange={handleUpload}
      />

      <div className="p-6 space-y-5 flex-1 overflow-y-auto">
        <PageHeader
          title="Dokumente"
          subtitle="Belege, Rechnungen und Nachweise für die Abrechnung"
          actions={
            <div className="flex gap-2">
              <button
                onClick={() => setShowManualForm(true)}
                className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
              >
                <FilePlus className="w-4 h-4" />
                Manuell erfassen
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {uploading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Hochladen
              </button>
            </div>
          }
        />

        {/* Info Box: Required documents */}
        <Card className="p-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Pflichtdokumente für die Abrechnung</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Folgende 4 Dokumenttypen werden für die Abrechnung benötigt:{" "}
                <strong>Grundsteuerbescheid</strong> (manuell erfassbar),{" "}
                <strong>Gebäudeversicherung</strong>,{" "}
                <strong>Niederschlagswasser</strong> (separat oder in Wasserrechnung),{" "}
                <strong>Allgemeinstrom</strong>.
              </p>
            </div>
          </div>
        </Card>

        {/* Upload Drop Area */}
        <Card
          className="p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-brand-400 dark:hover:border-brand-500 transition-colors cursor-pointer text-center"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Dateien hochladen</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, PNG, JPG, TIFF – KI erkennt automatisch Typ und Betrag</p>
        </Card>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Alle Jahre</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Alle Typen</option>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Alle Status</option>
              {Object.entries(DOCUMENT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              onClick={fetchDocs}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm ml-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
            </button>
          </div>
        </Card>

        {/* Table */}
        <Card>
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : docs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Keine Dokumente gefunden"
              description="Lade Belege und Rechnungen hoch oder passe die Filter an."
              action={
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Jetzt hochladen
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Datei</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Typ</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jahr</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Betrag</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wohnung</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Umlagef.</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sichtbar</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {docs.map((doc) => {
                    const isOpen = expanded === doc.id;
                    const hasAI = Boolean(doc.ai_json);
                    return (
                      <Fragment key={doc.id}>
                        <tr
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${hasAI ? "cursor-pointer" : ""} ${isOpen ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}`}
                          onClick={hasAI ? () => setExpanded(isOpen ? null : doc.id) : undefined}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {hasAI && (
                                <span title="KI-Daten vorhanden"><Brain className="w-3.5 h-3.5 text-violet-500 shrink-0" /></span>
                              )}
                              <div className="min-w-0">
                                {renaming === doc.id ? (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={renameValue}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveRename(doc.id);
                                        if (e.key === "Escape") setRenaming(null);
                                      }}
                                      className="text-sm border border-brand-400 rounded px-1.5 py-0.5 w-40 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                      autoFocus
                                    />
                                    <button onClick={() => saveRename(doc.id)} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setRenaming(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]" title={doc.original_filename}>
                                      {doc.original_filename}
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); startRename(doc); }}
                                      className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 shrink-0"
                                      title="Umbenennen"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                {doc.supplier_name && (
                                  <div className="text-xs text-gray-400 dark:text-gray-500">{doc.supplier_name}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            <span className="text-gray-600 dark:text-gray-400">
                              {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300" onClick={(e) => e.stopPropagation()}>
                            {editingYear === doc.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={yearValue}
                                  onChange={(e) => setYearValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveYear(doc.id); if (e.key === "Escape") setEditingYear(null); }}
                                  className="border border-brand-400 rounded px-1.5 py-0.5 w-16 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                                  autoFocus
                                />
                                <button onClick={() => saveYear(doc.id)} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setEditingYear(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="font-medium">{doc.year ?? "–"}</span>
                                <button
                                  onClick={() => { setEditingYear(doc.id); setYearValue(String(doc.year ?? new Date().getFullYear())); }}
                                  className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 shrink-0"
                                  title="Jahr bearbeiten"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100" onClick={(e) => e.stopPropagation()}>
                            {doc.document_type === "water_invoice" ? (
                              <div className="space-y-0.5 text-xs">
                                {editingTotal === doc.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 w-6">∑</span>
                                    <input type="number" step="0.01" value={totalValue}
                                      onChange={(e) => setTotalValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") saveTotal(doc.id); if (e.key === "Escape") setEditingTotal(null); }}
                                      className="border border-gray-400 rounded px-1.5 py-0.5 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500" autoFocus />
                                    <button onClick={() => saveTotal(doc.id)} className="text-green-600"><Check className="w-3 h-3" /></button>
                                    <button onClick={() => setEditingTotal(null)} className="text-gray-400"><X className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 w-6">∑</span>
                                    <span className="font-semibold">{doc.total_amount ? formatEur(doc.total_amount) : "–"}</span>
                                    <button onClick={() => { setEditingTotal(doc.id); setTotalValue(doc.total_amount ?? ""); }} className="text-gray-300 hover:text-gray-500 dark:hover:text-gray-400" title="Gesamtbetrag bearbeiten"><Pencil className="w-2.5 h-2.5" /></button>
                                  </div>
                                )}
                                {editingWastewater === doc.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 w-6">SW</span>
                                    <input type="number" step="0.01" value={wastewaterValue}
                                      onChange={(e) => setWastewaterValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") saveWastewater(doc.id); if (e.key === "Escape") setEditingWastewater(null); }}
                                      className="border border-orange-400 rounded px-1.5 py-0.5 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-orange-500" autoFocus />
                                    <button onClick={() => saveWastewater(doc.id)} className="text-green-600"><Check className="w-3 h-3" /></button>
                                    <button onClick={() => setEditingWastewater(null)} className="text-gray-400"><X className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 w-6">SW</span>
                                    <span className="text-orange-700 dark:text-orange-400">{doc.wastewater_amount ? formatEur(doc.wastewater_amount) : "–"}</span>
                                    <button onClick={() => { setEditingWastewater(doc.id); setWastewaterValue(doc.wastewater_amount ?? ""); }} className="text-gray-300 hover:text-orange-500 dark:hover:text-orange-400" title="Schmutzwasser bearbeiten"><Pencil className="w-2.5 h-2.5" /></button>
                                  </div>
                                )}
                                {editingRainwater === doc.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 w-6">NW</span>
                                    <input type="number" step="0.01" value={rainwaterValue}
                                      onChange={(e) => setRainwaterValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") saveRainwater(doc.id); if (e.key === "Escape") setEditingRainwater(null); }}
                                      className="border border-blue-400 rounded px-1.5 py-0.5 w-20 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
                                    <button onClick={() => saveRainwater(doc.id)} className="text-green-600"><Check className="w-3 h-3" /></button>
                                    <button onClick={() => setEditingRainwater(null)} className="text-gray-400"><X className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 w-6">NW</span>
                                    <span className="text-blue-600 dark:text-blue-400">{doc.rainwater_amount ? formatEur(doc.rainwater_amount) : "–"}</span>
                                    <button onClick={() => { setEditingRainwater(doc.id); setRainwaterValue(doc.rainwater_amount ?? ""); }} className="text-gray-300 hover:text-blue-500" title="Niederschlagswasser bearbeiten"><Pencil className="w-2.5 h-2.5" /></button>
                                  </div>
                                )}
                                {doc.total_amount && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 w-6">TW</span>
                                    <span className="text-cyan-700 dark:text-cyan-400">
                                      {formatEur(
                                        parseFloat(doc.total_amount) -
                                        parseFloat(doc.wastewater_amount ?? "0") -
                                        parseFloat(doc.rainwater_amount ?? "0")
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                {editingTotal === doc.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={totalValue}
                                      onChange={(e) => setTotalValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") saveTotal(doc.id); if (e.key === "Escape") setEditingTotal(null); }}
                                      className="border border-gray-400 rounded px-1.5 py-0.5 w-24 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                                      autoFocus
                                    />
                                    <button onClick={() => saveTotal(doc.id)} className="text-green-600 hover:text-green-700"><Check className="w-3 h-3" /></button>
                                    <button onClick={() => setEditingTotal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span>{doc.total_amount ? formatEur(doc.total_amount) : "–"}</span>
                                    <button
                                      onClick={() => { setEditingTotal(doc.id); setTotalValue(doc.total_amount ?? ""); }}
                                      className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 shrink-0"
                                      title="Betrag bearbeiten"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                )}
                                {doc.rainwater_amount && (
                                  <div className="text-xs text-blue-600 dark:text-blue-400">NW: {formatEur(doc.rainwater_amount)}</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={doc.apartment_id || ""}
                              onChange={(e) => assignApartment(doc.id, e.target.value || null)}
                              className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-[110px]"
                              title="Wohnung zuordnen (leer = für alle)"
                            >
                              <option value="">Alle / Gebäude</option>
                              {apartments.map((apt) => (
                                <option key={apt.id} value={apt.id}>{apt.code}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={doc.status} type="document" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleBillable(doc); }}
                              title="Umlagefähig umschalten"
                              className="text-lg"
                            >
                              {doc.is_billable ? (
                                <span className="text-green-600">✓</span>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600">✗</span>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleVisibility(doc); }}
                              title="Sichtbarkeit für Mieter umschalten"
                            >
                              {doc.is_visible_to_tenant ? (
                                <Eye className="w-4 h-4 text-green-600 mx-auto" />
                              ) : (
                                <EyeOff className="w-4 h-4 text-gray-300 dark:text-gray-600 mx-auto" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              {hasAI && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : doc.id); }}
                                  className="p-2 text-gray-500 hover:text-violet-600 dark:text-gray-400 dark:hover:text-violet-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                  title="KI-Daten anzeigen"
                                >
                                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              )}
                              {doc.filename !== "manual_entry" && (
                                <a
                                  href={documentsApi.downloadUrl(doc.id)}
                                  target="_blank"
                                  className="p-2 text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                  title="Herunterladen"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteDoc(doc); }}
                                className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                title="Löschen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && hasAI && (
                          <tr className="bg-violet-50/60 dark:bg-violet-900/10 border-b border-violet-100 dark:border-violet-800">
                            <td colSpan={9} className="px-6 py-4">
                              <KIDataPanel doc={doc} binToApt={binToApt} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Modal: Manuell erfassen */}
      <Modal
        open={showManualForm}
        onClose={() => setShowManualForm(false)}
        title="Dokument manuell erfassen"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              form="manual-doc-form"
              disabled={savingManual}
              className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {savingManual ? "Wird gespeichert…" : "Erfassen"}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Für Belege ohne digitale Datei (z.B. Grundsteuerbescheid vom Finanzamt).
        </p>
        <form id="manual-doc-form" onSubmit={saveManual} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Typ *</label>
              <select
                value={manualForm.document_type}
                onChange={(e) => setManualForm({ ...manualForm, document_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Jahr *</label>
              <select
                value={manualForm.year}
                onChange={(e) => setManualForm({ ...manualForm, year: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Betrag (€) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={manualForm.total_amount}
                onChange={(e) => setManualForm({ ...manualForm, total_amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Datum</label>
              <input
                type="date"
                value={manualForm.invoice_date}
                onChange={(e) => setManualForm({ ...manualForm, invoice_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Lieferant / Behörde</label>
              <input
                type="text"
                value={manualForm.supplier_name}
                onChange={(e) => setManualForm({ ...manualForm, supplier_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="z.B. Finanzamt Saarbrücken"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Bescheid-/Rechnungsnr.</label>
              <input
                type="text"
                value={manualForm.invoice_number}
                onChange={(e) => setManualForm({ ...manualForm, invoice_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Notiz</label>
            <input
              type="text"
              value={manualForm.notes}
              onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={manualForm.is_billable}
                onChange={(e) => setManualForm({ ...manualForm, is_billable: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              Umlagefähig
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={manualForm.is_visible_to_tenant}
                onChange={(e) => setManualForm({ ...manualForm, is_visible_to_tenant: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              Für Mieter sichtbar
            </label>
          </div>
        </form>
      </Modal>
    </>
  );
}

function KIDataPanel({ doc, binToApt }: { doc: Document; binToApt: Record<string, string> }) {
  const ai = (doc.ai_json || {}) as Record<string, string | number | unknown[]>;
  const isEvs = doc.document_type === "waste_invoice_evs";
  const evsBins = (ai.bins as EvsBin[] | undefined) || [];

  const supplierName = ai.supplier_name ? String(ai.supplier_name) : null;
  const invoiceNumber = ai.invoice_number ? String(ai.invoice_number) : null;
  const invoiceDate = ai.invoice_date ? String(ai.invoice_date) : null;
  const periodFrom = ai.service_period_from ? String(ai.service_period_from) : null;
  const periodTo = ai.service_period_to ? String(ai.service_period_to) : null;
  const totalAmount = ai.total_amount ? Number(ai.total_amount) : null;
  const rainwaterAmount = ai.rainwater_amount ? Number(ai.rainwater_amount) : null;
  const wastewaterAmount = ai.wastewater_amount ? Number(ai.wastewater_amount) : null;
  const isWater = doc.document_type === "water_invoice";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">KI-extrahierte Daten</span>
        {doc.year && doc.is_billable && (
          <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">
            fließt in Abrechnung {doc.year} ein
          </span>
        )}
        {doc.year && !doc.is_billable && (
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
            nicht umlagefähig
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
        {supplierName && (
          <div><span className="text-gray-400 block">Lieferant</span><span className="font-medium text-gray-900 dark:text-gray-100">{supplierName}</span></div>
        )}
        {invoiceNumber && (
          <div><span className="text-gray-400 block">Rechnungs-Nr.</span><span className="font-mono font-medium text-gray-900 dark:text-gray-100">{invoiceNumber}</span></div>
        )}
        {invoiceDate && (
          <div><span className="text-gray-400 block">Datum</span><span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(invoiceDate)}</span></div>
        )}
        {(periodFrom || periodTo) && (
          <div><span className="text-gray-400 block">Leistungszeitraum</span><span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(periodFrom)} – {formatDate(periodTo)}</span></div>
        )}
        {totalAmount !== null && (
          <div><span className="text-gray-400 block">Gesamtbetrag</span><span className="font-semibold text-gray-900 dark:text-gray-100">{formatEur(totalAmount)}</span></div>
        )}
        {wastewaterAmount !== null && (
          <div><span className="text-gray-400 block">davon Schmutzwasser</span><span className="font-semibold text-gray-700 dark:text-gray-300">{formatEur(wastewaterAmount)}</span></div>
        )}
        {rainwaterAmount !== null && (
          <div><span className="text-gray-400 block">davon Niederschlag</span><span className="font-semibold text-blue-600 dark:text-blue-400">{formatEur(rainwaterAmount)}</span></div>
        )}
        {isWater && (rainwaterAmount !== null || wastewaterAmount !== null) && totalAmount !== null && (
          <div><span className="text-gray-400 block">Trinkwasser</span><span className="font-semibold text-gray-900 dark:text-gray-100">{formatEur(totalAmount - (rainwaterAmount ?? 0) - (wastewaterAmount ?? 0))}</span></div>
        )}
      </div>

      {isWater && (
        <div className="text-xs rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-3 py-2 text-blue-700 dark:text-blue-300 space-y-0.5">
          {totalAmount !== null && (rainwaterAmount !== null || wastewaterAmount !== null) ? (
            <>
              <div>✓ <strong>Trinkwasser</strong> ({formatEur(totalAmount - (rainwaterAmount ?? 0) - (wastewaterAmount ?? 0))}) nach Zähler auf EG / OG / DG / DU</div>
              {wastewaterAmount !== null && <div>✓ <strong>Schmutzwasser</strong> ({formatEur(wastewaterAmount)}) nach Zähler auf EG / OG / DG / DU</div>}
              {rainwaterAmount !== null && <div>✓ <strong>Niederschlagswasser</strong> ({formatEur(rainwaterAmount)}) je ¼ auf EG / OG / DG / DU</div>}
            </>
          ) : (
            <div className="text-amber-700 dark:text-amber-400">Schmutzwasser / Niederschlag nicht erkannt – bitte KDÜ prüfen.</div>
          )}
        </div>
      )}

      {isEvs && evsBins.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Mülltonnen ({evsBins.length} Tonnen erkannt)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {evsBins.map((bin) => {
              const rawId = String(bin.bin_id ?? "");
              const normalizedId = rawId.replace(/^0+/, "") || rawId;
              const aptCode = binToApt[normalizedId];
              const emptyingCount = (bin.emptyings || []).reduce((s, e) => s + (e.count || 0), 0);
              return (
                <div
                  key={rawId}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${aptCode ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}
                >
                  <div>
                    <span className="font-mono font-bold text-brand-700 dark:text-brand-400">{normalizedId}</span>
                    {bin.bin_size && <span className="ml-1.5 text-gray-400">{bin.bin_size}</span>}
                    <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                      {emptyingCount > 0 && <span>{emptyingCount}× Leerung · </span>}
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{formatEur(bin.total ?? 0)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {aptCode ? (
                      <span className="font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded">{aptCode}</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">nicht zugeordnet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
