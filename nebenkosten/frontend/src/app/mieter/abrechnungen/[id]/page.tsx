"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Topbar from "@/components/layout/Topbar";
import { tenantApi } from "@/lib/api";
import { formatEur, formatDate, COST_CATEGORY_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";
import { Download, ArrowLeft, TrendingUp, TrendingDown, Receipt } from "lucide-react";

interface BillingDetail {
  id: string;
  year: number;
  apartment_code: string;
  apartment_name: string;
  total_costs: string;
  advance_payments: string;
  balance: string;
  has_pdf: boolean;
  released_at: string;
  receipt_filename?: string | null;
  cost_breakdown: Record<string, { cost: string; m3_adjusted?: string; kwh_adjusted?: string }> | null;
}

export default function BillingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<BillingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tenantApi.getBilling(id)
      .then((res) => setDetail(res.data))
      .catch(() => {
        toast.error("Abrechnung nicht gefunden");
        router.push("/mieter/abrechnungen");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <>
        <Topbar title="Abrechnung" subtitle="Details werden geladen..." />
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!detail) return null;

  const balance = parseFloat(detail.balance);

  return (
    <>
      <Topbar
        title={`Abrechnung ${detail.year}`}
        subtitle={detail.apartment_name || detail.apartment_code || ""}
      />

      <div className="p-6 space-y-5 flex-1 overflow-y-auto">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>

        {/* Saldo-Karte */}
        <div className={`rounded-xl border-2 p-6 ${
          balance > 0 ? "bg-red-50 border-red-200" :
          balance < 0 ? "bg-green-50 border-green-200" :
          "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center gap-3">
            {balance > 0
              ? <TrendingUp className="w-8 h-8 text-red-500" />
              : <TrendingDown className="w-8 h-8 text-green-500" />
            }
            <div>
              <p className="text-sm text-gray-600">
                {balance > 0 ? "Nachzahlung" : balance < 0 ? "Erstattung" : "Ausgeglichen"}
              </p>
              <p className={`text-3xl font-bold ${balance > 0 ? "text-red-700" : balance < 0 ? "text-green-700" : "text-gray-700"}`}>
                {balance > 0 ? "+" : ""}{formatEur(balance)}
              </p>
            </div>
          </div>
        </div>

        {/* Kostenaufstellung */}
        {detail.cost_breakdown && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Kostenaufstellung</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Position</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Details</th>
                  <th className="text-right px-4 py-2.5 text-gray-600 font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(detail.cost_breakdown).map(([cat, data]) => {
                  const cost = parseFloat(data.cost);
                  if (cost === 0) return null;
                  let detailText = "";
                  if (cat === "water" && data.m3_adjusted) detailText = `${data.m3_adjusted} m³`;
                  else if (cat === "gas" && data.kwh_adjusted) detailText = `${data.kwh_adjusted} kWh`;
                  return (
                    <tr key={cat} className="border-t border-gray-100">
                      <td className="px-4 py-2.5">{COST_CATEGORY_LABELS[cat] || cat}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{detailText}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatEur(data.cost)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-2.5">Gesamt Nebenkosten</td>
                  <td></td>
                  <td className="px-4 py-2.5 text-right">{formatEur(detail.total_costs)}</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-500">Vorauszahlungen</td>
                  <td></td>
                  <td className="px-4 py-2.5 text-right text-gray-500">– {formatEur(detail.advance_payments)}</td>
                </tr>
                <tr className={`border-t-2 border-gray-200 font-bold text-lg ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  <td className="px-4 py-3">{balance > 0 ? "Nachzahlung" : "Erstattung"}</td>
                  <td></td>
                  <td className="px-4 py-3 text-right">
                    {balance > 0 ? "+" : ""}{formatEur(detail.balance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Downloads */}
        <div className="flex flex-wrap gap-3">
          {detail.has_pdf && (
            <a
              href={tenantApi.billingPdfUrl(detail.id)}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-900 text-white rounded-lg text-sm hover:bg-brand-800"
            >
              <Download className="w-4 h-4" />
              Abrechnung als PDF herunterladen
            </a>
          )}
          {detail.receipt_filename && (
            <a
              href={tenantApi.receiptUrl(detail.id)}
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
            >
              <Receipt className="w-4 h-4" />
              Quittung herunterladen
            </a>
          )}
        </div>
      </div>
    </>
  );
}
