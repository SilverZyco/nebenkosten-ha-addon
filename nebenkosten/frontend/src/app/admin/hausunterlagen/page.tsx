"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { houseDocumentsApi, usersApi, apartmentsApi, apartmentKeysApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  Plus, X, Send, Download, Trash2, FileText, Clock, CheckCircle2,
  PenLine, FolderOpen, Pencil, Save, ClipboardList, KeyRound,
} from "lucide-react";

interface Template { filename: string; title: string; }
interface TenantUser { id: string; name: string; email: string; role: string; }
interface Apartment { id: string; code: string; name: string; }

interface HouseDoc {
  id: string;
  template_filename: string;
  title: string;
  document_text: string;
  apartment_id: string | null;
  apartment_code: string | null;
  apartment_label: string;
  tenant_user_id: string | null;
  tenant_user_name: string | null;
  tenant_name: string | null;
  status: "draft" | "sent" | "signed";
  tenant_signed_at: string | null;
  landlord_signed_at: string | null;
  has_pdf: boolean;
  created_at: string;
}

const FLOOR_LABELS: Record<string, string> = {
  EG: "Erdgeschoss", OG: "Obergeschoss", DG: "Dachgeschoss", DU: "Büro",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  sent: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  signed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};
const STATUS_LABEL: Record<string, string> = { draft: "Entwurf", sent: "Gesendet", signed: "Unterschrieben" };

// ── Checkliste items ──────────────────────────────────────────────────────────
const EINZUG_ITEMS = [
  { key: "schlussel_anzahl", label: "Schlüsselübergabe", hasInput: true, inputPlaceholder: "Anzahl", inputUnit: "Stück" },
  { key: "strom", label: "Zählerstand Strom", hasInput: true, inputPlaceholder: "kWh", inputUnit: "kWh" },
  { key: "wasser", label: "Zählerstand Wasser", hasInput: true, inputPlaceholder: "m³", inputUnit: "m³" },
  { key: "gas", label: "Zählerstand Gas", hasInput: true, inputPlaceholder: "kWh", inputUnit: "kWh" },
  { key: "waende", label: "Wände und Decken: Zustand OK", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "boeden", label: "Böden: Zustand OK", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "fenster", label: "Fenster und Türen: Zustand OK", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "kueche", label: "Küche: Zustand OK", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "bad", label: "Bad/WC: Zustand OK", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "keller", label: "Keller: Zustand OK", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "heizung", label: "Heizung: funktionsfähig", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "rauchmelder", label: "Rauchwarnmelder: vorhanden und funktionsfähig", hasInput: false, inputPlaceholder: "", inputUnit: "" },
];

