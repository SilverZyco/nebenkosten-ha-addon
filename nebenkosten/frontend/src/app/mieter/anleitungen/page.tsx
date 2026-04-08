"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { tenantInstructionsApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { Download, BookMarked } from "lucide-react";

interface Instruction {
  id: string;
  title: string;
  created_at: string;
}

export default function TenantAnleitungen() {
  const [items, setItems] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tenantInstructionsApi.list()
      .then((res) => setItems(res.data))
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="Bedienungsanleitungen" subtitle="Ihre Anleitungen und Informationsblätter" />

      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <BookMarked className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>Noch keine Bedienungsanleitungen vorhanden</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Titel</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Datum</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Download</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <BookMarked className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-medium text-gray-900">{item.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={tenantInstructionsApi.downloadUrl(item.id)}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 border border-gray-300 rounded-lg hover:bg-gray-50"
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
