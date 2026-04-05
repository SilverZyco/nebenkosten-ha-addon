"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { rentalContractsApi, apartmentsApi, usersApi } from "@/lib/api";
import { formatDate, formatEur } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  Plus, X, Send, Download, Pencil, Trash2, FileText, Clock, CheckCircle2,
  Eye, PenLine, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";

interface Apartment {
  id: string;
  code: string;
  name: string;
  area_sqm: number | null;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface RentalContract {
  id: string;
  apartment_id: string;
  apartment_code: string | null;
  apartment_name: string | null;
  apartment_area_sqm: number | null;
  tenant_user_id: string | null;
  tenant_user_name: string | null;
  tenant_name: string;
  tenant_address1: string | null;
  tenant_address2: string | null;
  tenant_address3: string | null;
  start_date: string;
  monthly_rent: string;
  advance_payment: string;
  kitchen_fee: string | null;
  deposit: string;
  special_notes: string | null;
  contract_paragraphs: Record<string, string> | null;
  has_cellar: boolean;
  deposit_months: number;
  status: "draft" | "sent" | "signed";
  tenant_signed_at: string | null;
  landlord_signed_at: string | null;
  pdf_filename: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  sent: "Gesendet",
  signed: "Unterschrieben",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-amber-100 text-amber-700",
  signed: "bg-green-100 text-green-700",
};

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

const emptyForm = {
  apartment_id: "",
  tenant_user_id: "",
  tenant_name: "",
  tenant_address1: "",
  tenant_address2: "",
  tenant_address3: "",
  start_date: "",
  monthly_rent: "",
  advance_payment: "",
  kitchen_fee: "",
  special_notes: "",
  has_cellar: true,
  deposit_months: 3,
};

// ── Canvas drawing hook ──────────────────────────────────────────────────────
function useSignatureCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

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

  function resetForModal() {
    setHasSignature(false);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        fillWhite(canvas);
      }
    }, 50);
  }

  function getDataUrl() {
    return canvasRef.current?.toDataURL("image/jpeg", 0.95) ?? "";
  }

  return { canvasRef, hasSignature, startDraw, draw, endDraw, clearCanvas, resetForModal, getDataUrl };
}

