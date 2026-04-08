"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { tenantApi } from "@/lib/api";
import { formatDate, DOCUMENT_TYPE_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";
import { Download, Filter } from "lucide-react";

interface Document {
  id: string;
  original_filename: string;
  document_type: string;
  year: number | null;
  invoice_date: string | null;
  service_period_from: string | null;
  service_period_to: string | null;
  supplier_name: string | null;
  upload_date: string;
}

export default function TenantDokumente() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterYear, setFilterYear] = useState("");

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (filterType) params.document_type = filterType;
      if (filterYear) params.year = parseInt(filterYear);
      const res = await tenantApi.listDocuments(params);
      setDocs(res.data);
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, [filterType, filterYear]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  // Filter only relevant document types for tenants
  const tenantDocTypes = [
    "water_invoice", "gas_invoice", "waste_invoice_evs",
    "maintenance_invoice", "chimney_sweep_invoice",
    "electricity_common_invoice", "rainwater_fee_invoice",
    "property_tax_notice", "insurance_invoice",
    "contract", "meter_reading",
    "instruction", "ancillary_costs_notice", "house_rules",
    "other"
  ];

  return (
    <>
      <Topbar title="Dokumente" subtitle="Freigegebene Belege und Unterlagen" />

      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        {/* Filters */}
        <div className="flex gap-3 bg-white rounded-xl border border-gray-200 p-4">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">Alle Jahre</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">Alle Typen</option>
            {tenantDocTypes.map((k) => (
              <option key={k} value={k}>{DOCUMENT_TYPE_LABELS[k] || k}</option>
            ))}
          </select>
        </div>

        {/* Documents Grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <p>Keine Dokumente vorhanden</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Dokument</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Typ</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Jahr</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Zeitraum</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Download</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate max-w-[200px]">
                        {d.supplier_name || d.original_filename}
                      </div>
                      {d.supplier_name && (
                        <div className="text-xs text-gray-400 truncate max-w-[200px]">{d.original_filename}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {DOCUMENT_TYPE_LABELS[d.document_type] || d.document_type}
                    </td>
                    <td className="px-4 py-3">{d.year || "–"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {d.service_period_from && d.service_period_to
                        ? `${formatDate(d.service_period_from)} – ${formatDate(d.service_period_to)}`
                        : d.invoice_date ? formatDate(d.invoice_date) : "–"
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={tenantApi.downloadDocumentUrl(d.id)}
                        target="_blank"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </a>
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
