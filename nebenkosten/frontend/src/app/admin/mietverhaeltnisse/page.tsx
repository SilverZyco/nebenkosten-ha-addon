"use client";

import React, { useEffect, useState } from "react";
import { apartmentsApi, usersApi } from "@/lib/api";
import { formatEur, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { Plus, UserCheck, UserPlus, Trash2, ChevronDown, ChevronUp, Pencil, Check, X, TrendingUp, AlertTriangle, Users, LogOut } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";

interface Tenancy {
  id: string;
  apartment_id: string;
  apartment_code: string | null;
  tenant_id: string;
  tenant_name: string | null;
  start_date: string;
  end_date: string | null;
  monthly_advance_payment: string;
  monthly_rent: string | null;
  notes: string | null;
}

interface Apartment { id: string; code: string; name: string; }
interface TenantUser { id: string; name: string; email: string; role: string; phone: string | null; is_active: boolean; }

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500";
const labelCls = "text-xs text-gray-500 dark:text-gray-400 mb-1 block";

export default function MietverhaeltnissePage() {
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [tenants, setTenants] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Tenancy form
  const [showTenancyForm, setShowTenancyForm] = useState(false);
  const [tenancyForm, setTenancyForm] = useState({
    apartment_id: "",
    tenant_id: "",
    start_date: "",
    end_date: "",
    monthly_advance_payment: "",
    monthly_rent: "",
    notes: "",
  });

  // Tenant user form
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  // Mieter inline editing
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editTenantForm, setEditTenantForm] = useState({ name: "", email: "", phone: "", newPassword: "" });

  // Tenancy inline editing
  const [editingTenancyId, setEditingTenancyId] = useState<string | null>(null);
  const [editTenancyForm, setEditTenancyForm] = useState({
    monthly_advance_payment: "",
    monthly_rent: "",
    end_date: "",
    notes: "",
  });

  // Quick-end tenancy (Beenden flow)
  const [endingTenancyId, setEndingTenancyId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState("");
  const [showSuccessApt, setShowSuccessApt] = useState<string | null>(null);

  // Mieter section collapsed
  const [mieterOpen, setMieterOpen] = useState(true);

  // Betrag-ändern Modal
  const [changeAmountTenancy, setChangeAmountTenancy] = useState<Tenancy | null>(null);
  const [changeAmountForm, setChangeAmountForm] = useState({
    effective_date: "",
    new_advance: "",
    new_rent: "",
    notes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [aptRes, userRes] = await Promise.all([
        apartmentsApi.list(),
        usersApi.list(),
      ]);
      setApartments(aptRes.data);
      const tenantUsers = userRes.data.filter((u: TenantUser) => u.role === "tenant");
      setTenants(tenantUsers);

      const all: Tenancy[] = [];
      for (const apt of aptRes.data) {
        try {
          const tRes = await apartmentsApi.listTenancies(apt.id);
          all.push(...tRes.data);
        } catch {}
      }
      setTenancies(all.sort((a, b) => b.start_date.localeCompare(a.start_date)));
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const submitTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantForm.name.trim()) return toast.error("Name ist erforderlich");
    try {
      await usersApi.create({
        name: tenantForm.name,
        email: tenantForm.email,
        phone: tenantForm.phone || null,
        password: tenantForm.password || "Mieter@Portal2024!",
        role: "tenant",
      });
      toast.success(`Mieter "${tenantForm.name}" angelegt`);
      setTenantForm({ name: "", email: "", phone: "", password: "" });
      setShowTenantForm(false);
      fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Anlegen";
      toast.error(msg);
    }
  };

  const startEditTenant = (u: TenantUser) => {
    setEditingTenantId(u.id);
    setEditTenantForm({ name: u.name, email: u.email, phone: u.phone || "", newPassword: "" });
  };

  const saveEditTenant = async (u: TenantUser) => {
    if (!editTenantForm.name.trim()) return toast.error("Name ist erforderlich");
    try {
      await usersApi.update(u.id, {
        name: editTenantForm.name,
        email: editTenantForm.email || undefined,
        phone: editTenantForm.phone || undefined,
      });
      if (editTenantForm.newPassword.trim()) {
        await usersApi.resetPassword(u.id, editTenantForm.newPassword.trim());
      }
      toast.success("Mieter gespeichert");
      setEditingTenantId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Speichern"
      );
    }
  };

  const deleteTenant = async (u: TenantUser) => {
    if (!window.confirm(`Mieter "${u.name}" dauerhaft löschen? (Nur möglich wenn keine Mietverhältnisse vorhanden)`)) return;
    try {
      await usersApi.delete(u.id);
      toast.success(`Mieter "${u.name}" gelöscht`);
      fetchData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Löschen"
      );
    }
  };

  const startEditTenancy = (t: Tenancy) => {
    setEditingTenancyId(t.id);
    setEditTenancyForm({
      monthly_advance_payment: t.monthly_advance_payment,
      monthly_rent: t.monthly_rent || "",
      end_date: t.end_date || "",
      notes: t.notes || "",
    });
  };

  const saveEditTenancy = async (t: Tenancy) => {
    if (!editTenancyForm.monthly_advance_payment) return toast.error("Vorauszahlung ist erforderlich");
    try {
      await apartmentsApi.updateTenancy(t.id, {
        monthly_advance_payment: parseFloat(editTenancyForm.monthly_advance_payment),
        monthly_rent: editTenancyForm.monthly_rent ? parseFloat(editTenancyForm.monthly_rent) : null,
        end_date: editTenancyForm.end_date || null,
        notes: editTenancyForm.notes || null,
      });
      toast.success("Mietverhältnis gespeichert");
      setEditingTenancyId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Speichern"
      );
    }
  };

  const quickEndTenancy = async (t: Tenancy) => {
    if (!endDate) return toast.error("Bitte Auszugsdatum eingeben");
    try {
      await apartmentsApi.updateTenancy(t.id, {
        monthly_advance_payment: t.monthly_advance_payment,
        monthly_rent: t.monthly_rent,
        end_date: endDate,
        notes: t.notes,
      });
      toast.success(`Mietverhältnis von ${t.tenant_name} beendet`);
      setEndingTenancyId(null);
      setEndDate("");
      setShowSuccessApt(t.apartment_code);
      fetchData();
      setTimeout(() => setShowSuccessApt(null), 8000);
    } catch {
      toast.error("Fehler beim Beenden");
    }
  };

  const deleteTenancy = async (t: Tenancy) => {
    if (!window.confirm(`Mietverhältnis von "${t.tenant_name}" (${t.apartment_code}) wirklich löschen?`)) return;
    try {
      await apartmentsApi.deleteTenancy(t.id);
      toast.success("Mietverhältnis gelöscht");
      fetchData();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler beim Löschen"
      );
    }
  };

  const submitTenancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenancyForm.apartment_id || !tenancyForm.tenant_id || !tenancyForm.start_date || !tenancyForm.monthly_advance_payment) {
      return toast.error("Bitte alle Pflichtfelder ausfüllen");
    }
    try {
      await apartmentsApi.createTenancy({
        apartment_id: tenancyForm.apartment_id,
        tenant_id: tenancyForm.tenant_id,
        start_date: tenancyForm.start_date,
        end_date: tenancyForm.end_date || null,
        monthly_advance_payment: parseFloat(tenancyForm.monthly_advance_payment),
        monthly_rent: tenancyForm.monthly_rent ? parseFloat(tenancyForm.monthly_rent) : null,
        notes: tenancyForm.notes || null,
      });
      toast.success("Mietverhältnis erstellt");
      setShowTenancyForm(false);
      setTenancyForm({ apartment_id: "", tenant_id: "", start_date: "", end_date: "", monthly_advance_payment: "", monthly_rent: "", notes: "" });
      fetchData();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler");
    }
  };

  const openChangeAmount = (t: Tenancy) => {
    setChangeAmountTenancy(t);
    setChangeAmountForm({
      effective_date: "",
      new_advance: t.monthly_advance_payment,
      new_rent: t.monthly_rent || "",
      notes: "",
    });
  };

  const submitChangeAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeAmountTenancy) return;
    if (!changeAmountForm.effective_date) return toast.error("Bitte Datum der Änderung angeben");
    if (!changeAmountForm.new_advance) return toast.error("Neue Vorauszahlung ist erforderlich");

    const t = changeAmountTenancy;
    const effDate = new Date(changeAmountForm.effective_date);
    effDate.setDate(effDate.getDate() - 1);
    const oldEndDate = effDate.toISOString().split("T")[0];

    try {
      await apartmentsApi.updateTenancy(t.id, { end_date: oldEndDate });
      await apartmentsApi.createTenancy({
        apartment_id: t.apartment_id,
        tenant_id: t.tenant_id,
        start_date: changeAmountForm.effective_date,
        end_date: null,
        monthly_advance_payment: parseFloat(changeAmountForm.new_advance),
        monthly_rent: changeAmountForm.new_rent ? parseFloat(changeAmountForm.new_rent) : null,
        notes: changeAmountForm.notes || `Betrag geändert ab ${changeAmountForm.effective_date}`,
      });

      toast.success(`Betrag geändert ab ${formatDate(changeAmountForm.effective_date)} – altes Mietverhältnis bis ${formatDate(oldEndDate)} abgeschlossen`);
      setChangeAmountTenancy(null);
      fetchData();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler");
    }
  };

  const activeTenancies = tenancies.filter((t) => !t.end_date || new Date(t.end_date) >= new Date());
  const pastTenancies = tenancies.filter((t) => t.end_date && new Date(t.end_date) < new Date());

  return (
    <>
      <div className="p-6 space-y-5 flex-1 overflow-y-auto">
        <PageHeader
          title="Mietverhältnisse"
          subtitle="Mieter, Mietdauer und monatliche Vorauszahlungen verwalten"
          actions={
            <button
              onClick={() => { setShowTenancyForm(!showTenancyForm); setShowTenantForm(false); }}
              className="flex items-center gap-2 bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Neues Mietverhältnis
            </button>
          }
        />

        {/* New Tenancy Form */}
        {showTenancyForm && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Neues Mietverhältnis</h3>
              <button onClick={() => setShowTenancyForm(false)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            {tenants.length === 0 && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                Noch keine Mieter vorhanden. Bitte zuerst oben einen Mieter anlegen.
              </div>
            )}
            <form onSubmit={submitTenancy} className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Wohnung *</label>
                <select value={tenancyForm.apartment_id} onChange={(e) => setTenancyForm({ ...tenancyForm, apartment_id: e.target.value })} className={inputCls} required>
                  <option value="">– Wählen –</option>
                  {apartments.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Mieter *</label>
                <select value={tenancyForm.tenant_id} onChange={(e) => setTenancyForm({ ...tenancyForm, tenant_id: e.target.value })} className={inputCls} required>
                  <option value="">– Wählen –</option>
                  {tenants.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Einzugsdatum *</label>
                <input type="date" value={tenancyForm.start_date} onChange={(e) => setTenancyForm({ ...tenancyForm, start_date: e.target.value })} className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>Auszugsdatum (leer = aktiv)</label>
                <input type="date" value={tenancyForm.end_date} onChange={(e) => setTenancyForm({ ...tenancyForm, end_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Monatl. Vorauszahlung NK (€) *</label>
                <input type="number" step="0.01" value={tenancyForm.monthly_advance_payment} onChange={(e) => setTenancyForm({ ...tenancyForm, monthly_advance_payment: e.target.value })} className={inputCls} placeholder="120.00" required />
              </div>
              <div>
                <label className={labelCls}>Kaltmiete (€, optional)</label>
                <input type="number" step="0.01" value={tenancyForm.monthly_rent} onChange={(e) => setTenancyForm({ ...tenancyForm, monthly_rent: e.target.value })} className={inputCls} placeholder="800.00" />
              </div>
              <div className="col-span-full">
                <label className={labelCls}>Notizen</label>
                <textarea value={tenancyForm.notes} onChange={(e) => setTenancyForm({ ...tenancyForm, notes: e.target.value })} className={inputCls} rows={2} />
              </div>
              <div className="col-span-full flex gap-3">
                <button type="submit" className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium">Speichern</button>
                <button type="button" onClick={() => setShowTenancyForm(false)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">Abbrechen</button>
              </div>
            </form>
          </Card>
        )}

        {/* Mieter (Personen) */}
        <Card>
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700"
            onClick={() => setMieterOpen(!mieterOpen)}
          >
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Mieter-Konten</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{tenants.length} gesamt</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); setShowTenantForm(!showTenantForm); setShowTenancyForm(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-800 rounded-lg text-xs font-medium hover:bg-brand-100 dark:hover:bg-brand-900/40"
              >
                <UserPlus className="w-3.5 h-3.5" /> Mieter anlegen
              </button>
              {mieterOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </div>

          {mieterOpen && (
            <div className="px-5 py-4 space-y-4">
              {/* Create tenant form */}
              {showTenantForm && (
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Neuen Mieter anlegen</h4>
                    <button onClick={() => setShowTenantForm(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={submitTenant} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>Name *</label>
                      <input type="text" value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} className={inputCls} placeholder="Max Mustermann" required />
                    </div>
                    <div>
                      <label className={labelCls}>E-Mail / Login <span className="text-gray-400">(optional)</span></label>
                      <input type="text" value={tenantForm.email} onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })} className={inputCls} placeholder="mieter@beispiel.de" />
                    </div>
                    <div>
                      <label className={labelCls}>Telefon (optional)</label>
                      <input type="text" value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })} className={inputCls} placeholder="+49 151 ..." />
                    </div>
                    <div>
                      <label className={labelCls}>Passwort (leer = Standard)</label>
                      <input type="text" value={tenantForm.password} onChange={(e) => setTenantForm({ ...tenantForm, password: e.target.value })} className={inputCls} placeholder="Mieter@Portal2024!" />
                    </div>
                    <div className="col-span-full flex gap-3 pt-1">
                      <button type="submit" className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium">Anlegen</button>
                      <button type="button" onClick={() => setShowTenantForm(false)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">Abbrechen</button>
                      <p className="text-xs text-gray-400 dark:text-gray-500 self-center ml-2">E-Mail optional. Passwort leer = Standardpasswort.</p>
                    </div>
                  </form>
                </div>
              )}

              {loading ? (
                <div className="py-6 flex justify-center">
                  <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tenants.length === 0 ? (
                <div className="py-6 text-center text-gray-400 dark:text-gray-500 text-sm">
                  Noch keine Mieter angelegt.{" "}
                  <button onClick={() => setShowTenantForm(true)} className="text-brand-600 dark:text-brand-400 underline hover:text-brand-800 dark:hover:text-brand-300">
                    Jetzt anlegen
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">E-Mail / Login</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Telefon</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Portal-Konto</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {tenants.map((u) => (
                        editingTenantId === u.id ? (
                          <tr key={u.id} className="bg-blue-50 dark:bg-blue-900/10">
                            <td className="px-4 py-2">
                              <input type="text" value={editTenantForm.name} onChange={(e) => setEditTenantForm({ ...editTenantForm, name: e.target.value })} className={inputCls} placeholder="Name" autoFocus />
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={editTenantForm.email} onChange={(e) => setEditTenantForm({ ...editTenantForm, email: e.target.value })} className={`${inputCls} font-mono`} placeholder="E-Mail" autoCapitalize="none" autoCorrect="off" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={editTenantForm.phone} onChange={(e) => setEditTenantForm({ ...editTenantForm, phone: e.target.value })} className={inputCls} placeholder="Telefon" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={editTenantForm.newPassword} onChange={(e) => setEditTenantForm({ ...editTenantForm, newPassword: e.target.value })} className={`${inputCls} font-mono`} placeholder="Neues Passwort (leer = unverändert)" autoComplete="off" />
                            </td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <button onClick={() => saveEditTenant(u)} className="p-1.5 text-green-600 hover:text-green-800 rounded mr-1" title="Speichern"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingTenantId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded" title="Abbrechen"><X className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{u.name}</td>
                            <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 font-mono text-xs">{u.email || "–"}</td>
                            <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 text-xs">{u.phone || "–"}</td>
                            <td className="px-4 py-2.5">
                              {u.email ? (
                                <Badge variant="green" size="sm">Hat Konto</Badge>
                              ) : (
                                <Badge variant="gray" size="sm">Kein Login</Badge>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <button onClick={() => startEditTenant(u)} className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 rounded mr-0.5" title="Bearbeiten"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteTenant(u)} className="p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 rounded" title="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Success hint after ending tenancy */}
        {showSuccessApt && (
          <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <UserPlus className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">Mietverhältnis Wohnung {showSuccessApt} beendet</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                Zählerstände als Zwischenstand eintragen, dann über <b>„Neues Mietverhältnis"</b> den Nachmieter anlegen.
              </p>
            </div>
            <button onClick={() => setShowSuccessApt(null)} className="ml-auto text-green-400 hover:text-green-600"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Active Tenancies */}
        <Card>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Aktive Mietverhältnisse</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Laufende Mietverhältnisse ohne Auszugsdatum oder mit zukünftigem Auszug</p>
            </div>
            <Badge variant="green">{activeTenancies.length}</Badge>
          </div>
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeTenancies.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Keine aktiven Mietverhältnisse"
              description='Lege ein neues Mietverhältnis über "Neues Mietverhältnis" an.'
            />
          ) : (
            <TenancyTable
              tenancies={activeTenancies}
              editingTenancyId={editingTenancyId}
              editTenancyForm={editTenancyForm}
              setEditTenancyForm={setEditTenancyForm}
              startEditTenancy={startEditTenancy}
              saveEditTenancy={saveEditTenancy}
              setEditingTenancyId={setEditingTenancyId}
              deleteTenancy={deleteTenancy}
              openChangeAmount={openChangeAmount}
              endingTenancyId={endingTenancyId}
              setEndingTenancyId={setEndingTenancyId}
              endDate={endDate}
              setEndDate={setEndDate}
              quickEndTenancy={quickEndTenancy}
            />
          )}
        </Card>

        {/* Past Tenancies */}
        {pastTenancies.length > 0 && (
          <Card>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Beendete Mietverhältnisse</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Abgeschlossene Mietverhältnisse zur Übersicht und Archivierung</p>
              </div>
              <Badge variant="gray">{pastTenancies.length}</Badge>
            </div>
            <TenancyTable
              tenancies={pastTenancies}
              editingTenancyId={editingTenancyId}
              editTenancyForm={editTenancyForm}
              setEditTenancyForm={setEditTenancyForm}
              startEditTenancy={startEditTenancy}
              saveEditTenancy={saveEditTenancy}
              setEditingTenancyId={setEditingTenancyId}
              deleteTenancy={deleteTenancy}
              openChangeAmount={openChangeAmount}
              endingTenancyId={endingTenancyId}
              setEndingTenancyId={setEndingTenancyId}
              endDate={endDate}
              setEndDate={setEndDate}
              quickEndTenancy={quickEndTenancy}
              isPast
            />
          </Card>
        )}
      </div>

      {/* Betrag-ändern Modal */}
      <Modal
        open={!!changeAmountTenancy}
        onClose={() => setChangeAmountTenancy(null)}
        title="Betrag / Vorauszahlung ändern"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setChangeAmountTenancy(null)}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              form="change-amount-form"
              className="flex items-center gap-2 bg-amber-600 text-white hover:bg-amber-700 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <TrendingUp className="w-4 h-4" />
              Änderung durchführen
            </button>
          </>
        }
      >
        {changeAmountTenancy && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              Für <strong>{changeAmountTenancy.tenant_name}</strong> · Wohnung <strong>{changeAmountTenancy.apartment_code}</strong>
            </p>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Das aktuelle Mietverhältnis wird zum Vortag des Änderungsdatums abgeschlossen. Ein neues Mietverhältnis mit den neuen Beträgen startet am Änderungsdatum. Die Abrechnung berechnet die Vorauszahlungen automatisch pro-rata für beide Zeiträume.
                </p>
              </div>
            </div>
            <form id="change-amount-form" onSubmit={submitChangeAmount} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Änderung wirksam ab * <span className="text-gray-400 font-normal">(erster Tag mit neuem Betrag)</span>
                </label>
                <input
                  type="date"
                  required
                  value={changeAmountForm.effective_date}
                  onChange={(e) => setChangeAmountForm({ ...changeAmountForm, effective_date: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Neue Vorauszahlung NK (€) *</label>
                  <input type="number" step="0.01" required value={changeAmountForm.new_advance} onChange={(e) => setChangeAmountForm({ ...changeAmountForm, new_advance: e.target.value })} className={inputCls} placeholder="120.00" />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Bisher: {formatEur(changeAmountTenancy.monthly_advance_payment)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Neue Kaltmiete (€, opt.)</label>
                  <input type="number" step="0.01" value={changeAmountForm.new_rent} onChange={(e) => setChangeAmountForm({ ...changeAmountForm, new_rent: e.target.value })} className={inputCls} placeholder="800.00" />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Bisher: {changeAmountTenancy.monthly_rent ? formatEur(changeAmountTenancy.monthly_rent) : "–"}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Notiz (optional)</label>
                <input type="text" value={changeAmountForm.notes} onChange={(e) => setChangeAmountForm({ ...changeAmountForm, notes: e.target.value })} className={inputCls} placeholder="z.B. Mieterhöhung gemäß Mietvertrag §X" />
              </div>
            </form>
          </>
        )}
      </Modal>
    </>
  );
}

interface TenancyTableProps {
  tenancies: Tenancy[];
  editingTenancyId: string | null;
  editTenancyForm: { monthly_advance_payment: string; monthly_rent: string; end_date: string; notes: string };
  setEditTenancyForm: React.Dispatch<React.SetStateAction<{ monthly_advance_payment: string; monthly_rent: string; end_date: string; notes: string }>>;
  startEditTenancy: (t: Tenancy) => void;
  saveEditTenancy: (t: Tenancy) => void;
  setEditingTenancyId: (id: string | null) => void;
  deleteTenancy: (t: Tenancy) => void;
  openChangeAmount: (t: Tenancy) => void;
  endingTenancyId: string | null;
  setEndingTenancyId: (id: string | null) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  quickEndTenancy: (t: Tenancy) => void;
  isPast?: boolean;
}

function TenancyTable({ tenancies, editingTenancyId, editTenancyForm, setEditTenancyForm, startEditTenancy, saveEditTenancy, setEditingTenancyId, deleteTenancy, openChangeAmount, endingTenancyId, setEndingTenancyId, endDate, setEndDate, quickEndTenancy, isPast }: TenancyTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Wohnung</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mieter</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Einzug</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Auszug</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">NK-Vorauszahl.</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kaltmiete</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {tenancies.map((t) => {
            const isEditing = editingTenancyId === t.id;
            const isEnding = endingTenancyId === t.id;
            return (
              <React.Fragment key={t.id}>
                <tr className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isEditing ? "bg-blue-50 dark:bg-blue-900/10" : ""} ${isEnding ? "bg-orange-50 dark:bg-orange-900/10" : ""}`}>
                  <td className="px-4 py-3 font-bold text-brand-700 dark:text-brand-400">{t.apartment_code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{t.tenant_name}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDate(t.start_date)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {t.end_date ? formatDate(t.end_date) : "–"}
                    {isPast && t.notes && (
                      <div className="mt-0.5">
                        {t.notes.includes("Mieterhöhung") ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            <TrendingUp className="w-2.5 h-2.5" />
                            Mieterhöhung
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[140px] block">{t.notes}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">{formatEur(t.monthly_advance_payment)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{t.monthly_rent ? formatEur(t.monthly_rent) : "–"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEditTenancy(t)} className="p-1.5 text-green-600 hover:text-green-800 rounded mr-0.5" title="Speichern"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingTenancyId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded" title="Abbrechen"><X className="w-4 h-4" /></button>
                      </>
                    ) : isEnding ? (
                      <>
                        <button onClick={() => quickEndTenancy(t)} className="p-1.5 text-orange-600 hover:text-orange-800 rounded mr-0.5" title="Beenden speichern"><Check className="w-4 h-4" /></button>
                        <button onClick={() => { setEndingTenancyId(null); setEndDate(""); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="Abbrechen"><X className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <>
                        {!isPast && (
                          <>
                            <button
                              onClick={() => { setEndingTenancyId(t.id); setEndDate(""); setEditingTenancyId(null); }}
                              className="p-1.5 text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded mr-0.5"
                              title="Mietverhältnis beenden (Auszug)"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openChangeAmount(t)}
                              className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 rounded mr-0.5"
                              title="Betrag / Vorauszahlung ab Datum ändern"
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button onClick={() => startEditTenancy(t)} className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 rounded mr-0.5" title="Bearbeiten"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteTenancy(t)} className="p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 rounded" title="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </td>
                </tr>
                {isEnding && (
                  <tr className="bg-orange-50 dark:bg-orange-900/10 border-b border-orange-100 dark:border-orange-900">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <LogOut className="w-4 h-4 text-orange-500" />
                          <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Mietverhältnis beenden</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Auszugsdatum *</label>
                          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-2 py-1.5 border border-orange-300 dark:border-orange-700 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400" autoFocus />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => quickEndTenancy(t)} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 flex items-center gap-1"><Check className="w-3 h-3" /> Beenden</button>
                          <button onClick={() => { setEndingTenancyId(null); setEndDate(""); }} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Abbrechen</button>
                        </div>
                        <p className="text-xs text-orange-700 dark:text-orange-400 ml-auto">Danach: Neuen Mieter über <b>„Neues Mietverhältnis"</b> anlegen</p>
                      </div>
                    </td>
                  </tr>
                )}
                {isEditing && (
                  <tr className="bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Vorauszahlung NK (€) *</label>
                          <input type="number" step="0.01" value={editTenancyForm.monthly_advance_payment} onChange={(e) => setEditTenancyForm(f => ({ ...f, monthly_advance_payment: e.target.value }))} className={inputCls} placeholder="120.00" autoFocus />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Kaltmiete (€, optional)</label>
                          <input type="number" step="0.01" value={editTenancyForm.monthly_rent} onChange={(e) => setEditTenancyForm(f => ({ ...f, monthly_rent: e.target.value }))} className={inputCls} placeholder="800.00" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Auszugsdatum (leer = aktiv)</label>
                          <input type="date" value={editTenancyForm.end_date} onChange={(e) => setEditTenancyForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
                          {editTenancyForm.end_date && (
                            <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
                              <div className="flex items-center gap-1.5 font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                Checkliste bei Auszug
                              </div>
                              <ul className="space-y-0.5 ml-5 list-disc">
                                <li>Alle Zählerstände ablesen und als <b>Zwischenstand</b> eintragen</li>
                                <li>Restmüllkosten werden automatisch anteilig nach Tagen aufgeteilt</li>
                                <li>Neues Mietverhältnis anlegen sobald Nachmieter feststeht</li>
                              </ul>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notizen</label>
                          <input type="text" value={editTenancyForm.notes} onChange={(e) => setEditTenancyForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} placeholder="Notiz..." />
                        </div>
                        <div className="col-span-full flex gap-2 pt-1">
                          <button onClick={() => saveEditTenancy(t)} className="bg-brand-900 text-white hover:bg-brand-800 px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1"><Check className="w-3 h-3" /> Speichern</button>
                          <button onClick={() => setEditingTenancyId(null)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded text-xs">Abbrechen</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