export default function MietvertragPage() {
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState<"details" | "text">("details");
  const [paragraphs, setParagraphs] = useState<Record<string, string>>({});
  const [loadingParas, setLoadingParas] = useState(false);
  const [saving, setSaving] = useState(false);

  // Preview modal
  const [previewContract, setPreviewContract] = useState<RentalContract | null>(null);

  // Landlord sign modal
  const [landlordSignContract, setLandlordSignContract] = useState<RentalContract | null>(null);
  const [signingLandlord, setSigningLandlord] = useState(false);
  const landlordSig = useSignatureCanvas();

  // Direct sign modal (tenant signs in person at admin portal)
  const [directSignContract, setDirectSignContract] = useState<RentalContract | null>(null);
  const [signingDirect, setSigningDirect] = useState(false);
  const directSig = useSignatureCanvas();

  // Delete all modal
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Per-contract actions
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [generatingDemo, setGeneratingDemo] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cRes, aRes, uRes] = await Promise.all([
        rentalContractsApi.list(),
        apartmentsApi.list(),
        usersApi.list(),
      ]);
      setContracts(cRes.data);
      setApartments(aRes.data);
      setTenantUsers((uRes.data as TenantUser[]).filter((u) => u.role === "tenant"));
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedApartment = apartments.find((a) => a.id === form.apartment_id) || null;

  // ── Load default paragraphs from API ───────────────────────────────────────
  async function loadDefaultParagraphs() {
    if (!form.apartment_id) {
      toast.error("Bitte zuerst eine Wohnung auswählen");
      return;
    }
    setLoadingParas(true);
    try {
      const apt = apartments.find((a) => a.id === form.apartment_id);
      const res = await rentalContractsApi.defaultParagraphs({
        tenant_name: form.tenant_name || "Mieter",
        apartment_code: apt?.code || "",
        area_sqm: apt?.area_sqm || 0,
        start_date: form.start_date || "",
        monthly_rent: parseFloat(form.monthly_rent) || 0,
        advance_payment: parseFloat(form.advance_payment) || 0,
        kitchen_fee: parseFloat(form.kitchen_fee) || 0,
        deposit_months: form.deposit_months,
      });
      setParagraphs(res.data);
    } catch {
      toast.error("Standardtexte konnten nicht geladen werden");
    } finally {
      setLoadingParas(false);
    }
  }

  // ── Tab switch: auto-load paragraphs if empty ──────────────────────────────
  async function switchToTextTab() {
    setActiveTab("text");
    if (Object.keys(paragraphs).length === 0) {
      await loadDefaultParagraphs();
    }
  }

  // ── Form open/close ────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null);
    setForm(emptyForm);
    setParagraphs({});
    setActiveTab("details");
    setShowForm(true);
  }

  function openEdit(c: RentalContract) {
    setEditId(c.id);
    setForm({
      apartment_id: c.apartment_id,
      tenant_user_id: c.tenant_user_id || "",
      tenant_name: c.tenant_name,
      tenant_address1: c.tenant_address1 || "",
      tenant_address2: c.tenant_address2 || "",
      tenant_address3: c.tenant_address3 || "",
      start_date: c.start_date,
      monthly_rent: c.monthly_rent,
      advance_payment: c.advance_payment,
      kitchen_fee: c.kitchen_fee || "",
      special_notes: c.special_notes || "",
      has_cellar: c.has_cellar ?? true,
      deposit_months: c.deposit_months ?? 3,
    });
    setParagraphs(c.contract_paragraphs || {});
    setActiveTab("details");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.apartment_id || !form.tenant_name || !form.start_date || !form.monthly_rent || !form.advance_payment) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        apartment_id: form.apartment_id,
        tenant_user_id: form.tenant_user_id || null,
        tenant_name: form.tenant_name,
        tenant_address1: form.tenant_address1 || null,
        tenant_address2: form.tenant_address2 || null,
        tenant_address3: form.tenant_address3 || null,
        start_date: form.start_date,
        monthly_rent: parseFloat(form.monthly_rent),
        advance_payment: parseFloat(form.advance_payment),
        kitchen_fee: form.kitchen_fee ? parseFloat(form.kitchen_fee) : null,
        special_notes: form.special_notes || null,
        has_cellar: form.has_cellar,
        deposit_months: form.deposit_months,
        contract_paragraphs: Object.keys(paragraphs).length > 0 ? paragraphs : null,
      };
      if (editId) {
        await rentalContractsApi.update(editId, payload);
        toast.success("Vertrag aktualisiert");
      } else {
        await rentalContractsApi.create(payload);
        toast.success("Vertrag erstellt");
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(id: string) {
    if (!confirm("Vertrag an Mieter senden? Der Mieter sieht ihn dann zur Unterschrift.")) return;
    try {
      await rentalContractsApi.send(id);
      toast.success("Vertrag gesendet");
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Fehler beim Senden");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Vertrag löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    try {
      await rentalContractsApi.delete(id);
      toast.success("Vertrag gelöscht");
      load();
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  }

  async function handleDeleteAll() {
    setDeletingAll(true);
    try {
      for (const c of contracts) {
        await rentalContractsApi.delete(c.id);
      }
      toast.success("Alle Verträge gelöscht");
      setShowDeleteAll(false);
      load();
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeletingAll(false);
    }
  }

  async function handleGeneratePdf(id: string) {
    setGeneratingPdf(id);
    try {
      await rentalContractsApi.generatePdf(id);
      toast.success("PDF erstellt");
      load();
    } catch {
      toast.error("PDF-Erstellung fehlgeschlagen");
    } finally {
      setGeneratingPdf(null);
    }
  }

  // ── Demo PDF ───────────────────────────────────────────────────────────────
  async function handleDemoPdf() {
    setGeneratingDemo(true);
    try {
      const apt = apartments.find((a) => a.id === form.apartment_id);
      const payload: Record<string, unknown> = {
        tenant_name: form.tenant_name || "Mustermann",
        apartment_code: apt?.code || "",
        apartment_name: apt?.name || "",
        area_sqm: apt?.area_sqm || null,
        tenant_address1: form.tenant_address1 || null,
        tenant_address2: form.tenant_address2 || null,
        tenant_address3: form.tenant_address3 || null,
        start_date: form.start_date || new Date().toISOString().split("T")[0],
        monthly_rent: parseFloat(form.monthly_rent) || 0,
        advance_payment: parseFloat(form.advance_payment) || 0,
        kitchen_fee: form.kitchen_fee ? parseFloat(form.kitchen_fee) : null,
        special_notes: form.special_notes || null,
        has_cellar: form.has_cellar,
        deposit_months: form.deposit_months,
        contract_paragraphs: Object.keys(paragraphs).length > 0 ? paragraphs : null,
      };
      const res = await rentalContractsApi.demoPdf(payload);
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Mietvertrag_Vorschau_${form.tenant_name || "Demo"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Vorschau-PDF konnte nicht erstellt werden");
    } finally {
      setGeneratingDemo(false);
    }
  }

  // ── Landlord sign ──────────────────────────────────────────────────────────
  function openLandlordSign(c: RentalContract) {
    setLandlordSignContract(c);
    landlordSig.resetForModal();
  }

  async function handleLandlordSign() {
    if (!landlordSignContract || !landlordSig.hasSignature) {
      toast.error("Bitte unterschreiben Sie zuerst");
      return;
    }
    setSigningLandlord(true);
    try {
      await rentalContractsApi.landlordSign(landlordSignContract.id, landlordSig.getDataUrl());
      toast.success("Vertrag vom Vermieter unterschrieben. PDF wurde aktualisiert.");
      setLandlordSignContract(null);
      load();
    } catch {
      toast.error("Unterschrift konnte nicht gespeichert werden");
    } finally {
      setSigningLandlord(false);
    }
  }

  function openDirectSign(c: RentalContract) {
    setDirectSignContract(c);
    directSig.resetForModal();
  }

  async function handleDirectSign() {
    if (!directSignContract || !directSig.hasSignature) {
      toast.error("Bitte Unterschrift des Mieters einholen");
      return;
    }
    setSigningDirect(true);
    try {
      await rentalContractsApi.signDirect(directSignContract.id, directSig.getDataUrl());
      toast.success("Vertrag vor Ort unterschrieben. PDF erstellt.");
      setDirectSignContract(null);
      load();
    } catch {
      toast.error("Unterschrift konnte nicht gespeichert werden");
    } finally {
      setSigningDirect(false);
    }
  }

  return (
    <>
      <Topbar
        title="Mietverträge"
        subtitle="Digitale Mietverträge erstellen und verwalten"
      />

      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex gap-2">
            {contracts.length > 0 && (
              <button
                onClick={() => setShowDeleteAll(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Alle löschen</span>
              </button>
            )}
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-lg hover:bg-brand-800 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Neuer Vertrag
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contracts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>Noch keine Mietverträge vorhanden</p>
            <p className="text-sm text-gray-400 mt-1">Erstellen Sie den ersten digitalen Mietvertrag</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Mieter</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Wohnung</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Beginn</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Kaltmiete</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.tenant_name}</div>
                        {c.tenant_user_name && c.tenant_user_name !== c.tenant_name && (
                          <div className="text-xs text-gray-400">Login: {c.tenant_user_name}</div>
                        )}
                        {!c.tenant_user_id && (
                          <div className="text-xs text-amber-500">Kein Login zugeordnet</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.apartment_code
                          ? `${c.apartment_code} – ${FLOOR_LABELS[c.apartment_code] || c.apartment_name}`
                          : c.apartment_name || "–"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(c.start_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatEur(parseFloat(c.monthly_rent))}</td>
                      <td className="px-4 py-3">
                        <StatusBadge c={c} />
                      </td>
                      <td className="px-4 py-3">
                        <ContractActions
                          c={c}
                          generatingPdf={generatingPdf}
                          onEdit={() => openEdit(c)}
                          onSend={() => handleSend(c.id)}
                          onGeneratePdf={() => handleGeneratePdf(c.id)}
                          onDelete={() => handleDelete(c.id)}
                          onPreview={() => setPreviewContract(c)}
                          onLandlordSign={() => openLandlordSign(c)}
                          onDirectSign={() => openDirectSign(c)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {contracts.map((c) => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-gray-900">{c.tenant_name}</div>
                      <div className="text-sm text-gray-500">
                        {c.apartment_code
                          ? `${FLOOR_LABELS[c.apartment_code] || c.apartment_name}`
                          : c.apartment_name || "–"}
                      </div>
                    </div>
                    <StatusBadge c={c} />
                  </div>
                  <div className="text-sm text-gray-600 mb-3 space-y-0.5">
                    <div>Beginn: {formatDate(c.start_date)}</div>
                    <div>Kaltmiete: {formatEur(parseFloat(c.monthly_rent))}</div>
                    {!c.tenant_user_id && (
                      <div className="text-amber-500 text-xs">Kein Mieter-Login</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ContractActions
                      c={c}
                      generatingPdf={generatingPdf}
                      onEdit={() => openEdit(c)}
                      onSend={() => handleSend(c.id)}
                      onGeneratePdf={() => handleGeneratePdf(c.id)}
                      onDelete={() => handleDelete(c.id)}
                      onPreview={() => setPreviewContract(c)}
                      onLandlordSign={() => openLandlordSign(c)}
                      onDirectSign={() => openDirectSign(c)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Create/Edit Form Modal ──────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4 md:my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editId ? "Mietvertrag bearbeiten" : "Neuer Mietvertrag"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab("details")}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === "details"
                    ? "border-b-2 border-brand-700 text-brand-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Vertragsdetails
              </button>
              <button
                onClick={switchToTextTab}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === "text"
                    ? "border-b-2 border-brand-700 text-brand-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Vertragstext (20 §§)
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Tab: Details */}
              {activeTab === "details" && (
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* Wohnung */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Wohnung <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.apartment_id}
                      onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    >
                      <option value="">– Wohnung wählen –</option>
                      {apartments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} – {FLOOR_LABELS[a.code] || a.name}
                          {a.area_sqm ? ` (${a.area_sqm} m²)` : " (m² nicht hinterlegt)"}
                        </option>
                      ))}
                    </select>
                    {/* Info-Box nach Auswahl */}
                    {form.apartment_id && (() => {
                      const apt = apartments.find(a => a.id === form.apartment_id);
                      if (!apt) return null;
                      return apt.area_sqm ? (
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                          <span className="font-medium">{FLOOR_LABELS[apt.code] || apt.name}</span>
                          <span>·</span>
                          <span className="font-semibold">{apt.area_sqm} m²</span>
                          <span className="text-green-500">✓ wird in Mietvertrag übernommen</span>
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                          <span>⚠ Wohnfläche nicht hinterlegt – bitte zuerst unter</span>
                          <a href="/admin/wohnungen" className="underline font-medium">Wohnungen</a>
                          <span>eintragen</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Mieter-Login */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mieter-Login
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        (Account der den Vertrag unterschreibt)
                      </span>
                    </label>
                    <select
                      value={form.tenant_user_id}
                      onChange={(e) => {
                        const u = tenantUsers.find((u) => u.id === e.target.value);
                        setForm({
                          ...form,
                          tenant_user_id: e.target.value,
                          tenant_name: u ? u.name : form.tenant_name,
                        });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    >
                      <option value="">– Mieter-Account wählen –</option>
                      {tenantUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                    {tenantUsers.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Noch kein Mieter-Account vorhanden.
                      </p>
                    )}
                  </div>

                  {/* Mieter-Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mieter Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.tenant_name}
                      onChange={(e) => setForm({ ...form, tenant_name: e.target.value })}
                      required
                      placeholder="Vorname Nachname"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    />
                  </div>

                  {/* Adresse */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Mieter Adresse</label>
                    <input
                      type="text"
                      value={form.tenant_address1}
                      onChange={(e) => setForm({ ...form, tenant_address1: e.target.value })}
                      placeholder="Straße, Hausnummer"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    />
                    <input
                      type="text"
                      value={form.tenant_address2}
                      onChange={(e) => setForm({ ...form, tenant_address2: e.target.value })}
                      placeholder="PLZ, Ort"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    />
                    <input
                      type="text"
                      value={form.tenant_address3}
                      onChange={(e) => setForm({ ...form, tenant_address3: e.target.value })}
                      placeholder="Adresszusatz (optional)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    />
                  </div>

                  {/* Mietbeginn */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mietbeginn <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    />
                  </div>

                  {/* Miete */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kaltmiete (€) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.monthly_rent}
                        onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })}
                        required
                        placeholder="0,00"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        NK-Vorauszahlung (€) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.advance_payment}
                        onChange={(e) => setForm({ ...form, advance_payment: e.target.value })}
                        required
                        placeholder="0,00"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Küche (€, opt.)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.kitchen_fee}
                        onChange={(e) => setForm({ ...form, kitchen_fee: e.target.value })}
                        placeholder="0,00"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                      />
                    </div>
                  </div>

                  {/* Kaution Auswahl */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kaution
                    </label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, deposit_months: m })}
                          className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-colors ${
                            form.deposit_months === m
                              ? "bg-brand-900 text-white border-brand-900"
                              : "bg-white text-gray-600 border-gray-300 hover:border-brand-700"
                          }`}
                        >
                          {m}× Kaltmiete
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                      Kaution:{" "}
                      <strong>
                        {form.monthly_rent
                          ? formatEur(parseFloat(form.monthly_rent) * form.deposit_months)
                          : "–"}
                      </strong>
                      <span className="text-blue-500 ml-1">({form.deposit_months} × Kaltmiete)</span>
                    </div>
                  </div>

                  {/* Kellerraum */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kellerabteil inklusive
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, has_cellar: true })}
                        className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-colors ${
                          form.has_cellar
                            ? "bg-green-600 text-white border-green-600"
                            : "bg-white text-gray-600 border-gray-300 hover:border-green-500"
                        }`}
                      >
                        Ja
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, has_cellar: false })}
                        className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-colors ${
                          !form.has_cellar
                            ? "bg-gray-600 text-white border-gray-600"
                            : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"
                        }`}
                      >
                        Nein
                      </button>
                    </div>
                  </div>

                  {/* Sondervereinbarungen */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sondervereinbarungen
                    </label>
                    <textarea
                      rows={3}
                      value={form.special_notes}
                      onChange={(e) => setForm({ ...form, special_notes: e.target.value })}
                      placeholder="Optionale Sondervereinbarungen..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
                    />
                  </div>
                </div>
              )}

              {/* Tab: Vertragstext */}
              {activeTab === "text" && (
                <div className="p-5 max-h-[70vh] overflow-y-auto space-y-1">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-600">
                      Alle 20 Paragraphen bearbeitbar. Klicken Sie auf einen Text um ihn zu ändern.
                    </p>
                    <button
                      type="button"
                      onClick={loadDefaultParagraphs}
                      disabled={loadingParas}
                      className="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-900 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingParas ? "animate-spin" : ""}`} />
                      Zurücksetzen
                    </button>
                  </div>
                  {loadingParas ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    Object.entries(PARA_TITLES).map(([key, title]) => (
                      <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                          {title}
                        </div>
                        <textarea
                          value={paragraphs[key] || ""}
                          onChange={(e) => setParagraphs({ ...paragraphs, [key]: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 resize-y"
                          placeholder={`Text für ${title}…`}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between gap-3 px-5 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleDemoPdf}
                  disabled={generatingDemo}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-brand-700 border border-brand-300 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                >
                  <Eye className="w-4 h-4" />
                  {generatingDemo ? "Erstelle…" : "Vorschau PDF"}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50 font-medium"
                  >
                    {saving ? "Speichern…" : editId ? "Speichern" : "Vertrag erstellen"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Preview Modal ───────────────────────────────────────────────────── */}
      {previewContract && (
        <ContractPreviewModal
          contract={previewContract}
          onClose={() => setPreviewContract(null)}
        />
      )}

      {/* ── Landlord Sign Modal ─────────────────────────────────────────────── */}
      {landlordSignContract && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4 md:my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Vermieter-Unterschrift</h2>
              <button onClick={() => setLandlordSignContract(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 bg-green-50 border-b border-green-200 text-sm text-green-800">
              Der Mieter <strong>{landlordSignContract.tenant_name}</strong> hat bereits unterschrieben.
              Jetzt können Sie als Vermieter gegenzeichnen. Das PDF wird anschließend aktualisiert.
            </div>
            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unterschrift Vermieter (Alexander Klingel)
                <span className="text-xs text-gray-400 ml-2">mit Finger oder Maus zeichnen</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 touch-none">
                <canvas
                  ref={landlordSig.canvasRef}
                  width={600}
                  height={180}
                  className="w-full rounded-lg cursor-crosshair"
                  style={{ height: "150px" }}
                  onMouseDown={landlordSig.startDraw}
                  onMouseMove={landlordSig.draw}
                  onMouseUp={landlordSig.endDraw}
                  onMouseLeave={landlordSig.endDraw}
                  onTouchStart={landlordSig.startDraw}
                  onTouchMove={landlordSig.draw}
                  onTouchEnd={landlordSig.endDraw}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                {!landlordSig.hasSignature && (
                  <p className="text-xs text-gray-400">Bitte zeichnen Sie Ihre Unterschrift</p>
                )}
                <button
                  type="button"
                  onClick={landlordSig.clearCanvas}
                  className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Löschen
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => setLandlordSignContract(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleLandlordSign}
                disabled={signingLandlord || !landlordSig.hasSignature}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50 font-medium"
              >
                <PenLine className="w-4 h-4" />
                {signingLandlord ? "Speichern…" : "Gegenzeichnen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Direct Sign Modal (Vor Ort) ─────────────────────────────────────── */}
      {directSignContract && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4 md:my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Vor Ort unterschreiben</h2>
              <button onClick={() => setDirectSignContract(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 bg-blue-50 border-b border-blue-200 text-sm text-blue-800">
              <strong>{directSignContract.tenant_name}</strong> unterschreibt direkt hier vor Ort.
              Der Vertrag wird sofort als unterschrieben markiert und ein PDF erstellt.
              Ein Versand über das Mieterportal ist nicht nötig.
            </div>
            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unterschrift Mieter
                <span className="text-xs text-gray-400 ml-2">mit Finger oder Maus zeichnen</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 touch-none">
                <canvas
                  ref={directSig.canvasRef}
                  width={600}
                  height={180}
                  className="w-full rounded-lg cursor-crosshair"
                  style={{ height: "150px" }}
                  onMouseDown={directSig.startDraw}
                  onMouseMove={directSig.draw}
                  onMouseUp={directSig.endDraw}
                  onMouseLeave={directSig.endDraw}
                  onTouchStart={directSig.startDraw}
                  onTouchMove={directSig.draw}
                  onTouchEnd={directSig.endDraw}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                {!directSig.hasSignature && (
                  <p className="text-xs text-gray-400">Bitte Unterschrift des Mieters einholen</p>
                )}
                <button
                  type="button"
                  onClick={directSig.clearCanvas}
                  className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Löschen
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => setDirectSignContract(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDirectSign}
                disabled={signingDirect || !directSig.hasSignature}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                <PenLine className="w-4 h-4" />
                {signingDirect ? "Speichern…" : "Unterschrift bestätigen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete All Modal ────────────────────────────────────────────────── */}
      {showDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Alle Verträge löschen</h3>
                  <p className="text-sm text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Es werden <strong>{contracts.length} Verträge</strong> und alle zugehörigen PDFs unwiderruflich gelöscht.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteAll(false)}
                  className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deletingAll}
                  className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {deletingAll ? "Löschen…" : "Alle löschen"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ c }: { c: RentalContract }) {
  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-amber-100 text-amber-700",
    signed: "bg-green-100 text-green-700",
  };
  return (
    <div>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>
        {c.status === "draft" && <Clock className="w-3 h-3" />}
        {c.status === "sent" && <Send className="w-3 h-3" />}
        {c.status === "signed" && <CheckCircle2 className="w-3 h-3" />}
        {STATUS_LABELS[c.status]}
      </span>
      {c.status === "signed" && c.tenant_signed_at && (
        <div className="text-xs text-gray-400 mt-0.5">{formatDate(c.tenant_signed_at)}</div>
      )}
      {c.status === "signed" && c.landlord_signed_at && (
        <div className="text-xs text-green-600 mt-0.5">Vermieter: {formatDate(c.landlord_signed_at)}</div>
      )}
    </div>
  );
}

function ContractActions({
  c, generatingPdf, onEdit, onSend, onGeneratePdf, onDelete, onPreview, onLandlordSign, onDirectSign,
}: {
  c: RentalContract;
  generatingPdf: string | null;
  onEdit: () => void;
  onSend: () => void;
  onGeneratePdf: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onLandlordSign: () => void;
  onDirectSign: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      {/* Preview */}
      <button
        onClick={onPreview}
        className="p-1.5 text-gray-500 hover:text-brand-700 hover:bg-brand-50 rounded"
        title="Vorschau"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>

      {/* Edit – only DRAFT */}
      {c.status === "draft" && (
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-500 hover:text-brand-700 hover:bg-brand-50 rounded"
          title="Bearbeiten"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Send – only DRAFT */}
      {c.status === "draft" && (
        <button
          onClick={onSend}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600"
        >
          <Send className="w-3 h-3" />
          Senden
        </button>
      )}

      {/* Direct sign – DRAFT or SENT (no portal needed) */}
      {(c.status === "draft" || c.status === "sent") && (
        <button
          onClick={onDirectSign}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
          title="Mieter unterschreibt vor Ort"
        >
          <PenLine className="w-3 h-3" />
          Vor Ort
        </button>
      )}

      {/* Landlord sign – only when signed by tenant but not yet by landlord */}
      {c.status === "signed" && !c.landlord_signed_at && (
        <button
          onClick={onLandlordSign}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-brand-800 text-white rounded-lg hover:bg-brand-900"
          title="Gegenzeichnen"
        >
          <PenLine className="w-3 h-3" />
          Gegenzeichnen
        </button>
      )}

      {/* Generate PDF */}
      <button
        onClick={onGeneratePdf}
        disabled={generatingPdf === c.id}
        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
      >
        <FileText className="w-3 h-3" />
        {generatingPdf === c.id ? "…" : "PDF"}
      </button>

      {/* Download PDF */}
      {c.pdf_filename && (
        <a
          href={rentalContractsApi.pdfUrl(c.id)}
          target="_blank"
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Download className="w-3 h-3" />
          Download
        </a>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
        title="Löschen"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ContractPreviewModal({
  contract,
  onClose,
}: {
  contract: RentalContract;
  onClose: () => void;
}) {
  const FLOOR_LABELS_LOCAL: Record<string, string> = {
    EG: "Erdgeschoss",
    OG: "Obergeschoss",
    DG: "Dachgeschoss",
    DU: "Büro",
  };

  function fmtEur(v: string | number | null) {
    if (v === null || v === undefined) return "–";
    const n = typeof v === "string" ? parseFloat(v) : v;
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  const paras = contract.contract_paragraphs;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 md:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4 md:my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-xl">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Vertragsvorschau</h2>
            <p className="text-xs text-gray-500">{contract.tenant_name} · {contract.apartment_code ? FLOOR_LABELS_LOCAL[contract.apartment_code] || contract.apartment_name : contract.apartment_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Header box */}
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-4">
            <h3 className="font-bold text-brand-900 text-xl mb-1">Wohnraummietvertrag</h3>
            <p className="text-sm text-brand-700">Vermieter: Alexander Klingel, Nauwies 7, 66802 Überherrn</p>
          </div>

          {/* Summary table */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden text-sm">
            {[
              ["Mieter", contract.tenant_name + (contract.tenant_address1 ? `, ${contract.tenant_address1}` : "")],
              ["Wohnung", contract.apartment_code ? `${FLOOR_LABELS_LOCAL[contract.apartment_code] || contract.apartment_name}` : contract.apartment_name || "–"],
              ["Wohnfläche", contract.apartment_area_sqm ? `${contract.apartment_area_sqm} m²` : "–"],
              ["Mietbeginn", formatDate(contract.start_date)],
              ["Kaltmiete", fmtEur(contract.monthly_rent)],
              ["NK-Vorauszahlung", fmtEur(contract.advance_payment)],
              ...(contract.kitchen_fee ? [["Küchenentgelt", fmtEur(contract.kitchen_fee)]] : []),
              ["Kaution", fmtEur(contract.deposit)],
            ].map(([label, value], i) => (
              <div key={i} className={`flex px-4 py-2 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                <span className="text-gray-500 w-40 shrink-0">{label}</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}
          </div>

          {/* Paragraphs */}
          <div className="space-y-4">
            {Object.entries(PARA_TITLES).map(([key, title]) => {
              const text = paras?.[key];
              if (!text) return null;
              return (
                <div key={key}>
                  <h4 className="text-sm font-semibold text-brand-900 mb-1">{title}</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
                </div>
              );
            })}
            {!paras && (
              <p className="text-sm text-gray-500 italic">
                Noch keine Vertragstexte gespeichert. Im Bearbeitungsmodus → Tab &ldquo;Vertragstext&rdquo; können Sie die 20 §§ bearbeiten.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
