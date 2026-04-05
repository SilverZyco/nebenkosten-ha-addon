"use client";

import { useEffect, useState, useRef } from "react";
import { meterReadingsApi, apartmentsApi } from "@/lib/api";
import { METER_TYPE_LABELS, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { Plus, Trash2, RefreshCw, Camera, CheckCircle, AlertTriangle, X, Pencil, Gauge } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";

interface MeterReading {
  id: string;
  apartment_id: string | null;
  apartment_code: string | null;
  meter_type: string;
  reading_date: string;
  value: string;
  unit: string;
  year: number;
  is_start_of_year: boolean;
  is_end_of_year: boolean;
  is_intermediate: boolean;
  is_replacement_start: boolean;
  notes: string | null;
  photo_filename: string | null;
}

interface Apartment {
  id: string;
  code: string;
  name: string;
  has_washer_meter: boolean;
  has_zenner_meter: boolean;
}

interface ScanResult {
  detected_value: number | null;
  confidence: "high" | "medium" | "none";
  method: string;
  raw_text: string;
  detected_meter_type: string | null;
  matched_apartment_id: string | null;
  matched_meter_type: string | null;
  detected_meter_number: string | null;
  photo_filename: string | null;
}

const MAIN_METERS = ["water_main", "gas_main", "electricity_common"];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const photoUrl = (filename: string) =>
  `${API_BASE}/api/v1/admin/meter-readings/photo/${filename}`;

type QuickFilter = "all" | "start" | "end" | "intermediate" | "replacement";

export default function ZaehlerstaendePage() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  // Quick-Photo Modal
  const quickCameraRef = useRef<HTMLInputElement>(null);
  const [quickScanning, setQuickScanning] = useState(false);
  const [quickModal, setQuickModal] = useState<{
    photoPreview: string;
    scanResult: ScanResult;
  } | null>(null);
  const [quickForm, setQuickForm] = useState({
    meter_type: "water_apartment",
    apartment_id: "",
    year: String(currentYear),
    reading_date: new Date().toISOString().split("T")[0],
    value: "",
    is_start_of_year: false,
    is_end_of_year: false,
  });

  // Manual Form
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    apartment_id: "",
    meter_type: "water_apartment",
    reading_date: new Date().toISOString().split("T")[0],
    value: "",
    year: String(currentYear),
    is_start_of_year: false,
    is_end_of_year: false,
    is_intermediate: false,
    is_replacement_start: false,
    notes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [readingsRes, aptRes] = await Promise.all([
        meterReadingsApi.list({ year: parseInt(filterYear) }),
        apartmentsApi.list(),
      ]);
      setReadings(readingsRes.data);
      setApartments(aptRes.data);
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filterYear]);

  // Quick-Photo: capture + scan
  const handleQuickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setQuickScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await meterReadingsApi.scanImage(fd);
      const result: ScanResult = res.data;

      const autoApartmentId = result.matched_apartment_id ?? "";
      const autoMeterType = result.matched_meter_type ?? result.detected_meter_type ?? "";

      setQuickForm(f => ({
        ...f,
        value: result.detected_value !== null ? String(result.detected_value) : "",
        year: filterYear,
        ...(autoMeterType ? { meter_type: autoMeterType } : {}),
        ...(autoApartmentId ? { apartment_id: autoApartmentId } : {}),
      }));
      setQuickModal({ photoPreview: url, scanResult: result });

      const parts: string[] = [];
      if (result.detected_value !== null) parts.push(`Wert: ${result.detected_value}`);
      if (result.detected_meter_number && result.matched_meter_type) {
        parts.push(`Nr. ${result.detected_meter_number} erkannt`);
      } else if (autoMeterType) {
        parts.push(METER_TYPE_LABELS[autoMeterType] ?? autoMeterType);
      }
      if (autoApartmentId) parts.push(`Wohnung vorgewählt`);

      if (parts.length > 0) {
        toast.success(`Erkannt: ${parts.join(" · ")}`);
      } else {
        toast("Nichts erkannt – bitte manuell ausfüllen", { icon: "⚠️" });
      }
    } catch {
      toast.error("Scan fehlgeschlagen");
    } finally {
      setQuickScanning(false);
      if (e.target) e.target.value = "";
    }
  };

  const submitQuick = async () => {
    if (!quickForm.value) return toast.error("Zählerstand erforderlich");
    if (!quickForm.year) return toast.error("Jahr erforderlich");
    try {
      const payload: Record<string, unknown> = {
        meter_type: quickForm.meter_type,
        reading_date: quickForm.reading_date,
        value: parseFloat(quickForm.value),
        year: parseInt(quickForm.year),
        is_start_of_year: quickForm.is_start_of_year,
        is_end_of_year: quickForm.is_end_of_year,
        is_intermediate: false,
        photo_filename: quickModal?.scanResult.photo_filename ?? null,
      };
      if (!MAIN_METERS.includes(quickForm.meter_type) && quickForm.apartment_id) {
        payload.apartment_id = quickForm.apartment_id;
      }
      await meterReadingsApi.create(payload);
      toast.success("Zählerstand gespeichert");
      setQuickModal(null);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Speichern";
      toast.error(msg);
    }
  };

  // Manual form photo capture
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
    setScanResult(null);
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await meterReadingsApi.scanImage(fd);
      const result: ScanResult = res.data;
      setScanResult(result);
      const autoMeterType = result.matched_meter_type ?? result.detected_meter_type ?? "";
      if (result.detected_value !== null || autoMeterType || result.matched_apartment_id) {
        setForm((f) => ({
          ...f,
          ...(result.detected_value !== null ? { value: String(result.detected_value) } : {}),
          ...(autoMeterType ? { meter_type: autoMeterType } : {}),
          ...(result.matched_apartment_id ? { apartment_id: result.matched_apartment_id } : {}),
        }));
        const parts: string[] = [];
        if (result.detected_value !== null) parts.push(`Wert: ${result.detected_value}`);
        if (result.detected_meter_number && result.matched_meter_type) parts.push(`Nr. ${result.detected_meter_number} erkannt`);
        else if (autoMeterType) parts.push(METER_TYPE_LABELS[autoMeterType] ?? autoMeterType);
        toast.success(`Erkannt: ${parts.join(" · ")}`);
      } else {
        toast.error("Nichts erkannt — bitte manuell eingeben");
      }
    } catch {
      toast.error("Scan fehlgeschlagen");
    } finally {
      setScanning(false);
      if (e.target) e.target.value = "";
    }
  };

  const clearScan = () => { setScanResult(null); setPhotoPreview(null); };

  // Lightbox
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.value) return toast.error("Wert erforderlich");
    try {
      const payload: Record<string, unknown> = {
        meter_type: form.meter_type,
        reading_date: form.reading_date,
        value: parseFloat(form.value),
        year: parseInt(form.year) || currentYear,
        is_start_of_year: form.is_start_of_year,
        is_end_of_year: form.is_end_of_year,
        is_intermediate: form.is_intermediate,
        is_replacement_start: form.is_replacement_start,
        notes: form.notes || null,
        photo_filename: scanResult?.photo_filename ?? null,
      };
      if (!MAIN_METERS.includes(form.meter_type) && form.apartment_id) {
        payload.apartment_id = form.apartment_id;
      }
      await meterReadingsApi.create(payload);
      toast.success("Zählerstand gespeichert");
      setShowForm(false);
      clearScan();
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Speichern";
      toast.error(msg);
    }
  };

  // Edit Modal
  const [editingReading, setEditingReading] = useState<MeterReading | null>(null);
  const [editForm, setEditForm] = useState({
    value: "",
    reading_date: "",
    year: String(currentYear),
    is_start_of_year: false,
    is_end_of_year: false,
    is_intermediate: false,
    is_replacement_start: false,
    notes: "",
  });

  const openEdit = (r: MeterReading) => {
    setEditingReading(r);
    setEditForm({
      value: r.value,
      reading_date: r.reading_date,
      year: String(r.year),
      is_start_of_year: r.is_start_of_year,
      is_end_of_year: r.is_end_of_year,
      is_intermediate: r.is_intermediate,
      is_replacement_start: r.is_replacement_start,
      notes: r.notes || "",
    });
  };

  const submitEdit = async () => {
    if (!editingReading) return;
    if (!editForm.value) return toast.error("Wert erforderlich");
    try {
      await meterReadingsApi.update(editingReading.id, {
        value: parseFloat(editForm.value),
        reading_date: editForm.reading_date,
        year: parseInt(editForm.year),
        is_start_of_year: editForm.is_start_of_year,
        is_end_of_year: editForm.is_end_of_year,
        is_intermediate: editForm.is_intermediate,
        is_replacement_start: editForm.is_replacement_start,
        notes: editForm.notes || null,
      });
      toast.success("Zählerstand aktualisiert");
      setEditingReading(null);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Speichern";
      toast.error(msg);
    }
  };

  const deleteReading = async (id: string) => {
    if (!window.confirm("Zählerstand löschen?")) return;
    try {
      await meterReadingsApi.delete(id);
      toast.success("Gelöscht");
      fetchData();
    } catch {
      toast.error("Fehler");
    }
  };

  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const isMainMeter = MAIN_METERS.includes(quickForm.meter_type);

  // Apply quick filter
  const filteredReadings = readings.filter((r) => {
    if (quickFilter === "start") return r.is_start_of_year;
    if (quickFilter === "end") return r.is_end_of_year;
    if (quickFilter === "intermediate") return r.is_intermediate;
    if (quickFilter === "replacement") return r.is_replacement_start;
    return true;
  });

  const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
    { key: "all", label: "Alle" },
    { key: "start", label: "Jahresanfang" },
    { key: "end", label: "Jahresende" },
    { key: "intermediate", label: "Zwischenablesung" },
    { key: "replacement", label: "Zählerwechsel" },
  ];

  return (
    <>
      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Zähler-Foto groß"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/40 rounded-full p-2"
            onClick={() => setLightboxImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={quickCameraRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleQuickPhoto}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoCapture}
      />

      <div className="p-6 space-y-5 flex-1 overflow-y-auto">
        <PageHeader
          title="Zählerstände"
          subtitle="Erfassung der Zählerwerte für die Nebenkostenabrechnung"
          actions={
            <div className="flex gap-2">
              <button
                onClick={() => quickCameraRef.current?.click()}
                disabled={quickScanning}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm disabled:opacity-50"
              >
                {quickScanning ? (
                  <span className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {quickScanning ? "Erkennung …" : "Foto"}
              </button>
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Manuell erfassen
              </button>
            </div>
          }
        />

        {/* Info Box */}
        <Card className="p-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
              <Gauge className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">So gehst du vor</p>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-0.5 list-decimal list-inside">
                <li><strong>Jahresanfang-Stände</strong> am 1. Januar aller Zähler eintragen</li>
                <li><strong>Jahresende-Stände</strong> am 31. Dezember aller Zähler eintragen</li>
                <li><strong>Bei Mieterwechsel:</strong> Zwischenablesung am Auszugstag eintragen</li>
                <li><strong>Bei Zählerwechsel:</strong> Startstand des neuen Zählers mit &quot;Zählerwechsel&quot; markieren</li>
              </ol>
            </div>
          </div>
        </Card>

        {/* Manual Form */}
        {showForm && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Neuer Zählerstand (manuell)</h3>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={scanning}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm disabled:opacity-50"
              >
                {scanning ? (
                  <span className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {scanning ? "Wird erkannt …" : "Foto aufnehmen"}
              </button>
            </div>

            {(photoPreview || scanResult) && (
              <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
                {photoPreview && (
                  <div
                    className="relative cursor-zoom-in rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700"
                    onClick={() => setLightboxImage(photoPreview)}
                    title="Klicken zum Vergrößern"
                  >
                    <img src={photoPreview} alt="Zähler-Foto" className="w-full max-h-48 object-contain" />
                    <div className="absolute bottom-2 right-2 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full">
                      Vergrößern
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {scanning && <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">OCR läuft …</p>}
                    {scanResult && !scanning && (
                      <>
                        {scanResult.detected_value !== null ? (
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="font-semibold text-gray-800 dark:text-gray-100">Erkannt: {scanResult.detected_value}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              scanResult.confidence === "high" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                              scanResult.confidence === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" :
                              "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                            }`}>
                              {scanResult.confidence === "high" ? "KI" : scanResult.confidence === "medium" ? "OCR" : "–"}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="text-sm text-amber-700 dark:text-amber-400">Kein Wert erkannt — bitte manuell eingeben</span>
                          </div>
                        )}
                        {scanResult.raw_text && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate" title={scanResult.raw_text}>
                            OCR-Text: {scanResult.raw_text.slice(0, 80)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <button onClick={clearScan} className="text-gray-300 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Zählertyp *</label>
                <select
                  value={form.meter_type}
                  onChange={(e) => setForm({ ...form, meter_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {Object.entries(METER_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {!MAIN_METERS.includes(form.meter_type) && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Wohnung *</label>
                  <select
                    value={form.apartment_id}
                    onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">– Wählen –</option>
                    {apartments.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Ablesedatum *</label>
                <input
                  type="date"
                  value={form.reading_date}
                  onChange={(e) => setForm({ ...form, reading_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                  Zählerstand *
                  {form.meter_type === "zenner_heat" ? " (MWh)" : form.meter_type === "electricity_common" ? " (kWh)" : " (m³)"}
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={form.meter_type === "zenner_heat" ? "0.000 MWh" : form.meter_type === "electricity_common" ? "0 kWh" : "0.000 m³"}
                  required
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Jahr</label>
                <select
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notizen</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Optional"
                />
              </div>

              <div className="col-span-full flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.is_start_of_year}
                    onChange={(e) => setForm({ ...form, is_start_of_year: e.target.checked, is_end_of_year: false })}
                    className="w-4 h-4 rounded" />
                  Jahresanfang
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.is_end_of_year}
                    onChange={(e) => setForm({ ...form, is_end_of_year: e.target.checked, is_start_of_year: false })}
                    className="w-4 h-4 rounded" />
                  Jahresende
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.is_intermediate}
                    onChange={(e) => setForm({ ...form, is_intermediate: e.target.checked, is_replacement_start: false })}
                    className="w-4 h-4 rounded" />
                  Zwischenablesung (Mieterwechsel)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-orange-700 dark:text-orange-400">
                  <input type="checkbox" checked={form.is_replacement_start}
                    onChange={(e) => setForm({ ...form, is_replacement_start: e.target.checked, is_intermediate: false, is_start_of_year: false, is_end_of_year: false })}
                    className="w-4 h-4 rounded" />
                  Zählerwechsel (Startstand neuer Zähler)
                </label>
              </div>

              <div className="col-span-full flex gap-3">
                <button type="submit" className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium">
                  Speichern
                </button>
                <button type="button" onClick={() => { setShowForm(false); clearScan(); }}
                  className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">
                  Abbrechen
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            <div className="flex gap-1 flex-wrap">
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setQuickFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    quickFilter === f.key
                      ? "bg-brand-900 text-white border-brand-900"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchData}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm ml-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
            </button>
          </div>
        </Card>

        {/* Table */}
        <Card>
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredReadings.length === 0 ? (
            <EmptyState
              icon={Gauge}
              title={quickFilter !== "all" ? "Keine Einträge für diesen Filter" : `Keine Zählerstände für ${filterYear}`}
              description={quickFilter !== "all" ? "Wechsle den Filter oder erfasse neue Stände." : "Erfasse Jahresanfang- und Jahresende-Stände für alle Zähler."}
              action={
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Jetzt erfassen
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wohnung</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Zählertyp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Datum</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wert</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Typ</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notizen</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Foto</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredReadings.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {r.apartment_code || (MAIN_METERS.includes(r.meter_type) ? "Haus" : "–")}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {METER_TYPE_LABELS[r.meter_type] || r.meter_type}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDate(r.reading_date)}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-gray-900 dark:text-gray-100">
                        {r.value} {r.unit}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center flex-wrap">
                          {r.is_start_of_year && <Badge variant="blue" size="sm">Jahresanfang</Badge>}
                          {r.is_end_of_year && <Badge variant="green" size="sm">Jahresende</Badge>}
                          {r.is_intermediate && <Badge variant="yellow" size="sm">Zwischen</Badge>}
                          {r.is_replacement_start && <Badge variant="orange" size="sm">Zählerwechsel</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.notes || "–"}</td>
                      <td className="px-4 py-3 text-center">
                        {r.photo_filename ? (
                          <button
                            onClick={() => setLightboxImage(photoUrl(r.photo_filename!))}
                            className="inline-block"
                            title="Foto anzeigen"
                          >
                            <img
                              src={photoUrl(r.photo_filename)}
                              alt="Zähler"
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200 dark:border-gray-600 hover:border-brand-400 hover:scale-110 transition-transform cursor-zoom-in"
                            />
                          </button>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            title="Bearbeiten"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteReading(r.id)}
                            className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Quick-Photo Modal */}
      <Modal
        open={!!quickModal}
        onClose={() => setQuickModal(null)}
        title="Zählerstand erfassen"
        size="md"
        footer={
          <>
            <button
              onClick={() => setQuickModal(null)}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Abbrechen
            </button>
            <button
              onClick={submitQuick}
              className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium"
            >
              Speichern
            </button>
          </>
        }
      >
        {quickModal && (
          <div className="space-y-4">
            {/* Scan status */}
            <div className="flex flex-col gap-1">
              {quickModal.scanResult.detected_value !== null ? (
                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  Wert erkannt ({quickModal.scanResult.confidence === "high" ? "KI" : "OCR"})
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  Wert nicht erkannt – bitte unten eingeben
                </span>
              )}
              {quickModal.scanResult.matched_meter_type && (
                <span className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                  <CheckCircle className="w-4 h-4" />
                  Zähler Nr. {quickModal.scanResult.detected_meter_number} erkannt
                </span>
              )}
            </div>

            {/* Photo */}
            <div
              className="relative cursor-zoom-in rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
              onClick={() => setLightboxImage(quickModal.photoPreview)}
              title="Klicken zum Vergrößern"
            >
              <img
                src={quickModal.photoPreview}
                alt="Zähler"
                className="w-full max-h-56 object-contain"
              />
              <div className="absolute bottom-2 right-2 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full">
                Vergrößern
              </div>
            </div>

            {/* Value input */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block font-medium">Zählerstand *</label>
              <input
                type="number"
                step="0.001"
                value={quickForm.value}
                onChange={(e) => setQuickForm(f => ({ ...f, value: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-lg font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="0.000"
                autoFocus
              />
            </div>

            {/* Year */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block font-medium">Abrechnungsjahr *</label>
              <div className="flex gap-2 flex-wrap">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setQuickForm(f => ({ ...f, year: String(y) }))}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      quickForm.year === String(y)
                        ? "bg-brand-900 text-white border-brand-900"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {/* Start / End toggle */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block font-medium">Ablesung Typ *</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQuickForm(f => ({ ...f, is_start_of_year: true, is_end_of_year: false }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    quickForm.is_start_of_year
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  Jahresanfang
                </button>
                <button
                  type="button"
                  onClick={() => setQuickForm(f => ({ ...f, is_end_of_year: true, is_start_of_year: false }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    quickForm.is_end_of_year
                      ? "bg-green-600 text-white border-green-600"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  Jahresende
                </button>
                <button
                  type="button"
                  onClick={() => setQuickForm(f => ({ ...f, is_start_of_year: false, is_end_of_year: false }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    !quickForm.is_start_of_year && !quickForm.is_end_of_year
                      ? "bg-gray-700 text-white border-gray-700"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  Sonstige
                </button>
              </div>
            </div>

            {/* Meter type */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block font-medium">Zählertyp *</label>
              <select
                value={quickForm.meter_type}
                onChange={(e) => setQuickForm(f => ({ ...f, meter_type: e.target.value, apartment_id: "" }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {Object.entries(METER_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Apartment */}
            {!isMainMeter && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block font-medium">Wohnung *</label>
                <div className="flex gap-2 flex-wrap">
                  {apartments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setQuickForm(f => ({ ...f, apartment_id: a.id }))}
                      className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                        quickForm.apartment_id === a.id
                          ? "bg-brand-900 text-white border-brand-900"
                          : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {a.code}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block font-medium">Ablesedatum</label>
              <input
                type="date"
                value={quickForm.reading_date}
                onChange={(e) => setQuickForm(f => ({ ...f, reading_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editingReading}
        onClose={() => setEditingReading(null)}
        title={`Zählerstand bearbeiten – ${editingReading?.apartment_code || "Haus"} · ${editingReading ? (METER_TYPE_LABELS[editingReading.meter_type] || editingReading.meter_type) : ""}`}
        size="md"
        footer={
          <>
            <button
              onClick={() => setEditingReading(null)}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Abbrechen
            </button>
            <button
              onClick={submitEdit}
              className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium"
            >
              Speichern
            </button>
          </>
        }
      >
        {editingReading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block font-medium">
                  Zählerstand *{" "}
                  <span className="text-gray-400">
                    ({editingReading.unit || (editingReading.meter_type === "zenner_heat" ? "MWh" : "m³")})
                  </span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={editForm.value}
                  onChange={(e) => setEditForm(f => ({ ...f, value: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-lg font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block font-medium">Ablesedatum *</label>
                <input
                  type="date"
                  value={editForm.reading_date}
                  onChange={(e) => setEditForm(f => ({ ...f, reading_date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block font-medium">Jahr</label>
              <div className="flex gap-2 flex-wrap">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, year: String(y) }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                      editForm.year === String(y)
                        ? "bg-brand-900 text-white border-brand-900"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editForm.is_start_of_year}
                  onChange={(e) => setEditForm(f => ({ ...f, is_start_of_year: e.target.checked, is_end_of_year: false, is_intermediate: false }))}
                  className="w-4 h-4 rounded"
                />
                Jahresanfang
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editForm.is_end_of_year}
                  onChange={(e) => setEditForm(f => ({ ...f, is_end_of_year: e.target.checked, is_start_of_year: false, is_intermediate: false }))}
                  className="w-4 h-4 rounded"
                />
                Jahresende
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={editForm.is_intermediate}
                  onChange={(e) => setEditForm(f => ({ ...f, is_intermediate: e.target.checked, is_start_of_year: false, is_end_of_year: false, is_replacement_start: false }))}
                  className="w-4 h-4 rounded"
                />
                Zwischenablesung
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-orange-700 dark:text-orange-400">
                <input
                  type="checkbox"
                  checked={editForm.is_replacement_start}
                  onChange={(e) => setEditForm(f => ({ ...f, is_replacement_start: e.target.checked, is_start_of_year: false, is_end_of_year: false, is_intermediate: false }))}
                  className="w-4 h-4 rounded"
                />
                Zählerwechsel (Startstand neuer Zähler)
              </label>
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block font-medium">Notizen</label>
              <input
                type="text"
                value={editForm.notes}
                onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Optional"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
