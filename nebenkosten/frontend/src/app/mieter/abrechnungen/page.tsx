"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { tenantApi } from "@/lib/api";
import { formatEur, formatDate, COST_CATEGORY_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";
import { Download, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Receipt } from "lucide-react";

interface Billing {
  id: string;
  year: number;
  apartment_code: string;
  total_costs: string;
  advance_payments: string;
  balance: string;
  has_pdf: boolean;
  released_at: string;
  receipt_filename?: string | null;
}

interface BillingDetail extends Billing {
  cost_breakdown: Record<string, { cost: string; m3_adjusted?: string; kwh_adjusted?: string; factor?: string }> | null;
}

export default function TenantAbrechnungen() {
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, BillingDetail>>({});

  useEffect(() => {
    tenantApi.listBillings()
      .then((res) => setBillings(res.data))
      .catch(() => toast.error("Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = async (id: string) => {
    if (details[id]) return;
    try {
      const res = await tenantApi.getBilling(id);
      setDetails((prev) => ({ ...prev, [id]: res.data }));
    } catch {
      toast.error("Fehler beim Laden der Details");
    }
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      await loadDetail(id);
    }
  };

  return (
    <>
      <Topbar title="Abrechnungen" subtitle="Ihre Nebenkostenabrechnungen" />

      <div className="p-6 space-y-4 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : billings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <p>Noch keine Abrechnungen vorhanden</p>
          </div>
        ) : (
          <div className="space-y-3">
            {billings.map((b) => {
              const balance = parseFloat(b.balance);
              const isExpanded = expanded === b.id;
              const detail = details[b.id];

              return (
                <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpand(b.id)}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      balance > 0 ? "bg-red-100" : balance < 0 ? "bg-green-100" : "bg-gray-100"
                    }`}>
                      {balance > 0 ? (
                        <TrendingUp className="w-5 h-5 text-red-600" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">
                        Nebenkostenabrechnung {b.year}
                      </div>
                      <div className="text-sm text-gray-500">
                        Nebenkosten gesamt: {formatEur(b.total_costs)} · Vorauszahlungen: {formatEur(b.advance_payments)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xl font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {balance > 0 ? "+" : ""}{formatEur(b.balance)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {balance > 0 ? "Nachzahlung" : balance < 0 ? "Erstattung" : "Ausgeglichen"}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-5 bg-gray-50/50 space-y-4">
                      {/* Cost breakdown */}
                      {detail?.cost_breakdown && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Kostenaufstellung</h4>
                          <table className="w-full text-sm bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                                if (cat === "water" && data.m3_adjusted) {
                                  detailText = `${data.m3_adjusted} m³`;
                                } else if (cat === "gas" && data.kwh_adjusted) {
                                  detailText = `${data.kwh_adjusted} kWh`;
                                }
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
                                <td className="px-4 py-2.5 text-right">{formatEur(b.total_costs)}</td>
                              </tr>
                              <tr className="border-t border-gray-100">
                                <td className="px-4 py-2.5 text-gray-500">Vorauszahlungen</td>
                                <td></td>
                                <td className="px-4 py-2.5 text-right text-gray-500">– {formatEur(b.advance_payments)}</td>
                              </tr>
                              <tr className={`border-t-2 border-gray-200 font-bold text-lg ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
                                <td className="px-4 py-3">{balance > 0 ? "Nachzahlung" : "Erstattung"}</td>
                                <td></td>
                                <td className="px-4 py-3 text-right">
                                  {balance > 0 ? "+" : ""}{formatEur(b.balance)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* PDF Download */}
                      <div className="flex flex-wrap gap-2">
                        {b.has_pdf && (
                          <a
                            href={tenantApi.billingPdfUrl(b.id)}
                            target="_blank"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-lg text-sm hover:bg-brand-800"
                          >
                            <Download className="w-4 h-4" />
                            Abrechnung als PDF herunterladen
                          </a>
                        )}
                        {b.receipt_filename && (
                          <a
                            href={tenantApi.receiptUrl(b.id)}
                            target="_blank"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                          >
                            <Receipt className="w-4 h-4" />
                            Quittung herunterladen
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
