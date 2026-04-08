"use client";

import Topbar from "@/components/layout/Topbar";
import { useTheme } from "@/lib/theme-context";
import { Moon, Sun, Monitor, Smartphone, Info, HardDrive, RefreshCw, CheckCircle2, AlertCircle, FileArchive, Download, Upload, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

interface BackupFile {
  filename: string;
  size_mb: number;
  created_at: string | null;
}

interface BackupStatus {
  configured: boolean;
  backup_dir: string;
  files: BackupFile[];
  last_backup: string | null;
  total_size_mb: number;
  file_count: number;
}

export default function EinstellungenPage() {
  const { theme, setTheme } = useTheme();

  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupRunning, setBackupRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get("/admin/backup/status")
      .then(r => setBackup(r.data))
      .catch(() => setBackup(null))
      .finally(() => setBackupLoading(false));
  }, []);

  async function runBackup() {
    setBackupRunning(true);
    try {
      await api.post("/admin/backup/run");
      toast.success("Backup gestartet");
      const r = await api.get("/admin/backup/status");
      setBackup(r.data);
    } catch {
      toast.error("Backup konnte nicht gestartet werden");
    } finally {
      setBackupRunning(false);
    }
  }

  async function downloadBackup() {
    setExporting(true);
    try {
      const response = await api.get("/admin/backup/export", { responseType: "blob" });
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `nebenkosten_backup_${timestamp}.sql`;
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup heruntergeladen");
    } catch {
      toast.error("Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".sql")) {
      toast.error("Nur .sql Dateien erlaubt");
      return;
    }

    const confirmed = window.confirm(
      `Datenbank wirklich mit "${file.name}" überschreiben?\n\nAlle aktuellen Daten gehen verloren!`
    );
    if (!confirmed) {
      e.target.value = "";
      return;
    }

    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/admin/backup/restore", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000,
      });
      toast.success("Datenbank erfolgreich wiederhergestellt – bitte Seite neu laden");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ? `Restore fehlgeschlagen: ${msg}` : "Restore fehlgeschlagen");
    } finally {
      setRestoring(false);
      e.target.value = "";
    }
  }

  return (
    <>
      <Topbar
        title="Einstellungen"
        subtitle="Darstellung und allgemeine Einstellungen"
      />

      <div className="p-6 flex-1 overflow-y-auto space-y-6">

        {/* Darstellung */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Darstellung</h2>
            <p className="text-sm text-gray-500 mt-0.5">Erscheinungsbild des Portals anpassen</p>
          </div>

          <div className="px-5 py-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Farbschema</p>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">

              {/* Hell */}
              <button
                onClick={() => setTheme("light")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  theme === "light"
                    ? "border-brand-700 bg-brand-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  theme === "light" ? "bg-brand-700 text-white" : "bg-gray-100 text-gray-600"
                }`}>
                  <Sun className="w-5 h-5" />
                </div>
                <span className={`text-sm font-medium ${
                  theme === "light" ? "text-brand-700" : "text-gray-700"
                }`}>
                  Hell
                </span>
                {theme === "light" && (
                  <span className="text-xs text-brand-600 font-medium">Aktiv</span>
                )}
              </button>

              {/* Dunkel */}
              <button
                onClick={() => setTheme("dark")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  theme === "dark"
                    ? "border-brand-700 bg-brand-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  theme === "dark" ? "bg-brand-700 text-white" : "bg-gray-100 text-gray-600"
                }`}>
                  <Moon className="w-5 h-5" />
                </div>
                <span className={`text-sm font-medium ${
                  theme === "dark" ? "text-brand-700" : "text-gray-700"
                }`}>
                  Dunkel
                </span>
                {theme === "dark" && (
                  <span className="text-xs text-brand-600 font-medium">Aktiv</span>
                )}
              </button>

            </div>
          </div>
        </div>

        {/* App-Installation */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">App installieren</h2>
            <p className="text-sm text-gray-500 mt-0.5">Portal als App auf dem Smartphone installieren</p>
          </div>

          <div className="px-5 py-5 space-y-4">
            <div className="flex gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Android – App-Shortcut</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Öffnen Sie das Portal in Chrome → Menü (⋮) → <strong>„Zum Startbildschirm hinzufügen"</strong>.
                  Die App öffnet dann ohne Browser-Leiste und ist immer aktuell.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">iPhone / iPad – Safari</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Portal in Safari öffnen → Teilen-Icon (□↑) → <strong>„Zum Home-Bildschirm"</strong>.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Das Portal ist als Progressive Web App (PWA) eingerichtet. Updates erfolgen automatisch – die App zeigt immer die neueste Version.
              </p>
            </div>
          </div>
        </div>

        {/* Datensicherung */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-600" />
              Datensicherung
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Datenbank auf PC sichern und wiederherstellen
            </p>
          </div>

          <div className="px-5 py-5 space-y-4">

            {/* Export & Restore Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Export */}
              <button
                onClick={downloadBackup}
                disabled={exporting}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {exporting
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />
                }
                {exporting ? "Exportiere…" : "Backup herunterladen"}
              </button>

              {/* Restore */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={restoring}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {restoring
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Upload className="w-4 h-4" />
                }
                {restoring ? "Stelle wieder her…" : "Backup einspielen"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sql"
                className="hidden"
                onChange={handleRestoreFile}
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Backup herunterladen</strong> speichert die komplette Datenbank als SQL-Datei auf deinem PC.
                <strong className="ml-1">Backup einspielen</strong> stellt eine zuvor heruntergeladene .sql Datei wieder her.
                Beim Restore gehen alle aktuellen Daten verloren.
              </p>
            </div>

            {/* Automatisches Server-Backup (optional) */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-gray-400" />
                  Automatisches Server-Backup
                </p>
                <button
                  onClick={runBackup}
                  disabled={backupRunning || !backup?.configured}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${backupRunning ? "animate-spin" : ""}`} />
                  {backupRunning ? "Läuft…" : "Jetzt sichern"}
                </button>
              </div>

              {backupLoading ? (
                <div className="text-sm text-gray-400">Lade Status…</div>
              ) : !backup || !backup.configured ? (
                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Nicht konfiguriert. Im HA-Addon werden Backups automatisch im /data Verzeichnis gespeichert.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
                      <div className="text-base font-bold text-gray-900 dark:text-white">{backup.file_count}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Backups</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
                      <div className="text-base font-bold text-gray-900 dark:text-white">{backup.total_size_mb.toFixed(0)} MB</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Gesamt</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-xs font-bold text-gray-900 dark:text-white">Aktiv</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">tägl. 02:00</div>
                    </div>
                  </div>

                  {backup.last_backup && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Letztes Backup: <strong className="text-gray-900 dark:text-white">{backup.last_backup}</strong>
                    </p>
                  )}

                  {backup.files.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="max-h-40 overflow-y-auto">
                        {backup.files.map((f) => (
                          <div key={f.filename} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                            <FileArchive className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 font-mono truncate">{f.filename}</span>
                            <span className="text-xs text-gray-400 shrink-0">{f.size_mb} MB</span>
                            {f.created_at && <span className="text-xs text-gray-400 shrink-0">{f.created_at}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Version */}
        <div className="text-center text-xs text-gray-400 pb-2">
          Nebenkosten-Portal · Nauwies 7, 66802 Überherrn
        </div>

      </div>
    </>
  );
}
