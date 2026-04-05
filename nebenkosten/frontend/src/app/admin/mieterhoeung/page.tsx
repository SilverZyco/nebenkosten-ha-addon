"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { rentIncreasesApi, apartmentsApi, usersApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  Plus, X, Send, Download, Pencil, Trash2, FileText, CheckCircle2,
  PenLine, TrendingUp, ArrowRight, Check,
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

interface RentIncreaseNotice {
  id: string;
  apartment_id: string;
  apartment_code: string | null;
  apartment_name: string | null;
  tenant_user_id: string | null;
  tenant_user_name: string | null;
  tenant_name: string;
  old_monthly_rent: number;
  old_advance_payment: number;
  new_monthly_rent: number;
  new_advance_payment: number;
  effective_date: string;
  reason: string | null;
  status: "draft" | "sent" | "signed";
  tenant_signed_at: string | null;
  pdf_filename: string | null;
  applied_to_tenancy: boolean;
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

function fmtEur(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function getFloorLabel(code: string | null, name: string | null) {
  if (!code) return name || "–";
  return FLOOR_LABELS[code] || name || code;
}

const REASON_PRESETS = [
  "Anpassung an die ortsübliche Vergleichsmiete (§ 558 BGB)",
  "Gestiegene Betriebskosten (Heizung, Wasser, Müll, Versicherung)",
  "Durchgeführte Modernisierungsmaßnahmen (§ 559 BGB)",
  "Inflationsausgleich / Anpassung an Verbraucherpreisindex",
  "Indexmiete – Anpassung gemäß vereinbartem Mietpreisindex",
];

const emptyForm = {
  apartment_id: "",
  tenant_user_id: "",
  tenant_name: "",
  old_monthly_rent: "",
  old_advance_payment: "",
  new_monthly_rent: "",
  new_advance_payment: "",
  effective_date: "",
  reason: "",
};

// ── Signature canvas hook ────────────────────────────────────────────────────
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

export default function AdminMieterhoeungPage() {
  const [notices, setNotices] = useState<RentIncreaseNotice[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingNotice, setEditingNotice] = useState<RentIncreaseNotice | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [reasonPresets, setReasonPresets] = useState<string[]>([]);
  const [reasonCustom, setReasonCustom] = useState("");
  const [saving, setSaving] = useState(false);

  // Direct sign modal
  const [signingNotice, setSigningNotice] = useState<RentIncreaseNotice | null>(null);
  const [signingSaving, setSigningSaving] = useState(false);
  const sig = useSignatureCanvas();

  // Computed diff
  const newRent = parseFloat(form.new_monthly_rent) || 0;
  const oldRent = parseFloat(form.old_monthly_rent) || 0;
  const newAdv = parseFloat(form.new_advance_payment) || 0;
  const oldAdv = parseFloat(form.old_advance_payment) || 0;
  const diffTotal = (newRent + newAdv) - (oldRent + oldAdv);

  const load = useCallback(async () => {
    try {
      const [noticeRes, aptRes, usersRes] = await Promise.all([
        rentIncreasesApi.list(),
        apartmentsApi.list(),
        usersApi.list(),
      ]);
      setNotices(noticeRes.data);
      setApartments(aptRes.data);
      setTenantUsers((usersRes.data as TenantUser[]).filter((u) => u.role === "tenant"));
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingNotice(null);
    setForm({ ...emptyForm });
    setReasonPresets([]);
    setReasonCustom("");
    setShowForm(true);
  }

  function openEdit(n: RentIncreaseNotice) {
    setEditingNotice(n);
    setForm({
      apartment_id: n.apartment_id,
      tenant_user_id: n.tenant_user_id || "",
      tenant_name: n.tenant_name,
      old_monthly_rent: String(n.old_monthly_rent),
      old_advance_payment: String(n.old_advance_payment),
      new_monthly_rent: String(n.new_monthly_rent),
      new_advance_payment: String(n.new_advance_payment),
      effective_date: n.effective_date,
      reason: n.reason || "",
    });
    // Try to detect presets from stored reason
    const stored = n.reason || "";
    const matched = REASON_PRESETS.filter(p => stored.includes(p));
    setReasonPresets(matched);
    const remainder = matched.reduce((s, p) => s.replace(p, "").replace(/^[;\s]+|[;\s]+$/g, ""), stored);
    setReasonCustom(remainder);
    setShowForm(true);
  }

  function handleUserSelect(userId: string) {
    const user = tenantUsers.find((u) => u.id === userId);
    setForm((f) => ({
      ...f,
      tenant_user_id: userId,
      tenant_name: user ? user.name : f.tenant_name,
    }));
  }

  async function handleSave() {
    if (!form.apartment_id || !form.tenant_name || !form.effective_date ||
        !form.old_monthly_rent || !form.new_monthly_rent) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        apartment_id: form.apartment_id,
        tenant_user_id: form.tenant_user_id || null,
        tenant_name: form.tenant_name,
        old_monthly_rent: parseFloat(form.old_monthly_rent),
        old_advance_payment: parseFloat(form.old_advance_payment) || 0,
        new_monthly_rent: parseFloat(form.new_monthly_rent),
        new_advance_payment: parseFloat(form.new_advance_payment) || 0,
        effective_date: form.effective_date,
        reason: [...reasonPresets, ...(reasonCustom.trim() ? [reasonCustom.trim()] : [])].join("; ") || null,
      };
      if (editingNotice) {
        await rentIncreasesApi.update(editingNotice.id, payload);
        toast.success("Mieterhöhung aktualisiert");
      } else {
        await rentIncreasesApi.create(payload);
        toast.success("Mieterhöhung erstellt");
      }
      setShowForm(false);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(n: RentIncreaseNotice) {
    if (!confirm(`Mieterhöhung für ${n.tenant_name} wirklich löschen?`)) return;
    try {
      await rentIncreasesApi.delete(n.id);
      toast.success("Gelöscht");
      load();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  }

  async function handleSend(n: RentIncreaseNotice) {
    if (!n.tenant_user_id) {
      toast.error("Kein Mieter-Login zugeordnet");
      return;
    }
    try {
      await rentIncreasesApi.send(n.id);
      toast.success("An Mieter gesendet");
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Fehler beim Senden");
    }
  }

  function openDirectSign(n: RentIncreaseNotice) {
    setSigningNotice(n);
    sig.resetForModal();
  }

  async function handleDirectSign() {
    if (!signingNotice || !sig.hasSignature) {
      toast.error("Bitte Unterschrift zeichnen");
      return;
    }
    setSigningSaving(true);
    try {
      const signatureB64 = sig.getDataUrl();
      await rentIncreasesApi.signDirect(signingNotice.id, signatureB64);
      toast.success("Unterschrieben und PDF erstellt");
      setSigningNotice(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Fehler beim Unterschreiben");
    } finally {
      setSigningSaving(false);
    }
  }

  async function handleGeneratePdf(n: RentIncreaseNotice) {
    try {
      await rentIncreasesApi.generatePdf(n.id);
      toast.success("PDF erstellt");
      load();
    } catch {
      toast.error("PDF-Erstellung fehlgeschlagen");
    }
  }

  async function handleApply(n: RentIncreaseNotice) {
    if (!confirm(
      `Mieterhöhung auf das Mietverhältnis übernehmen?\n\nNeue Kaltmiete: ${fmtEur(n.new_monthly_rent)}\nGültig ab: ${formatDate(n.effective_date)}\n\nDas aktuelle Mietverhältnis wird zum ${n.effective_date} beendet und ein neues erstellt.`
    )) return;
    try {
      await rentIncreasesApi.apply(n.id);
      toast.success("Mietverhältnis aktualisiert");
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Fehler beim Übernehmen");
    }
  }

  return (
    <>
      <Topbar
        title="Mieterhöhungen"
        subtitle="Mieterhöhungsschreiben verwalten und versenden"
      />

      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <TrendingUp className="w-4 h-4" />
            <span>{notices.length} Mieterhöhung{notices.length !== 1 ? "en" : ""}</span>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-700 text-white text-sm rounded-lg hover:bg-brand-800 font-medium"
          >
            <Plus className="w-4 h-4" />
            Neue Mieterhöhung
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-700 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>Keine Mieterhöhungen vorhanden</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Mieter / Wohnung</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Alte Miete</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Neue Miete</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Gültig ab</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((n) => (
                    <tr key={n.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{n.tenant_name}</div>
                        <div className="text-xs text-gray-500">
                          {getFloorLabel(n.apartment_code, n.apartment_name)}
                        </div>
                        {n.tenant_user_name && (
                          <div className="text-xs text-gray-400">Login: {n.tenant_user_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>{fmtEur(n.old_monthly_rent)}</div>
                        <div className="text-xs text-gray-400">+{fmtEur(n.old_advance_payment)} NK</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-blue-700">{fmtEur(n.new_monthly_rent)}</div>
                        <div className="text-xs text-gray-400">+{fmtEur(n.new_advance_payment)} NK</div>
                        <div className="text-xs text-green-600 font-medium">
                          +{fmtEur((n.new_monthly_rent + n.new_advance_payment) - (n.old_monthly_rent + n.old_advance_payment))} ges.
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(n.effective_date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit ${STATUS_COLORS[n.status]}`}>
                            {STATUS_LABELS[n.status]}
                          </span>
                          {n.applied_to_tenancy && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 w-fit">
                              <Check className="w-3 h-3" />
                              Übernommen
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {n.status === "draft" && (
                            <button
                              onClick={() => openEdit(n)}
                              title="Bearbeiten"
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {n.status === "draft" && n.tenant_user_id && (
                            <button
                              onClick={() => handleSend(n)}
                              title="An Mieter senden"
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Senden
                            </button>
                          )}
                          {(n.status === "draft" || n.status === "sent") && (
                            <button
                              onClick={() => openDirectSign(n)}
                              title="Vor Ort unterschreiben"
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                              <PenLine className="w-3.5 h-3.5" />
                              Vor Ort
                            </button>
                          )}
                          <button
                            onClick={() => handleGeneratePdf(n)}
                            title="PDF erstellen"
                            className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          {n.pdf_filename && (
                            <a
                              href={rentIncreasesApi.pdfUrl(n.id)}
                              target="_blank"
                              title="PDF herunterladen"
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                          {n.status === "signed" && !n.applied_to_tenancy && (
                            <button
                              onClick={() => handleApply(n)}
                              title="In Mietverhältnis übernehmen"
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              Übernehmen
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(n)}
                            title="Löschen"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
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

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {notices.map((n) => (
                <div key={n.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-medium text-sm">{n.tenant_name}</div>
                      <div className="text-xs text-gray-500">{getFloorLabel(n.apartment_code, n.apartment_name)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[n.status]}`}>
                        {STATUS_LABELS[n.status]}
                      </span>
                      {n.applied_to_tenancy && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          <Check className="w-3 h-3" />
                          Übernommen
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
                    <div>
                      <span className="text-gray-500">Alt:</span>{" "}
                      <span>{fmtEur(n.old_monthly_rent)} + {fmtEur(n.old_advance_payment)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Neu:</span>{" "}
                      <span className="font-medium text-blue-700">{fmtEur(n.new_monthly_rent)} + {fmtEur(n.new_advance_payment)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Gültig ab:</span>{" "}
                      <span>{formatDate(n.effective_date)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.status === "draft" && (
                      <button onClick={() => openEdit(n)} className="flex items-center gap-1 px-2 py-1 text-xs border rounded">
                        <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                      </button>
                    )}
                    {n.status === "draft" && n.tenant_user_id && (
                      <button onClick={() => handleSend(n)} className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded">
                        <Send className="w-3.5 h-3.5" /> Senden
                      </button>
                    )}
                    {(n.status === "draft" || n.status === "sent") && (
                      <button onClick={() => openDirectSign(n)} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                        <PenLine className="w-3.5 h-3.5" /> Vor Ort
                      </button>
                    )}
                    <button onClick={() => handleGeneratePdf(n)} className="flex items-center gap-1 px-2 py-1 text-xs border rounded">
                      <FileText className="w-3.5 h-3.5" /> PDF
                    </button>
                    {n.pdf_filename && (
                      <a href={rentIncreasesApi.pdfUrl(n.id)} target="_blank" className="flex items-center gap-1 px-2 py-1 text-xs border rounded">
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    )}
                    {n.status === "signed" && !n.applied_to_tenancy && (
                      <button onClick={() => handleApply(n)} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                        <ArrowRight className="w-3.5 h-3.5" /> Übernehmen
                      </button>
                    )}
                    <button onClick={() => handleDelete(n)} className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded">
                      <Trash2 className="w-3.5 h-3.5" /> Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Create/Edit Modal ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl my-4 md:my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingNotice ? "Mieterhöhung bearbeiten" : "Neue Mieterhöhung"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Wohnung */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wohnung *</label>
                <select
                  value={form.apartment_id}
                  onChange={(e) => setForm((f) => ({ ...f, apartment_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">– Wohnung wählen –</option>
                  {apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({FLOOR_LABELS[a.code] || a.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Mieter-Login */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mieter-Login</label>
                <select
                  value={form.tenant_user_id}
                  onChange={(e) => handleUserSelect(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">– kein Login-Mieter –</option>
                  {tenantUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Mieter Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mieter Name *</label>
                <input
                  type="text"
                  value={form.tenant_name}
                  onChange={(e) => setForm((f) => ({ ...f, tenant_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Vollständiger Name des Mieters"
                />
              </div>

              {/* Gültig ab */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gültig ab *</label>
                <input
                  type="date"
                  value={form.effective_date}
                  onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Old values */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Aktuelle Miete</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Kaltmiete (€) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.old_monthly_rent}
                      onChange={(e) => setForm((f) => ({ ...f, old_monthly_rent: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">NK-Vorauszahlung (€)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.old_advance_payment}
                      onChange={(e) => setForm((f) => ({ ...f, old_advance_payment: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </div>

              {/* New values */}
              <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Neue Miete</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Kaltmiete (€) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.new_monthly_rent}
                      onChange={(e) => setForm((f) => ({ ...f, new_monthly_rent: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">NK-Vorauszahlung (€)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.new_advance_payment}
                      onChange={(e) => setForm((f) => ({ ...f, new_advance_payment: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="0,00"
                    />
                  </div>
                </div>
                {(newRent > 0 || newAdv > 0) && (oldRent > 0 || oldAdv > 0) && (
                  <div className={`text-sm font-medium ${diffTotal >= 0 ? "text-green-700" : "text-red-600"}`}>
                    Unterschied gesamt: {diffTotal >= 0 ? "+" : ""}{diffTotal.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / Monat
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Begründung (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {REASON_PRESETS.map((preset) => {
                    const active = reasonPresets.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setReasonPresets(prev =>
                          active ? prev.filter(p => p !== preset) : [...prev, preset]
                        )}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors text-left ${
                          active
                            ? "bg-brand-700 text-white border-brand-700"
                            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:text-brand-700"
                        }`}
                      >
                        {active && <span className="mr-1">✓</span>}{preset}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={reasonCustom}
                  onChange={(e) => setReasonCustom(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white"
                  placeholder="Eigene Begründung (optional)..."
                />
                {(reasonPresets.length > 0 || reasonCustom.trim()) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Wird gespeichert als: <em>{[...reasonPresets, ...(reasonCustom.trim() ? [reasonCustom.trim()] : [])].join("; ")}</em>
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm bg-brand-700 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50 font-medium"
              >
                {saving ? "Speichern…" : editingNotice ? "Aktualisieren" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Direct Sign Modal ──────────────────────────────────────────────── */}
      {signingNotice && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4 md:my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Vor-Ort-Unterschrift</h2>
              <button onClick={() => setSigningNotice(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
              <div className="text-sm space-y-1">
                <div><span className="text-gray-500">Mieter:</span> <strong>{signingNotice.tenant_name}</strong></div>
                <div><span className="text-gray-500">Wohnung:</span> <strong>{getFloorLabel(signingNotice.apartment_code, signingNotice.apartment_name)}</strong></div>
                <div>
                  <span className="text-gray-500">Neue Kaltmiete:</span>{" "}
                  <strong className="text-blue-700">{fmtEur(signingNotice.new_monthly_rent)}</strong>
                  {" "}(+{fmtEur(signingNotice.new_advance_payment)} NK)
                </div>
                <div><span className="text-gray-500">Gültig ab:</span> <strong>{formatDate(signingNotice.effective_date)}</strong></div>
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Unterschrift des Mieters
                  <span className="text-xs text-gray-400 ml-2">(mit Finger oder Maus zeichnen)</span>
                </label>
                <button
                  onClick={sig.clearCanvas}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Löschen
                </button>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 touch-none">
                <canvas
                  ref={sig.canvasRef}
                  width={600}
                  height={200}
                  className="w-full rounded-lg cursor-crosshair"
                  style={{ height: "160px" }}
                  onMouseDown={sig.startDraw}
                  onMouseMove={sig.draw}
                  onMouseUp={sig.endDraw}
                  onMouseLeave={sig.endDraw}
                  onTouchStart={sig.startDraw}
                  onTouchMove={sig.draw}
                  onTouchEnd={sig.endDraw}
                />
              </div>
              {!sig.hasSignature && (
                <p className="text-xs text-gray-400 mt-1 text-center">
                  Bitte Unterschrift in das Feld zeichnen
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setSigningNotice(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDirectSign}
                disabled={signingSaving || !sig.hasSignature}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                <CheckCircle2 className="w-4 h-4" />
                {signingSaving ? "Speichern…" : "Unterschrift bestätigen & PDF erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
