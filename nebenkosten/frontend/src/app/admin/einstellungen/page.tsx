"use client";

import Topbar from "@/components/layout/Topbar";
import { useTheme } from "@/lib/theme-context";
import { Moon, Sun, Monitor, Smartphone, Info, HardDrive, RefreshCw, CheckCircle2, AlertCircle, FileArchive } from "lucide-react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    api.get("/api/v1/admin/backup/status")
      .then(r => setBackup(r.data))
      .catch(() => setBackup(null))
      .finally(() => setBackupLoading(false));
  }, []);

  async function runBackup() {
    setBackupRunning(true);
    try {
      await api.post("/api/v1/admin/backup/run");
      toast.success("Backup gestartet");
      const r = await api.get("/api/v1/admin/backup/status");
      setBackup(r.data);
    } catch {
      toast.error("Backup konnte nicht gestartet werden");
    } finally {
      setBackupRunning(false);
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

        {/* Backup */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-600" />
                Datensicherung
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Tägliches Backup der Datenbank und Uploads
              </p>
            </div>
            <button
              onClick={runBackup}
              disabled={backupRunning || !backup?.configured}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${backupRunning ? "animate-spin" : ""}`} />
              {backupRunning ? "Läuft…" : "Jetzt sichern"}
            </button>
          </div>

          <div className="px-5 py-5 space-y-4">
            {backupLoading ? (
              <div className="text-sm text-gray-400">Lade Status…</div>
            ) : !backup || !backup.configured ? (
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Backup nicht konfiguriert</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    Der Backup-Container ist noch nicht gestartet. Auf Synology: <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">docker compose --profile backup up -d backup</code>
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Status-Übersicht */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900 dark:text-white">{backup.file_count}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Backups</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 text-center">
                    <div className="text-lg font-bold text-gray-900 dark:text-white">{backup.total_size_mb.toFixed(0)} MB</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Gesamt</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-bold text-gray-900 dark:text-white">Aktiv</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">tägl. 02:00 Uhr</div>
                  </div>
                </div>

                {backup.last_backup && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Letztes Backup: <strong className="text-gray-900 dark:text-white">{backup.last_backup}</strong>
                  </p>
                )}

                {/* Dateiliste */}
                {backup.files.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {backup.files.map((f) => (
                        <div key={f.filename} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                          <FileArchive className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 font-mono truncate">{f.filename}</span>
                          <span className="text-xs text-gray-400 shrink-0">{f.size_mb} MB</span>
                          {f.created_at && <span className="text-xs text-gray-400 shrink-0">{f.created_at}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Backups werden in <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">backup-data/</code> gespeichert und über Synology Cloud Sync mit Dropbox synchronisiert. Backups älter als 14 Tage werden automatisch gelöscht.
                  </p>
                </div>
              </>
            )}
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
