"use client";

import { useState, useRef } from "react";
import Topbar from "@/components/layout/Topbar";
import { documentsApi } from "@/lib/api";
import { DOCUMENT_TYPE_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";
import { Upload, FileText, CheckCircle } from "lucide-react";

export default function ImportPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ name: string; success: boolean; error?: string }[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [docType, setDocType] = useState("other");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleImport = async () => {
    if (files.length === 0) return toast.error("Keine Dateien ausgewählt");
    setImporting(true);
    const newResults: typeof results = [];

    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("year", year);
        fd.append("document_type", docType);
        await documentsApi.upload(fd);
        newResults.push({ name: file.name, success: true });
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Fehler";
        newResults.push({ name: file.name, success: false, error: msg });
      }
    }

    setResults(newResults);
    setImporting(false);
    const ok = newResults.filter(r => r.success).length;
    toast.success(`${ok}/${files.length} Dateien importiert`);
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  return (
    <>
      <Topbar title="Archiv-Import" subtitle="Alte Belege und Abrechnungen importieren" />

      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Dokumente massenweise importieren</h3>
          <p className="text-sm text-gray-500 mb-6">
            Laden Sie alte PDFs hoch. Sie werden automatisch per OCR + KI analysiert und in der KI-Inbox
            zur Bestätigung bereitgestellt.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Dokumentjahr</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Dokumenttyp (Voreinstellung)</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-blue-50/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">Dateien hierher ziehen oder klicken</p>
            <p className="text-xs text-gray-400 mt-1">PDF, PNG, JPG, TIFF · max. 50 MB pro Datei</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
            className="hidden"
            onChange={handleFiles}
          />

          {files.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">{files.length} Datei(en) ausgewählt:</p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    {f.name}
                    <span className="text-gray-400 text-xs">({(f.size / 1024).toFixed(0)} KB)</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleImport}
                disabled={importing}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-brand-900 text-white rounded-lg text-sm hover:bg-brand-800 disabled:opacity-50"
              >
                {importing ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {importing ? "Importiere..." : `${files.length} Datei(en) importieren`}
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Import-Ergebnis</h3>
            <ul className="space-y-2">
              {results.map((r, i) => (
                <li key={i} className={`flex items-center gap-2 text-sm ${r.success ? "text-green-700" : "text-red-600"}`}>
                  {r.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <span className="w-4 h-4 shrink-0">✗</span>}
                  <span className="font-medium">{r.name}</span>
                  {r.error && <span className="text-xs">– {r.error}</span>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-4">
              Importierte Dokumente werden in der KI-Inbox zur Prüfung bereitgestellt.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
