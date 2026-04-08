"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { instructionsApi, usersApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { Upload, Trash2, Send, Download, BookMarked, Pencil, Check, X } from "lucide-react";

interface Instruction {
  id: string;
  title: string;
  filename: string;
  is_sent: boolean;
  tenant_user_id: string | null;
  tenant_name: string | null;
  created_at: string;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function AnleitungenPage() {
  const [items, setItems] = useState<Instruction[]>([]);
  const [tenants, setTenants] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    const [instrRes, tenantRes] = await Promise.allSettled([
      instructionsApi.list(),
      usersApi.list(),
    ]);
    if (instrRes.status === "fulfilled") setItems(instrRes.value.data);
    if (tenantRes.status === "fulfilled")
      setTenants((tenantRes.value.data as TenantUser[]).filter((u) => u.role === "tenant"));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Nur PDF-Dateien erlaubt");
      return;
    }
    setUploading(true);
    try {
      await instructionsApi.upload(file);
      toast.success("Anleitung hochgeladen");
      fetchAll();
    } catch {
      toast.error("Fehler beim Hochladen");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAssign = async (id: string, tenant_user_id: string | null) => {
    try {
      await instructionsApi.update(id, { tenant_user_id });
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const t = tenants.find((t) => t.id === tenant_user_id);
          return { ...i, tenant_user_id, tenant_name: t?.name ?? null, is_sent: false };
        })
      );
    } catch {
      toast.error("Fehler beim Zuweisen");
    }
  };

  const handleSend = async (id: string) => {
    try {
      await instructionsApi.send(id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_sent: true } : i)));
      toast.success("Anleitung gesendet");
    } catch {
      toast.error("Fehler beim Senden");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" wirklich löschen?`)) return;
    try {
      await instructionsApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Gelöscht");
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  const startEditTitle = (item: Instruction) => {
    setEditingTitle(item.id);
    setTitleDraft(item.title);
  };

  const saveTitle = async (id: string) => {
    if (!titleDraft.trim()) return;
    try {
      await instructionsApi.update(id, { title: titleDraft.trim() });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title: titleDraft.trim() } : i)));
      setEditingTitle(null);
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  return (
    <>
      <Topbar title="Bedienungsanleitungen" subtitle="PDFs hochladen und an Mieter senden" />

      <div className="p-6 space-y-5 flex-1 overflow-y-auto">
        {/* Upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Neue Anleitung hochladen</h3>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-brand-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">PDF hier klicken oder hierher ziehen</p>
            <p className="text-xs text-gray-400 mt-1">Nur PDF-Dateien, max. 50 MB</p>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleUpload} />
          {uploading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              Wird hochgeladen...
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <BookMarked className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>Noch keine Bedienungsanleitungen hochgeladen</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Titel</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Mieter</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Hochgeladen</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {editingTitle === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(item.id); if (e.key === "Escape") setEditingTitle(null); }}
                            autoFocus
                            className="border border-gray-300 rounded px-2 py-1 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          <button onClick={() => saveTitle(item.id)} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingTitle(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{item.title}</span>
                          <button onClick={() => startEditTitle(item)} className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={item.tenant_user_id || ""}
                        onChange={(e) => handleAssign(item.id, e.target.value || null)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">– Kein Mieter –</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {item.is_sent ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                          <Check className="w-3 h-3" /> Gesendet
                        </span>
                      ) : item.tenant_user_id ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                          Zugewiesen
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                          Entwurf
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <a
                          href={instructionsApi.downloadUrl(item.id)}
                          target="_blank"
                          title="Herunterladen"
                          className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {item.tenant_user_id && !item.is_sent && (
                          <button
                            onClick={() => handleSend(item.id)}
                            title="An Mieter senden"
                            className="p-1.5 text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id, item.title)}
                          title="Löschen"
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
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
      </div>
    </>
  );
}
