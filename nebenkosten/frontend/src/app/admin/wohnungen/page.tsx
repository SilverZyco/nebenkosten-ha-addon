"use client";

import { useEffect, useState } from "react";
import { apartmentsApi, settingsApi, apartmentKeysApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { Plus, Trash2, Edit2, Save, X, Check, Pencil, Key, Home, Building2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface ApartmentKey {
  id: string;
  apartment_id: string;
  key_type: "kombi" | "mailbox" | "keller" | "sonstige";
  key_number: string | null;
  quantity: number;
  notes: string | null;
}

const KEY_TYPE_LABELS: Record<string, string> = {
  kombi:    "Kombischlüssel (Haustür/Wohnungstür)",
  mailbox:  "Briefkasten",
  keller:   "Kellerraum",
  sonstige: "Sonstige",
};
const KEY_TYPE_VARIANTS: Record<string, "blue" | "yellow" | "green" | "gray"> = {
  kombi:    "yellow",
  mailbox:  "blue",
  keller:   "green",
  sonstige: "gray",
};

interface Apartment {
  id: string;
  code: string;
  name: string;
  description: string | null;
  floor: number | null;
  area_sqm: number | null;
  water_meter_id: string | null;
  washer_meter_id: string | null;
  zenner_meter_id: string | null;
  has_washer_meter: boolean;
  has_zenner_meter: boolean;
  is_owner_occupied: boolean;
  heating_share_factor: number;
  tax_share_factor: number;
  waste_bin_mappings: WasteBinMapping[];
}

interface WasteBinMapping {
  id: string;
  bin_id: string;
  apartment_id: string;
  valid_from: string;
  valid_to: string | null;
  notes: string | null;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function WohnungenPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [allBinMappings, setAllBinMappings] = useState<WasteBinMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const [houseMeters, setHouseMeters] = useState({
    water_main_meter_id: "",
    gas_main_meter_id: "",
    electricity_common_meter_id: "",
  });
  const [houseMetersSaving, setHouseMetersSaving] = useState(false);

  const [houseInfo, setHouseInfo] = useState({
    house_address: "",
    owner_name: "",
    rental_address: "",
    bank_name: "",
    bank_iban: "",
    bank_bic: "",
    bank_account_holder: "",
  });
  const [houseInfoSaving, setHouseInfoSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Apartment>>({});

  const [allKeys, setAllKeys] = useState<ApartmentKey[]>([]);
  const [showKeyForm, setShowKeyForm] = useState<string | null>(null);
  const [keyForm, setKeyForm] = useState({ key_type: "kombi", key_number: "", quantity: 1, notes: "" });
  const [editingKey, setEditingKey] = useState<ApartmentKey | null>(null);

  const [showBinForm, setShowBinForm] = useState<string | null>(null);
  const [binFormId, setBinFormId] = useState("");
  const [binFormValidFrom, setBinFormValidFrom] = useState("");

  const [toggling, setToggling] = useState<string | null>(null);
  const [editingBinId, setEditingBinId] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [renameDate, setRenameDate] = useState("");

  const [showNewShared, setShowNewShared] = useState(false);
  const [newSharedBinId, setNewSharedBinId] = useState("");
  const [newSharedApts, setNewSharedApts] = useState<string[]>([]);
  const [newSharedValidFrom, setNewSharedValidFrom] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [aptRes, binRes, settingsRes, keyRes] = await Promise.all([
        apartmentsApi.list(),
        apartmentsApi.listWasteBins(),
        settingsApi.get(),
        apartmentKeysApi.list(),
      ]);
      setApartments(aptRes.data);
      setAllBinMappings(binRes.data);
      setAllKeys(keyRes.data);
      setHouseMeters({
        water_main_meter_id: settingsRes.data.water_main_meter_id || "",
        gas_main_meter_id: settingsRes.data.gas_main_meter_id || "",
        electricity_common_meter_id: settingsRes.data.electricity_common_meter_id || "",
      });
      setHouseInfo({
        house_address: settingsRes.data.house_address || "",
        owner_name: settingsRes.data.owner_name || "",
        rental_address: settingsRes.data.rental_address || "",
        bank_name: settingsRes.data.bank_name || "",
        bank_iban: settingsRes.data.bank_iban || "",
        bank_bic: settingsRes.data.bank_bic || "",
        bank_account_holder: settingsRes.data.bank_account_holder || "",
      });
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  const saveHouseInfo = async () => {
    setHouseInfoSaving(true);
    try {
      await settingsApi.update({
        house_address: houseInfo.house_address || null,
        owner_name: houseInfo.owner_name || null,
        rental_address: houseInfo.rental_address || null,
        bank_name: houseInfo.bank_name || null,
        bank_iban: houseInfo.bank_iban || null,
        bank_bic: houseInfo.bank_bic || null,
        bank_account_holder: houseInfo.bank_account_holder || null,
      });
      toast.success("Objekt- & Bankdaten gespeichert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setHouseInfoSaving(false);
    }
  };

  const saveHouseMeters = async () => {
    setHouseMetersSaving(true);
    try {
      await settingsApi.update({
        water_main_meter_id: houseMeters.water_main_meter_id || null,
        gas_main_meter_id: houseMeters.gas_main_meter_id || null,
        electricity_common_meter_id: houseMeters.electricity_common_meter_id || null,
      });
      toast.success("Hauszähler gespeichert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setHouseMetersSaving(false);
    }
  };

  const emptyKeyForm = { key_type: "kombi", key_number: "", quantity: 1, notes: "" };

  const openKeyForm = (aptId: string) => {
    setShowKeyForm(aptId);
    setEditingKey(null);
    setKeyForm(emptyKeyForm);
  };

  const openEditKey = (key: ApartmentKey) => {
    setEditingKey(key);
    setShowKeyForm(key.apartment_id);
    setKeyForm({ key_type: key.key_type, key_number: key.key_number || "", quantity: key.quantity, notes: key.notes || "" });
  };

  const saveKey = async (aptId: string) => {
    if (keyForm.quantity < 1) { toast.error("Anzahl muss mind. 1 sein"); return; }
    try {
      if (editingKey) {
        await apartmentKeysApi.update(editingKey.id, { key_type: keyForm.key_type, key_number: keyForm.key_number || null, quantity: keyForm.quantity, notes: keyForm.notes || null });
        toast.success("Schlüssel aktualisiert");
      } else {
        await apartmentKeysApi.create({ apartment_id: aptId, key_type: keyForm.key_type, key_number: keyForm.key_number || null, quantity: keyForm.quantity, notes: keyForm.notes || null });
        toast.success("Schlüssel eingetragen");
      }
      setShowKeyForm(null);
      setEditingKey(null);
      fetchData();
    } catch { toast.error("Fehler beim Speichern"); }
  };

  const deleteKey = async (id: string) => {
    if (!confirm("Schlüsseleintrag löschen?")) return;
    try {
      await apartmentKeysApi.delete(id);
      toast.success("Gelöscht");
      fetchData();
    } catch { toast.error("Fehler beim Löschen"); }
  };

  useEffect(() => { fetchData(); }, []);

  const binGroups = (() => {
    const grouped: Record<string, WasteBinMapping[]> = {};
    for (const m of allBinMappings) {
      if (!grouped[m.bin_id]) grouped[m.bin_id] = [];
      grouped[m.bin_id].push(m);
    }
    return grouped;
  })();

  const sharedBinIds = Object.keys(binGroups).filter((id) => binGroups[id].length > 1);
  const individualBinIds = new Set(Object.keys(binGroups).filter((id) => binGroups[id].length === 1));

  const startEdit = (apt: Apartment) => { setEditId(apt.id); setEditForm({ ...apt }); };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      await apartmentsApi.update(editId, editForm);
      toast.success("Gespeichert");
      setEditId(null);
      fetchData();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const addIndividualBin = async (aptId: string) => {
    if (!binFormId.trim()) return toast.error("Tonnen-Nr. erforderlich");
    if (!binFormValidFrom) return toast.error("Gültig ab erforderlich");
    try {
      await apartmentsApi.createWasteBin({ bin_id: binFormId.trim(), apartment_id: aptId, valid_from: binFormValidFrom });
      toast.success("Tonne zugeordnet");
      setShowBinForm(null);
      setBinFormId("");
      setBinFormValidFrom("");
      fetchData();
    } catch { toast.error("Fehler"); }
  };

  const deleteBinMapping = async (mappingId: string) => {
    if (!window.confirm("Tonnen-Zuordnung löschen?")) return;
    try {
      await apartmentsApi.deleteWasteBin(mappingId);
      toast.success("Gelöscht");
      fetchData();
    } catch { toast.error("Fehler"); }
  };

  const toggleSharedBinApt = async (binId: string, apt: Apartment) => {
    const key = `${binId}-${apt.id}`;
    setToggling(key);
    try {
      const existing = binGroups[binId]?.find((m) => m.apartment_id === apt.id);
      if (existing) {
        await apartmentsApi.deleteWasteBin(existing.id);
        toast.success(`${apt.code} aus Biotonne ${binId} entfernt`);
      } else {
        await apartmentsApi.createWasteBin({ bin_id: binId, apartment_id: apt.id });
        toast.success(`${apt.code} zur Biotonne ${binId} hinzugefügt`);
      }
      await fetchData();
    } catch { toast.error("Fehler beim Ändern"); }
    finally { setToggling(null); }
  };

  const todayStr = () => new Date().toISOString().split("T")[0];

  const startRename = (binId: string) => { setEditingBinId(binId); setRenameTo(binId); setRenameDate(todayStr()); };

  const saveRename = async () => {
    if (!editingBinId || !renameTo.trim()) return;
    const newId = renameTo.trim();
    if (newId === editingBinId) { setEditingBinId(null); return; }
    if (!renameDate) return toast.error("Wechseldatum erforderlich");
    try {
      const mappings = binGroups[editingBinId] || [];
      // Close old mappings: valid_to = day before switch date
      const switchDate = new Date(renameDate);
      const dayBefore = new Date(switchDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const validTo = dayBefore.toISOString().split("T")[0];
      await Promise.all(mappings.map((m) => apartmentsApi.updateWasteBin(m.id, { bin_id: m.bin_id, apartment_id: m.apartment_id, valid_from: m.valid_from, valid_to: validTo })));
      // Create new mappings with new bin_id from switch date
      await Promise.all(mappings.map((m) => apartmentsApi.createWasteBin({ bin_id: newId, apartment_id: m.apartment_id, valid_from: renameDate })));
      toast.success(`Tonnenwechsel: ${editingBinId} → ${newId} ab ${renameDate}`);
      setEditingBinId(null);
      fetchData();
    } catch { toast.error("Fehler beim Tonnenwechsel"); }
  };

  const saveNewSharedBin = async () => {
    if (!newSharedBinId.trim()) return toast.error("Tonnen-Nr. erforderlich");
    if (newSharedApts.length < 2) return toast.error("Mindestens 2 Wohnungen auswählen");
    if (!newSharedValidFrom) return toast.error("Gültig ab erforderlich");
    try {
      await Promise.all(newSharedApts.map((aptId) => apartmentsApi.createWasteBin({ bin_id: newSharedBinId.trim(), apartment_id: aptId, valid_from: newSharedValidFrom })));
      toast.success("Geteilte Tonne angelegt");
      setShowNewShared(false);
      setNewSharedBinId("");
      setNewSharedApts([]);
      setNewSharedValidFrom("");
      fetchData();
    } catch { toast.error("Fehler beim Anlegen"); }
  };

  const ef = editForm as Partial<Apartment>;

  return (
    <div className="p-4 md:p-6 space-y-6 flex-1 overflow-y-auto">
      <PageHeader
        title="Wohnungen"
        subtitle="Wohnungs- und Ausstattungsverwaltung, Zähler, Schlüssel und Mülltonnen"
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Apartment Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {apartments.map((apt) => {
              const isEditing = editId === apt.id;
              const individualBins = apt.waste_bin_mappings.filter((b) => individualBinIds.has(b.bin_id));
              const aptKeys = allKeys.filter(k => k.apartment_id === apt.id);

              return (
                <Card key={apt.id} className="overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-900 dark:bg-brand-800 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{apt.code}</span>
                      </div>
                      <div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={ef.name || ""}
                            onChange={(e) => setEditForm({ ...ef, name: e.target.value })}
                            className="font-semibold text-gray-900 dark:text-gray-100 border-b border-brand-400 focus:outline-none bg-transparent"
                          />
                        ) : (
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{apt.name}</div>
                        )}
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {apt.is_owner_occupied ? (
                            <Badge variant="brand" size="sm">Eigennutzung</Badge>
                          ) : (
                            <span>Miete</span>
                          )}
                          {apt.area_sqm && <span className="ml-1">· {apt.area_sqm} m²</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded">
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(apt)} className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-5 py-4 space-y-4">
                    {/* Meter fields */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <Field label="Wasserzähler-Nr." unit="m³" value={isEditing ? ef.water_meter_id || "" : apt.water_meter_id || "–"}
                        editing={isEditing} onChange={(v) => setEditForm({ ...ef, water_meter_id: v })} />

                      {!apt.is_owner_occupied && (
                        <Field label="Waschmaschinenzähler" unit="m³" value={isEditing ? ef.washer_meter_id || "" : apt.washer_meter_id || "–"}
                          editing={isEditing} onChange={(v) => setEditForm({ ...ef, washer_meter_id: v })}
                          extra={isEditing && (
                            <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                              <input type="checkbox" checked={ef.has_washer_meter} onChange={(e) => setEditForm({ ...ef, has_washer_meter: e.target.checked })} />
                              Vorhanden
                            </label>
                          )} />
                      )}

                      {!apt.is_owner_occupied ? (
                        <Field label="Zenner-Zähler-Nr." unit="MWh" value={isEditing ? ef.zenner_meter_id || "" : apt.zenner_meter_id || "–"}
                          editing={isEditing} onChange={(v) => setEditForm({ ...ef, zenner_meter_id: v })}
                          extra={isEditing && (
                            <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                              <input type="checkbox" checked={ef.has_zenner_meter} onChange={(e) => setEditForm({ ...ef, has_zenner_meter: e.target.checked })} />
                              Vorhanden
                            </label>
                          )} />
                      ) : (
                        <Field label="Gaszähler-Nr." unit="m³" value={isEditing ? ef.zenner_meter_id || "" : apt.zenner_meter_id || "–"}
                          editing={isEditing} onChange={(v) => setEditForm({ ...ef, zenner_meter_id: v })}
                          extra={<div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Eigener Anschluss · kein Zenner-System</div>} />
                      )}

                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Wohnfläche (m²)</div>
                        {isEditing ? (
                          <input type="number" step="0.1" min="0" value={ef.area_sqm ?? ""}
                            onChange={(e) => setEditForm({ ...ef, area_sqm: e.target.value ? parseFloat(e.target.value) : null })}
                            placeholder="z.B. 65.5"
                            className="border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-brand-400 text-sm w-24 bg-transparent text-gray-900 dark:text-gray-100" />
                        ) : (
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {apt.area_sqm ? `${apt.area_sqm} m²` : <span className="text-amber-500 text-xs">nicht hinterlegt</span>}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Heiz-Kostenfaktor</div>
                        {isEditing ? (
                          <input type="number" step="0.1" value={ef.heating_share_factor || ""}
                            onChange={(e) => setEditForm({ ...ef, heating_share_factor: parseFloat(e.target.value) })}
                            className="border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-brand-400 text-sm w-20 bg-transparent text-gray-900 dark:text-gray-100" />
                        ) : (
                          <div className="font-medium text-gray-900 dark:text-gray-100">{apt.heating_share_factor}×</div>
                        )}
                      </div>
                    </div>

                    {/* Individual waste bins */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Restmülltonne (EVS)</div>
                        <button
                          onClick={() => { setShowBinForm(apt.id); setBinFormId(""); }}
                          className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Zuordnen
                        </button>
                      </div>
                      {individualBins.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">Keine Restmülltonne zugeordnet</p>
                      ) : (
                        <div className="space-y-1">
                          {individualBins.map((bin) => (
                            <div key={bin.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-1.5">
                              <span className="font-mono text-sm font-medium text-brand-700 dark:text-brand-400">{bin.bin_id}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">ab {formatDate(bin.valid_from)}</span>
                              <button onClick={() => deleteBinMapping(bin.id)} className="ml-auto p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {showBinForm === apt.id && (
                        <div className="mt-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 space-y-2 border border-blue-100 dark:border-blue-800">
                          <input type="text" placeholder="Tonnen-Nr. (z.B. 312864)" value={binFormId}
                            onChange={(e) => setBinFormId(e.target.value)}
                            className={inputCls}
                            autoFocus />
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Gültig ab</label>
                            <input type="date" value={binFormValidFrom} onChange={(e) => setBinFormValidFrom(e.target.value)} className={inputCls} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => addIndividualBin(apt.id)} className="px-3 py-1 bg-brand-900 text-white rounded text-xs hover:bg-brand-800">Speichern</button>
                            <button onClick={() => setShowBinForm(null)} className="px-3 py-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Abbrechen</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Keys */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          <Key className="w-3 h-3" /> Schlüssel
                        </div>
                        <button onClick={() => openKeyForm(apt.id)} className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Eintragen
                        </button>
                      </div>

                      {aptKeys.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">Keine Schlüssel hinterlegt</p>
                      ) : (
                        <div className="space-y-1">
                          {aptKeys.map(key => (
                            <div key={key.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-1.5">
                              <Badge variant={KEY_TYPE_VARIANTS[key.key_type]} size="sm">{KEY_TYPE_LABELS[key.key_type]}</Badge>
                              {key.key_number && <span className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">Nr. {key.key_number}</span>}
                              <span className="text-xs text-gray-500 dark:text-gray-400">× {key.quantity} Stück</span>
                              {key.notes && <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">{key.notes}</span>}
                              <div className="ml-auto flex gap-1">
                                <button onClick={() => openEditKey(key)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => deleteKey(key.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {showKeyForm === apt.id && (
                        <div className="mt-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 space-y-2 border border-blue-100 dark:border-blue-800">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Typ</label>
                              <select value={keyForm.key_type} onChange={e => setKeyForm({ ...keyForm, key_type: e.target.value })} className={inputCls}>
                                <option value="kombi">Kombischlüssel (Haustür/Wohnungstür)</option>
                                <option value="mailbox">Briefkasten</option>
                                <option value="keller">Kellerraum</option>
                                <option value="sonstige">Sonstige</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Anzahl herausgegeben</label>
                              <input type="number" min={1} value={keyForm.quantity} onChange={e => setKeyForm({ ...keyForm, quantity: parseInt(e.target.value) || 1 })} className={inputCls} />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Schlüssel-Nr. (optional)</label>
                            <input type="text" value={keyForm.key_number} onChange={e => setKeyForm({ ...keyForm, key_number: e.target.value })} placeholder="z.B. BK-12 oder 045" className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notiz (optional)</label>
                            <input type="text" value={keyForm.notes} onChange={e => setKeyForm({ ...keyForm, notes: e.target.value })} placeholder="z.B. übergeben am 01.03.2026" className={inputCls} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveKey(apt.id)} className="px-3 py-1 bg-brand-900 text-white rounded text-xs hover:bg-brand-800 font-medium">
                              {editingKey ? "Speichern" : "Eintragen"}
                            </button>
                            <button onClick={() => { setShowKeyForm(null); setEditingKey(null); }} className="px-3 py-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-700">
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Shared Bins (Biotonne) */}
          <Card>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Geteilte Tonnen (Biotonne)</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Kosten werden gleichmäßig auf alle angehakten Wohnungen aufgeteilt. Tonnen-Nr. kann bei Austausch geändert werden.
                </p>
              </div>
              <button
                onClick={() => { setShowNewShared(true); setNewSharedBinId(""); setNewSharedApts([]); }}
                className="flex items-center gap-1.5 bg-brand-900 text-white hover:bg-brand-800 px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Neue Tonne
              </button>
            </div>

            {sharedBinIds.length === 0 && !showNewShared ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                Noch keine geteilte Tonne angelegt. Über &quot;Neue Tonne&quot; eine Biotonne für mehrere Wohnungen anlegen.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tonnen-Nr.</th>
                      {apartments.map((apt) => (
                        <th key={apt.id} className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">{apt.code}</th>
                      ))}
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Anteil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                    {sharedBinIds.map((binId) => {
                      const count = binGroups[binId].filter((m) => apartments.some((a) => a.id === m.apartment_id)).length;
                      const isRenaming = editingBinId === binId;

                      return (
                        <tr key={binId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-5 py-3">
                            {isRenaming ? (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={renameTo}
                                    onChange={(e) => setRenameTo(e.target.value)}
                                    placeholder="Neue Tonnen-Nr."
                                    className="font-mono text-sm border border-brand-400 dark:border-brand-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-36"
                                    autoFocus
                                  />
                                  <button onClick={saveRename} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"><Check className="w-4 h-4" /></button>
                                  <button onClick={() => setEditingBinId(null)} className="p-1 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Wechsel ab</label>
                                  <input
                                    type="date"
                                    value={renameDate}
                                    onChange={(e) => setRenameDate(e.target.value)}
                                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span className="font-mono font-medium text-brand-700 dark:text-brand-400">{binId}</span>
                                <button
                                  onClick={() => startRename(binId)}
                                  className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Tonnen-Nr. ändern"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>

                          {apartments.map((apt) => {
                            const key = `${binId}-${apt.id}`;
                            const isLoading = toggling === key;
                            const hasMapping = binGroups[binId]?.some((m) => m.apartment_id === apt.id);

                            return (
                              <td key={apt.id} className="text-center px-4 py-3">
                                <button
                                  onClick={() => toggleSharedBinApt(binId, apt)}
                                  disabled={isLoading}
                                  title={hasMapping ? `${apt.code} aus Tonne entfernen` : `${apt.code} zur Tonne hinzufügen`}
                                  className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center mx-auto transition-colors disabled:opacity-40 ${
                                    hasMapping
                                      ? "bg-green-600 border-green-600 text-white hover:bg-red-500 hover:border-red-500"
                                      : "border-gray-300 dark:border-gray-600 text-transparent hover:border-brand-400 hover:text-brand-300"
                                  }`}
                                >
                                  {isLoading ? (
                                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Check className="w-4 h-4" />
                                  )}
                                </button>
                              </td>
                            );
                          })}

                          <td className="text-center px-4 py-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                              ÷{count}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {/* New shared bin form row */}
                    {showNewShared && (
                      <tr className="border-t border-gray-100 dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/10">
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-1.5">
                            <input
                              type="text"
                              value={newSharedBinId}
                              onChange={(e) => setNewSharedBinId(e.target.value)}
                              placeholder="Tonnen-Nr."
                              className="font-mono text-sm border border-brand-400 dark:border-brand-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-36"
                              autoFocus
                            />
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Gültig ab</label>
                              <input
                                type="date"
                                value={newSharedValidFrom}
                                onChange={(e) => setNewSharedValidFrom(e.target.value)}
                                className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                          </div>
                        </td>
                        {apartments.map((apt) => {
                          const checked = newSharedApts.includes(apt.id);
                          return (
                            <td key={apt.id} className="text-center px-4 py-3">
                              <button
                                onClick={() => setNewSharedApts((prev) => checked ? prev.filter((id) => id !== apt.id) : [...prev, apt.id])}
                                className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center mx-auto transition-colors ${
                                  checked ? "bg-brand-900 border-brand-900 text-white" : "border-gray-300 dark:border-gray-600 text-transparent hover:border-brand-400"
                                }`}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 justify-center">
                            <button onClick={saveNewSharedBin} className="px-3 py-1.5 bg-brand-900 text-white rounded text-xs hover:bg-brand-800 font-medium">Anlegen</button>
                            <button onClick={() => setShowNewShared(false)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs hover:bg-gray-50 dark:hover:bg-gray-700">Abbrechen</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Objekt & Bankdaten */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Home className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Objekt &amp; Bankdaten</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">erscheinen auf der Nebenkostenabrechnung (PDF)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Eigentümer / Vermieter</label>
                <input type="text" value={houseInfo.owner_name} onChange={(e) => setHouseInfo(h => ({ ...h, owner_name: e.target.value }))} className={inputCls} placeholder="z.B. Alexander Klingel" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Anschrift Vermieter</label>
                <input type="text" value={houseInfo.house_address} onChange={(e) => setHouseInfo(h => ({ ...h, house_address: e.target.value }))} className={inputCls} placeholder="z.B. Nauwies 7, 66802 Überherrn" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Mietobjekt (Anschrift Mieter)</label>
                <input type="text" value={houseInfo.rental_address} onChange={(e) => setHouseInfo(h => ({ ...h, rental_address: e.target.value }))} className={inputCls} placeholder="z.B. Hauptstraße 15, 66802 Überherrn" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Kontoinhaber</label>
                <input type="text" value={houseInfo.bank_account_holder} onChange={(e) => setHouseInfo(h => ({ ...h, bank_account_holder: e.target.value }))} className={inputCls} placeholder="z.B. Alexander Klingel" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Bank</label>
                <input type="text" value={houseInfo.bank_name} onChange={(e) => setHouseInfo(h => ({ ...h, bank_name: e.target.value }))} className={inputCls} placeholder="z.B. Kreissparkasse Saarlouis" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">IBAN</label>
                <input type="text" value={houseInfo.bank_iban} onChange={(e) => setHouseInfo(h => ({ ...h, bank_iban: e.target.value }))} className={`${inputCls} font-mono`} placeholder="DE57 5935 0110 1370 2572 79" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">BIC</label>
                <input type="text" value={houseInfo.bank_bic} onChange={(e) => setHouseInfo(h => ({ ...h, bank_bic: e.target.value }))} className={`${inputCls} font-mono`} placeholder="KRSADE55XXX" />
              </div>
            </div>
            <div className="mt-3">
              <button onClick={saveHouseInfo} disabled={houseInfoSaving} className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {houseInfoSaving ? "Speichern …" : "Speichern"}
              </button>
            </div>
          </Card>

          {/* Hauszähler */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Hauszähler-Nummern</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">für Foto-Erkennung (KI)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Hauptwasserzähler-Nr. <span className="text-gray-400">(m³)</span></label>
                <input type="text" value={houseMeters.water_main_meter_id} onChange={(e) => setHouseMeters(h => ({ ...h, water_main_meter_id: e.target.value }))} className={`${inputCls} font-mono`} placeholder="z.B. 12345678" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Hauptgaszähler-Nr. <span className="text-gray-400">(m³)</span></label>
                <input type="text" value={houseMeters.gas_main_meter_id} onChange={(e) => setHouseMeters(h => ({ ...h, gas_main_meter_id: e.target.value }))} className={`${inputCls} font-mono`} placeholder="z.B. 87654321" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Allgemeinstromzähler-Nr. <span className="text-gray-400">(kWh)</span></label>
                <input type="text" value={houseMeters.electricity_common_meter_id} onChange={(e) => setHouseMeters(h => ({ ...h, electricity_common_meter_id: e.target.value }))} className={`${inputCls} font-mono`} placeholder="z.B. 11223344" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button onClick={saveHouseMeters} disabled={houseMetersSaving} className="bg-brand-900 text-white hover:bg-brand-800 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {houseMetersSaving ? "Speichern …" : "Speichern"}
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Wenn ein Foto eines Hauszählers hochgeladen wird, erkennt die KI ihn automatisch anhand dieser Nummer.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, unit, value, editing, onChange, extra }: {
  label: string; unit?: string; value: string; editing: boolean; onChange: (v: string) => void; extra?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {label}
        {unit && <span className="ml-1 text-gray-400">({unit})</span>}
      </div>
      {editing ? (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-brand-400 text-sm w-full bg-transparent text-gray-900 dark:text-gray-100" />
      ) : (
        <div className="font-medium text-gray-900 dark:text-gray-100">{value}</div>
      )}
      {extra}
    </div>
  );
}