const AUSZUG_ITEMS = [
  { key: "schlussel_anzahl", label: "Schlüsselrückgabe", hasInput: true, inputPlaceholder: "Anzahl", inputUnit: "Stück" },
  { key: "strom", label: "Zählerstand Strom", hasInput: true, inputPlaceholder: "kWh", inputUnit: "kWh" },
  { key: "wasser", label: "Zählerstand Wasser", hasInput: true, inputPlaceholder: "m³", inputUnit: "m³" },
  { key: "gas", label: "Zählerstand Gas", hasInput: true, inputPlaceholder: "m³", inputUnit: "m³" },
  { key: "besenrein", label: "Wohnung besenrein übergeben", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "einbauten", label: "Einbauten des Mieters entfernt", hasInput: false, inputPlaceholder: "", inputUnit: "" },
  { key: "schaeden", label: "Schäden dokumentiert", hasInput: true, inputPlaceholder: "Beschreibung", inputUnit: "" },
  { key: "kaution", label: "Kaution: Rückzahlung besprochen", hasInput: false, inputPlaceholder: "", inputUnit: "" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isCheckliste(filename: string) {
  return filename === "Checkliste_Einzug_Auszug.odt";
}
function isSchluessel(filename: string) {
  return filename === "Schlüsselprotokoll.odt";
}
function isUebergabe(filename: string) {
  return filename === "Wohnungsübergabeprotokoll.odt" || filename === "Wohnungsuebergabeprotokoll.odt";
}

function buildChecklisteText(art: "Einzug" | "Auszug", checks: Record<string, boolean>, inputs: Record<string, string>, tenant: string, apt: string): string {
  const items = art === "Einzug" ? EINZUG_ITEMS : AUSZUG_ITEMS;
  const lines = [`Checkliste ${art}`, "", `Mieter: ${tenant}`, `Wohnung: ${apt}`, ""];
  for (const item of items) {
    const mark = checks[item.key] ? "[x]" : "[ ]";
    if (item.hasInput && inputs[item.key]) {
      lines.push(`${mark} ${item.label}: ${inputs[item.key]} ${item.inputUnit}`.trim());
    } else {
      lines.push(`${mark} ${item.label}`);
    }
  }
  return lines.join("\n");
}

// ── Schlüsselprotokoll Form Component ────────────────────────────────────────
type SchlData = { datum: string; kombi: string; keller: string; briefkasten: string; sonstige_anzahl: string; sonstige_bez: string };
type SchlEnabled = { kombi: boolean; keller: boolean; briefkasten: boolean; sonstige: boolean };

function SchluesselForm({
  schlData, setSchlData, schlEnabled, setSchlEnabled,
}: {
  schlData: SchlData;
  setSchlData: React.Dispatch<React.SetStateAction<SchlData>>;
  schlEnabled: SchlEnabled;
  setSchlEnabled: React.Dispatch<React.SetStateAction<SchlEnabled>>;
}) {
  const keys: { key: keyof SchlEnabled; dataKey: keyof SchlData; label: string }[] = [
    { key: "kombi",       dataKey: "kombi",          label: "Kombischlüssel (Haustür/Wohnungstür)" },
    { key: "briefkasten", dataKey: "briefkasten",    label: "Briefkasten" },
    { key: "keller",      dataKey: "keller",         label: "Kellerraum" },
    { key: "sonstige",    dataKey: "sonstige_anzahl", label: "Sonstige" },
  ];

  return (
    <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Schlüsselprotokoll ausfüllen</p>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Datum der Übergabe</label>
        <input type="date" value={schlData.datum}
          onChange={e => setSchlData(p => ({ ...p, datum: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
      </div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Schlüsselarten</p>
      <div className="space-y-2">
        {keys.map(({ key, dataKey, label }) => (
          <div key={key} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
            schlEnabled[key]
              ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700"
              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          }`}>
            <input
              type="checkbox"
              checked={schlEnabled[key]}
              onChange={e => setSchlEnabled(p => ({ ...p, [key]: e.target.checked }))}
              className="w-4 h-4 accent-orange-500 cursor-pointer shrink-0"
            />
            <span className={`flex-1 text-sm ${schlEnabled[key] ? "text-orange-800 dark:text-orange-300 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
              {label}
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min="0"
                value={schlData[dataKey]}
                disabled={!schlEnabled[key]}
                onChange={e => setSchlData(p => ({ ...p, [dataKey]: e.target.value }))}
                className="w-16 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-white text-center disabled:opacity-40"
              />
              <span className="text-xs text-gray-500">Stück</span>
            </div>
          </div>
        ))}
      </div>
      {schlEnabled.sonstige && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bezeichnung (Sonstige)</label>
          <input type="text" value={schlData.sonstige_bez} placeholder="z.B. Garagenschlüssel"
            onChange={e => setSchlData(p => ({ ...p, sonstige_bez: e.target.value }))}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
        </div>
      )}
    </div>
  );
}

export default function HausunterlagenPage() {
  const [docs, setDocs] = useState<HouseDoc[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [selTemplate, setSelTemplate] = useState("");
  const [selUserId, setSelUserId] = useState("");
  const [selAptId, setSelAptId] = useState("");
  const [creating, setCreating] = useState(false);

  // Checkliste: art selection in create modal
  const [checklisteArt, setChecklisteArt] = useState<"Einzug" | "Auszug">("Einzug");

  // Nachtrag: reference to original signed protocol date
  const [nachtragRef, setNachtragRef] = useState("");

  // Apartment keys cache
  const [aptKeys, setAptKeys] = useState<{ apartment_id: string; key_type: string; quantity: number; notes: string | null }[]>([]);

  // Schlüsselprotokoll form (reused in create and fill modals)
  const [schlData, setSchlData] = useState({
    datum: "", kombi: "", keller: "", briefkasten: "",
    sonstige_anzahl: "", sonstige_bez: "",
  });
  const [schlEnabled, setSchlEnabled] = useState({
    kombi: true, keller: false, briefkasten: false, sonstige: false,
  });

  // Wohnungsübergabe form
  const [uebergabeData, setUebergabeData] = useState({
    datum: "", art: "Übergabe",
    wohnzimmer: "", schlafzimmer: "", kueche: "", bad: "", flur: "", keller: "",
    anmerkungen: "",
  });

  // Edit text (only title for non-interactive docs)
  const [editingDoc, setEditingDoc] = useState<HouseDoc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Fill modal
  const [fillingDoc, setFillingDoc] = useState<HouseDoc | null>(null);
  // Checkliste fill state
  const [fillChecks, setFillChecks] = useState<Record<string, boolean>>({});
  const [fillInputs, setFillInputs] = useState<Record<string, string>>({});
  const [fillArt, setFillArt] = useState<"Einzug" | "Auszug">("Einzug");
  const [savingFill, setSavingFill] = useState(false);

  // Signing
  const [signingDoc, setSigningDoc] = useState<HouseDoc | null>(null);
  const [sigMode, setSigMode] = useState<"tenant" | "landlord">("tenant");
  const [saving, setSaving] = useState(false);
  const [agreedSign, setAgreedSign] = useState(false);
  const [checkboxStates, setCheckboxStates] = useState<Record<number, boolean>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const load = useCallback(async () => {
    try {
      const [docsRes, templatesRes, usersRes, aptsRes, keysRes] = await Promise.all([
        houseDocumentsApi.list(),
        houseDocumentsApi.listTemplates(),
        usersApi.list(),
        apartmentsApi.list(),
        apartmentKeysApi.list(),
      ]);
      setDocs(docsRes.data);
      setTemplates(templatesRes.data);
      setUsers((usersRes.data as TenantUser[]).filter((u) => u.role === "tenant"));
      setApartments(aptsRes.data);
      setAptKeys(keysRes.data);
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Autofill Schlüssel aus Wohnungsdaten ──────────────────────────────────
  useEffect(() => {
    if (!selAptId || !isSchluessel(selTemplate)) return;
    const keys = aptKeys.filter(k => k.apartment_id === selAptId);
    if (keys.length === 0) return;
    const get = (type: string) => keys.find(k => k.key_type === type);
    const kombi   = get("kombi");
    const mailbox = get("mailbox");
    const keller  = get("keller");
    const sonstige = get("sonstige");
    setSchlEnabled({
      kombi:       !!kombi,
      briefkasten: !!mailbox,
      keller:      !!keller,
      sonstige:    !!sonstige,
    });
    setSchlData(p => ({
      ...p,
      kombi:          kombi    ? String(kombi.quantity)    : p.kombi,
      briefkasten:    mailbox  ? String(mailbox.quantity)  : p.briefkasten,
      keller:         keller   ? String(keller.quantity)   : p.keller,
      sonstige_anzahl: sonstige ? String(sonstige.quantity) : p.sonstige_anzahl,
      sonstige_bez:   sonstige?.notes || p.sonstige_bez,
    }));
  }, [selAptId, selTemplate, aptKeys]);

  // ── Create ────────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!selTemplate) { toast.error("Bitte Dokument wählen"); return; }
    setCreating(true);
    try {
      const user = users.find((u) => u.id === selUserId);
      const template = templates.find((t) => t.filename === selTemplate);
      const apt = apartments.find((a) => a.id === selAptId);
      const aptLabel = apt ? (FLOOR_LABELS[apt.code] || apt.name || apt.code) : "________________________";
      const tenantName = user?.name || "________________________";

      let documentText = "";
      let title = template?.title || selTemplate;

      if (isCheckliste(selTemplate)) {
        title = `Checkliste ${checklisteArt}`;
        documentText = buildChecklisteText(checklisteArt, {}, {}, tenantName, aptLabel);
      } else if (isSchluessel(selTemplate)) {
        if (nachtragRef) title = "Schlüsselprotokoll – Nachtrag";
        documentText = buildSchluesselTextDirect(schlData, tenantName, aptLabel, nachtragRef, schlEnabled);
      } else if (isUebergabe(selTemplate)) {
        documentText = buildUebergabeText(uebergabeData, tenantName, aptLabel);
      }
      // For other docs (Belehrungen, Hausordnung, etc.) documentText stays empty – filled via default text from backend

      await houseDocumentsApi.create({
        template_filename: selTemplate,
        title,
        tenant_user_id: selUserId || null,
        apartment_id: selAptId || null,
        tenant_name: tenantName,
        document_text: documentText,
      });
      toast.success("Dokument angelegt");
      setShowCreate(false);
      setSelTemplate(""); setSelUserId(""); setSelAptId("");
      setChecklisteArt("Einzug");
      setNachtragRef("");
      setSchlData({ datum: "", kombi: "", keller: "", briefkasten: "", sonstige_anzahl: "", sonstige_bez: "" });
      setSchlEnabled({ kombi: true, keller: false, briefkasten: false, sonstige: false });
      setUebergabeData({ datum: "", art: "Übergabe", wohnzimmer: "", schlafzimmer: "", kueche: "", bad: "", flur: "", keller: "", anmerkungen: "" });
      await load();
    } catch {
      toast.error("Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  }

  function buildSchluesselTextDirect(
    d: typeof schlData,
    tenant: string,
    apt: string,
    nachtragRef?: string,
    enabled?: typeof schlEnabled,
  ): string {
    const datum = d.datum || "________________________";
    const nachtragLine = nachtragRef ? `\nNachtrag zum Schlüsselprotokoll vom ${nachtragRef}\n` : "";
    const en = enabled ?? { kombi: true, keller: true, briefkasten: true, sonstige: true };
    const keyLines: string[] = [];
    if (en.kombi)       keyLines.push(`Kombischlüssel (Haustür/Wohnungstür):   ${d.kombi || "0"} Stück`);
    if (en.briefkasten) keyLines.push(`Briefkasten:                             ${d.briefkasten || "0"} Stück`);
    if (en.keller)      keyLines.push(`Kellerraum:                              ${d.keller || "0"} Stück`);
    if (en.sonstige) {
      const bez = d.sonstige_bez ? `(Bezeichnung: ${d.sonstige_bez})` : "(Bezeichnung: _______________)";
      keyLines.push(`Sonstige:                                ${d.sonstige_anzahl || "0"} Stück  ${bez}`);
    }
    return `Schlüsselprotokoll${nachtragLine}

Objekt:    Hauptstraße 15, 66802 Überherrn
Vermieter: Alexander Klingel, Nauwies 7, 66802 Überherrn
Mieter:    ${tenant}
Wohnung:   ${apt}

Übergabe der folgenden Schlüssel am ${datum}:

${keyLines.join("\n")}

Der Mieter bestätigt den Empfang der oben genannten Schlüssel und verpflichtet sich:
- Schlüssel nicht unbefugt zu vervielfältigen
- Schlüssel bei Verlust sofort zu melden
- Alle Schlüssel bei Beendigung des Mietverhältnisses vollständig zurückzugeben
- Kosten für Schlüsselersatz und ggf. Schlosstausch bei Verlust zu tragen`;
  }

  function buildUebergabeText(d: typeof uebergabeData, tenant: string, apt: string): string {
    const datum = d.datum || "________________________";
    return `Wohnungsübergabeprotokoll

Art: ${d.art}
Datum: ${datum}
Mieter: ${tenant}
Wohnung: ${apt}

Raumzustand:
Wohnzimmer: ${d.wohnzimmer || "–"}
Schlafzimmer: ${d.schlafzimmer || "–"}
Küche: ${d.kueche || "–"}
Bad/WC: ${d.bad || "–"}
Flur/Diele: ${d.flur || "–"}
Keller: ${d.keller || "–"}

Anmerkungen: ${d.anmerkungen || "–"}`;
  }

  // ── Send / Delete ────────────────────────────────────────────────────────
  async function handleSend(id: string) {
    try {
      await houseDocumentsApi.send(id);
      toast.success("Gesendet – Mieter kann jetzt unterschreiben");
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Fehler beim Senden");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Dokument löschen?")) return;
    try {
      await houseDocumentsApi.delete(id);
      toast.success("Gelöscht");
      await load();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  }

  // ── Nachtrag ──────────────────────────────────────────────────────────────
  function openNachtrag(doc: HouseDoc) {
    setSelTemplate("Schlüsselprotokoll.odt");
    setSelUserId(doc.tenant_user_id || "");
    setSelAptId(doc.apartment_id || "");
    setNachtragRef(doc.tenant_signed_at ? formatDate(doc.tenant_signed_at) : formatDate(doc.created_at));
    setSchlData({ datum: "", kombi: "", keller: "", briefkasten: "", sonstige_anzahl: "", sonstige_bez: "" });
    setSchlEnabled({ kombi: true, keller: false, briefkasten: false, sonstige: false });
    setChecklisteArt("Einzug");
    setShowCreate(true);
  }

  // ── Edit (title only for non-interactive, full text for admin) ────────────
  async function handleSaveEdit() {
    if (!editingDoc) return;
    setSavingEdit(true);
    try {
      await houseDocumentsApi.updateText(editingDoc.id, { title: editTitle, document_text: editText });
      toast.success("Gespeichert");
      setEditingDoc(null);
      await load();
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Fill modal ────────────────────────────────────────────────────────────
  function openFill(doc: HouseDoc) {
    if (isSchluessel(doc.template_filename)) {
      const g = (re: RegExp) => { const m = doc.document_text.match(re); return m ? m[1].trim() : ""; };
      const has = (re: RegExp) => re.test(doc.document_text);
      setSchlData({
        datum: g(/Übergabe der folgenden Schlüssel am ([^\n]+)/),
        kombi: g(/Kombischlüssel[^:]*:\s*(\d+)/),
        briefkasten: g(/Briefkasten:\s*(\d+)/),
        keller: g(/Kellerraum:\s*(\d+)/),
        sonstige_anzahl: g(/Sonstige:\s*(\d+)/),
        sonstige_bez: g(/Bezeichnung:\s*([^)]+)/),
      });
      setSchlEnabled({
        kombi:       has(/Kombischlüssel/),
        briefkasten: has(/Briefkasten:/),
        keller:      has(/Kellerraum:/),
        sonstige:    has(/Sonstige:/),
      });
    } else if (isCheckliste(doc.template_filename)) {
      // Detect art from title
      const art: "Einzug" | "Auszug" = doc.title.includes("Auszug") ? "Auszug" : "Einzug";
      setFillArt(art);
      const items = art === "Einzug" ? EINZUG_ITEMS : AUSZUG_ITEMS;
      const checks: Record<string, boolean> = {};
      const inputs: Record<string, string> = {};
      for (const item of items) {
        const checkRe = new RegExp(`\\[([ x])\\]\\s*${item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?::\\s*([^\\n]+))?`);
        const m = doc.document_text.match(checkRe);
        if (m) {
          checks[item.key] = m[1] === "x";
          if (item.hasInput && m[2]) inputs[item.key] = m[2].replace(item.inputUnit, "").trim();
        } else {
          checks[item.key] = false;
        }
      }
      setFillChecks(checks);
      setFillInputs(inputs);
    } else if (isUebergabe(doc.template_filename)) {
      const g = (re: RegExp) => { const m = doc.document_text.match(re); return m ? m[1].trim() : ""; };
      setUebergabeData({
        datum: g(/Datum:\s*(.+)/),
        art: g(/Art:\s*(.+)/) || "Übergabe",
        wohnzimmer: g(/Wohnzimmer:\s*(.+)/),
        schlafzimmer: g(/Schlafzimmer:\s*(.+)/),
        kueche: g(/Küche:\s*(.+)/),
        bad: g(/Bad\/WC:\s*(.+)/),
        flur: g(/Flur\/Diele:\s*(.+)/),
        keller: g(/Keller:\s*(.+)/),
        anmerkungen: g(/Anmerkungen:\s*(.+)/),
      });
    } else {
      // Pre-populate checkboxes from [x]
      const states: Record<number, boolean> = {};
      let idx = 0;
      for (const match of doc.document_text.matchAll(/\[([ x])\]/g)) {
        states[idx++] = match[1] === "x";
      }
      setCheckboxStates(states);
    }
    setFillingDoc(doc);
  }

  async function handleSaveFill() {
    if (!fillingDoc) return;
    setSavingFill(true);
    try {
      let updatedText: string;
      const tenant = fillingDoc.tenant_name || "________________________";
      const apt = fillingDoc.apartment_label !== "-" ? fillingDoc.apartment_label : "________________________";

      if (isSchluessel(fillingDoc.template_filename)) {
        updatedText = buildSchluesselTextDirect(schlData, tenant, apt, undefined, schlEnabled);
      } else if (isCheckliste(fillingDoc.template_filename)) {
        updatedText = buildChecklisteText(fillArt, fillChecks, fillInputs, tenant, apt);
      } else if (isUebergabe(fillingDoc.template_filename)) {
        updatedText = buildUebergabeText(uebergabeData, tenant, apt);
      } else {
        // Generic checkbox fill
        let idx = 0;
        updatedText = fillingDoc.document_text.replace(/\[([ x])\]/g, () =>
          checkboxStates[idx++] ? "[x]" : "[ ]"
        );
      }
      await houseDocumentsApi.updateText(fillingDoc.id, { document_text: updatedText });
      toast.success("Gespeichert");
      setFillingDoc(null);
      await load();
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSavingFill(false);
    }
  }

  // ── Signing ───────────────────────────────────────────────────────────────
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

  function openSign(doc: HouseDoc, mode: "tenant" | "landlord") {
    setSigningDoc(doc);
    setSigMode(mode);
    setHasSignature(false);
    setAgreedSign(false);
    const states: Record<number, boolean> = {};
    let idx = 0;
    for (const match of doc.document_text.matchAll(/\[([ x])\]/g)) {
      states[idx++] = match[1] === "x";
    }
    setCheckboxStates(states);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }, 50);
  }

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * sx, y: ((e as React.MouseEvent).clientY - rect.top) * sy };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    setIsDrawing(true);
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return; e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
    setHasSignature(true);
  }
  function endDraw() { setIsDrawing(false); }
  function clearCanvas() {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSign() {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature || !signingDoc) { toast.error("Bitte unterschreiben"); return; }
    if (sigMode === "tenant" && !agreedSign) { toast.error("Bitte Bestätigung anhaken"); return; }
    const signature = canvas.toDataURL("image/png");
    setSaving(true);
    try {
      if (sigMode === "tenant") {
        const updatedText = signingDoc.document_text ? applyCheckboxes(signingDoc.document_text, checkboxStates) : undefined;
        await houseDocumentsApi.signDirect(signingDoc.id, signature, updatedText);
        toast.success("Mieter-Unterschrift gespeichert, PDF erstellt");
      } else {
        await houseDocumentsApi.landlordSign(signingDoc.id, signature);
        toast.success("Vermieter-Unterschrift gespeichert");
      }
      setSigningDoc(null);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      <Topbar title="Hausunterlagen" />

      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-600" />
              Hausunterlagen
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Dokumente zuweisen, ausfüllen und unterschreiben lassen
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Dokument zuweisen
          </button>
        </div>

        {/* ── Create Modal ──────────────────────────────────────────────────────── */}
        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold dark:text-white">Dokument zuweisen</h2>
                <button onClick={() => { setShowCreate(false); setNachtragRef(""); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              {/* Nachtrag-Hinweis */}
              {nachtragRef && (
                <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg px-3 py-2 text-sm text-orange-800 dark:text-orange-300">
                  <KeyRound className="w-4 h-4 shrink-0" />
                  Nachtrag zum Schlüsselprotokoll vom <strong className="ml-1">{nachtragRef}</strong>
                </div>
              )}

              {/* Dokument / Mieter / Wohnung */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dokument *</label>
                  <select
                    value={selTemplate}
                    onChange={(e) => setSelTemplate(e.target.value)}
                    disabled={!!nachtragRef}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white disabled:opacity-60"
                  >
                    <option value="">– wählen –</option>
                    {templates.map((t) => (
                      <option key={t.filename} value={t.filename}>{t.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mieter</label>
                  <select
                    value={selUserId}
                    onChange={(e) => setSelUserId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">– kein / vor Ort –</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Wohnung</label>
                  <select
                    value={selAptId}
                    onChange={(e) => setSelAptId(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">– keine –</option>
                    {apartments.map((a) => (
                      <option key={a.id} value={a.id}>{FLOOR_LABELS[a.code] || a.name || a.code}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Checkliste: Einzug / Auszug Auswahl */}
              {selTemplate && isCheckliste(selTemplate) && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Art der Checkliste *</p>
                    <div className="flex gap-3">
                      {(["Einzug", "Auszug"] as const).map((art) => (
                        <label key={art} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          checklisteArt === art
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400"
                        }`}>
                          <input
                            type="radio"
                            name="checklisteArt"
                            value={art}
                            checked={checklisteArt === art}
                            onChange={() => setChecklisteArt(art)}
                            className="sr-only"
                          />
                          <span className="text-sm font-semibold">{art}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Die Checkliste wird mit den entsprechenden Punkten für {checklisteArt} erstellt.
                    </p>
                  </div>
                </div>
              )}

              {/* Schlüsselprotokoll: Formular direkt im Create-Modal */}
              {selTemplate && isSchluessel(selTemplate) && (
                <SchluesselForm schlData={schlData} setSchlData={setSchlData} schlEnabled={schlEnabled} setSchlEnabled={setSchlEnabled} />
              )}

              {/* Wohnungsübergabeprotokoll: Formular im Create-Modal */}
              {selTemplate && isUebergabe(selTemplate) && (
                <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Wohnungsübergabe erfassen</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Datum</label>
                      <input type="date" value={uebergabeData.datum}
                        onChange={e => setUebergabeData(p => ({ ...p, datum: e.target.value }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Art</label>
                      <select value={uebergabeData.art}
                        onChange={e => setUebergabeData(p => ({ ...p, art: e.target.value }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white">
                        <option>Übergabe</option>
                        <option>Rückgabe</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Raumzustand</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "wohnzimmer", label: "Wohnzimmer" },
                      { key: "schlafzimmer", label: "Schlafzimmer" },
                      { key: "kueche", label: "Küche" },
                      { key: "bad", label: "Bad/WC" },
                      { key: "flur", label: "Flur/Diele" },
                      { key: "keller", label: "Keller" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                        <input type="text" placeholder="z.B. gut / Fleck an Wand"
                          value={uebergabeData[key as keyof typeof uebergabeData]}
                          onChange={e => setUebergabeData(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Anmerkungen</label>
                    <input type="text" placeholder="Sonstige Anmerkungen..."
                      value={uebergabeData.anmerkungen}
                      onChange={e => setUebergabeData(p => ({ ...p, anmerkungen: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
                  </div>
                </div>
              )}

              {/* Andere Dokumente: Nur Hinweis */}
              {selTemplate && !isCheckliste(selTemplate) && !isSchluessel(selTemplate) && !isUebergabe(selTemplate) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
                  Dieses Dokument wird mit dem Standardtext angelegt. Der Mieter kann es über das Portal lesen und bestätigen.
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowCreate(false); setNachtragRef(""); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  Abbrechen
                </button>
                <button onClick={handleCreate} disabled={creating || !selTemplate}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                  {creating ? "..." : "Anlegen"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Modal (Titel + optionaler Rohtext für Admin) ──────────────────── */}
        {editingDoc && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold dark:text-white">Titel bearbeiten</h2>
                <button onClick={() => setEditingDoc(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titel</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white"
                />
              </div>
              {/* Admin-Notfall: Rohtext bearbeiten (nur wenn nicht interaktiv) */}
              {!isCheckliste(editingDoc.template_filename) && !isSchluessel(editingDoc.template_filename) && !isUebergabe(editingDoc.template_filename) && (
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer hover:text-gray-600 dark:hover:text-gray-200">Admin: Rohtext bearbeiten</summary>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={10}
                    className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 dark:text-white resize-y"
                  />
                </details>
              )}
              <div className="flex gap-2">
                <button onClick={() => setEditingDoc(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  Abbrechen
                </button>
                <button onClick={handleSaveEdit} disabled={savingEdit}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                  <Save className="w-4 h-4" />
                  {savingEdit ? "Speichere..." : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Fill Modal ─────────────────────────────────────────────────────────── */}
        {fillingDoc && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-blue-500" />
                    {isSchluessel(fillingDoc.template_filename) ? "Schlüsselprotokoll ausfüllen"
                      : isCheckliste(fillingDoc.template_filename) ? `Checkliste ${fillArt} ausfüllen`
                      : isUebergabe(fillingDoc.template_filename) ? "Übergabeprotokoll ausfüllen"
                      : "Ausfüllen"}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">{fillingDoc.title}</p>
                </div>
                <button onClick={() => setFillingDoc(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              {/* ── Schlüsselprotokoll ── */}
              {isSchluessel(fillingDoc.template_filename) && (
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
                    Mieter: <strong>{fillingDoc.tenant_name || "–"}</strong> · Wohnung: <strong>{fillingDoc.apartment_label}</strong>
                  </div>
                  <SchluesselForm schlData={schlData} setSchlData={setSchlData} schlEnabled={schlEnabled} setSchlEnabled={setSchlEnabled} />
                </div>
              )}

              {/* ── Checkliste Einzug/Auszug ── */}
              {isCheckliste(fillingDoc.template_filename) && (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
                    Mieter: <strong>{fillingDoc.tenant_name || "–"}</strong> · Wohnung: <strong>{fillingDoc.apartment_label}</strong> · Art: <strong>{fillArt}</strong>
                  </div>
                  <div className="space-y-2">
                    {(fillArt === "Einzug" ? EINZUG_ITEMS : AUSZUG_ITEMS).map((item) => (
                      <div key={item.key} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                        fillChecks[item.key]
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}>
                        <input
                          type="checkbox"
                          checked={!!fillChecks[item.key]}
                          onChange={(e) => setFillChecks(prev => ({ ...prev, [item.key]: e.target.checked }))}
                          className="mt-0.5 w-4 h-4 accent-green-600 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${fillChecks[item.key] ? "text-green-800 dark:text-green-300 font-medium" : "text-gray-800 dark:text-gray-200"}`}>
                            {item.label}
                          </span>
                          {item.hasInput && (
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="text"
                                value={fillInputs[item.key] || ""}
                                onChange={(e) => setFillInputs(prev => ({ ...prev, [item.key]: e.target.value }))}
                                placeholder={item.inputPlaceholder}
                                className="w-32 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 dark:text-white"
                              />
                              {item.inputUnit && <span className="text-xs text-gray-500">{item.inputUnit}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Wohnungsübergabeprotokoll ── */}
              {isUebergabe(fillingDoc.template_filename) && (
                <div className="space-y-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
                    Mieter: <strong>{fillingDoc.tenant_name || "–"}</strong> · Wohnung: <strong>{fillingDoc.apartment_label}</strong>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Datum</label>
                      <input type="date" value={uebergabeData.datum}
                        onChange={e => setUebergabeData(p => ({ ...p, datum: e.target.value }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Art</label>
                      <select value={uebergabeData.art}
                        onChange={e => setUebergabeData(p => ({ ...p, art: e.target.value }))}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white">
                        <option>Übergabe</option>
                        <option>Rückgabe</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Raumzustand</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "wohnzimmer", label: "Wohnzimmer" },
                      { key: "schlafzimmer", label: "Schlafzimmer" },
                      { key: "kueche", label: "Küche" },
                      { key: "bad", label: "Bad/WC" },
                      { key: "flur", label: "Flur/Diele" },
                      { key: "keller", label: "Keller" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                        <input type="text" placeholder="z.B. gut"
                          value={uebergabeData[key as keyof typeof uebergabeData]}
                          onChange={e => setUebergabeData(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Anmerkungen</label>
                    <input type="text" placeholder="Sonstige Anmerkungen..."
                      value={uebergabeData.anmerkungen}
                      onChange={e => setUebergabeData(p => ({ ...p, anmerkungen: e.target.value }))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-white" />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setFillingDoc(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  Abbrechen
                </button>
                <button onClick={handleSaveFill} disabled={savingFill}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                  <Save className="w-4 h-4" />
                  {savingFill ? "Speichere..." : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Document list ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Lade...</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Noch keine Dokumente angelegt.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div key={doc.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-white">{doc.title}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[doc.status]}`}>
                        {doc.status === "draft" && <Clock className="w-3 h-3" />}
                        {doc.status === "sent" && <Send className="w-3 h-3" />}
                        {doc.status === "signed" && <CheckCircle2 className="w-3 h-3" />}
                        {STATUS_LABEL[doc.status]}
                      </span>
                      {/* Badge für interaktive Dokumente */}
                      {isCheckliste(doc.template_filename) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          <ClipboardList className="w-3 h-3" />
                          Checkliste
                        </span>
                      )}
                      {isSchluessel(doc.template_filename) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          Schlüsselprotokoll
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                      {(doc.tenant_user_name || doc.tenant_name) && (
                        <span>Mieter: {doc.tenant_user_name || doc.tenant_name}</span>
                      )}
                      {doc.apartment_label !== "-" && <span>Wohnung: {doc.apartment_label}</span>}
                      <span>Erstellt: {formatDate(doc.created_at)}</span>
                      {doc.tenant_signed_at && <span>Unterschrieben: {formatDate(doc.tenant_signed_at)}</span>}
                    </div>
                    {/* Vorschau des Textes – nur bei ausgefüllten interaktiven Docs */}
                    {doc.document_text && (isSchluessel(doc.template_filename) || isUebergabe(doc.template_filename)) && (
                      <div className="mt-2 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1 font-mono line-clamp-2">
                        {doc.document_text.substring(0, 120)}...
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {/* Titel bearbeiten (only draft) */}
                    {doc.status === "draft" && (
                      <button
                        onClick={() => { setEditingDoc(doc); setEditTitle(doc.title); setEditText(doc.document_text); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                        title="Titel bearbeiten"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Titel
                      </button>
                    )}

                    {/* Ausfüllen – für interaktive Docs */}
                    {(isCheckliste(doc.template_filename) || isSchluessel(doc.template_filename) || isUebergabe(doc.template_filename)) && (
                      <button
                        onClick={() => openFill(doc)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200"
                        title="Ausfüllen"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Ausfüllen
                      </button>
                    )}

                    {/* Download ODT */}
                    <a
                      href={houseDocumentsApi.templateDownloadUrl(doc.template_filename)}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                      title="Original ODT"
                    >
                      <Download className="w-3.5 h-3.5" />
                      ODT
                    </a>

                    {/* Send */}
                    {doc.status === "draft" && doc.tenant_user_id && (
                      <button
                        onClick={() => handleSend(doc.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 hover:bg-amber-200"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Senden
                      </button>
                    )}

                    {/* Tenant signs in person */}
                    {(doc.status === "draft" || doc.status === "sent") && (
                      <button
                        onClick={() => openSign(doc, "tenant")}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200"
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        Mieter unterschreibt
                      </button>
                    )}

                    {/* Landlord countersign */}
                    {doc.status === "signed" && !doc.landlord_signed_at && (
                      <button
                        onClick={() => openSign(doc, "landlord")}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200"
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        Vermieter gegenzeichen
                      </button>
                    )}

                    {/* Nachtrag – nur bei unterschriebenem Schlüsselprotokoll */}
                    {doc.status === "signed" && isSchluessel(doc.template_filename) && (
                      <button
                        onClick={() => openNachtrag(doc)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200"
                        title="Nachtrag Schlüssel"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Nachtrag
                      </button>
                    )}

                    {/* PDF */}
                    {doc.has_pdf && (
                      <a
                        href={houseDocumentsApi.pdfUrl(doc.id)}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </a>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200"
                      title="Löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Signing Modal ─────────────────────────────────────────────────────── */}
        {signingDoc && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-2xl my-8 shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10 rounded-t-xl">
                <h2 className="text-lg font-bold dark:text-white">
                  {sigMode === "tenant" ? "Mieter-Unterschrift" : "Vermieter-Unterschrift"}
                </h2>
                <button onClick={() => setSigningDoc(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{signingDoc.title}</div>
                {signingDoc.tenant_name && <div className="text-xs text-gray-500 mt-0.5">Mieter: {signingDoc.tenant_name} · Wohnung: {signingDoc.apartment_label}</div>}
              </div>

              {/* Document text with interactive checkboxes (for docs with [ ]/[x]) */}
              {sigMode === "tenant" && signingDoc.document_text && /\[[ x]\]/.test(signingDoc.document_text) && (
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Dokumenteninhalt:</p>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-60 overflow-y-auto">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {parseDocText(signingDoc.document_text).map((seg, i) =>
                        seg.type === "text" ? (
                          <span key={i}>{seg.content}</span>
                        ) : (
                          <input
                            key={i}
                            type="checkbox"
                            checked={checkboxStates[seg.index] !== undefined ? checkboxStates[seg.index] : seg.checked}
                            onChange={(e) => setCheckboxStates(prev => ({ ...prev, [seg.index]: e.target.checked }))}
                            className="w-3.5 h-3.5 align-middle accent-blue-600 cursor-pointer mx-0.5"
                          />
                        )
                      )}
                    </pre>
                  </div>
                </div>
              )}

              {/* Plain text preview for non-checkbox docs */}
              {sigMode === "tenant" && signingDoc.document_text && !/\[[ x]\]/.test(signingDoc.document_text) && (
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Dokumenteninhalt:</p>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-60 overflow-y-auto">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{signingDoc.document_text}</pre>
                  </div>
                </div>
              )}

              {sigMode === "landlord" && (
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Vermieter (Alexander Klingel) gegenzeichnet das Dokument. Das PDF wird mit beiden Unterschriften neu erstellt.
                  </p>
                </div>
              )}

              {sigMode === "tenant" && (
                <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedSign}
                      onChange={(e) => setAgreedSign(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Ich habe das Dokument vollständig gelesen und verstanden und bestätige dies mit meiner Unterschrift.
                    </span>
                  </label>
                </div>
              )}

              <div className="px-5 py-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Unterschrift:</p>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 touch-none">
                  <canvas
                    ref={canvasRef}
                    width={700} height={160}
                    className="w-full h-36 cursor-crosshair rounded-lg"
                    style={{ background: "white" }}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                  />
                </div>
                <button onClick={clearCanvas} className="mt-1 text-xs text-gray-400 hover:text-red-500 underline">
                  Löschen
                </button>
              </div>

              <div className="px-5 py-4 flex gap-3 border-t border-gray-200 dark:border-gray-700">
                <button onClick={() => setSigningDoc(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  Abbrechen
                </button>
                <button
                  onClick={handleSign}
                  disabled={saving || !hasSignature || (sigMode === "tenant" && !agreedSign)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? "Speichere..." : "Verbindlich unterschreiben"}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
