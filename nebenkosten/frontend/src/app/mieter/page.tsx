"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import { tenantApi } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { formatEur } from "@/lib/utils";
import Link from "next/link";
import { Receipt, FileText, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Billing {
  id: string;
  year: number;
  apartment_code: string;
  total_costs: string;
  advance_payments: string;
  balance: string;
  has_pdf: boolean;
  released_at: string;
}

export default function TenantOverview() {
  const [billings, setBillings] = useState<Billing[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();

  useEffect(() => {
    Promise.allSettled([
      tenantApi.listBillings(),
      tenantApi.listDocuments(),
    ]).then(([b, d]) => {
      if (b.status === "fulfilled") setBillings(b.value.data);
      if (d.status === "fulfilled") setDocCount(d.value.data.length);
      setLoading(false);
    });
  }, []);

  const latestBilling = billings[0];
  const balance = latestBilling ? parseFloat(latestBilling.balance) : 0;

  return (
    <>
      <Topbar title="Übersicht" subtitle={`Willkommen, ${user?.name || "Mieter"}`} />

      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        {/* Latest billing card */}
        {latestBilling && (
          <div className={`rounded-xl border-2 p-6 ${
            balance > 0 ? "bg-red-50 border-red-200" :
            balance < 0 ? "bg-green-50 border-green-200" :
            "bg-gray-50 border-gray-200"
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Letzte Abrechnung ({latestBilling.year})</p>
                <div className="flex items-center gap-2 mt-1">
                  {balance > 0 ? (
                    <TrendingUp className="w-6 h-6 text-red-500" />
                  ) : balance < 0 ? (
                    <TrendingDown className="w-6 h-6 text-green-500" />
                  ) : (
                    <Minus className="w-6 h-6 text-gray-500" />
                  )}
                  <span className={`text-3xl font-bold ${
                    balance > 0 ? "text-red-700" : balance < 0 ? "text-green-700" : "text-gray-700"
                  }`}>
                    {balance > 0 ? "+" : ""}{formatEur(balance)}
                  </span>
                </div>
                <p className="text-sm mt-1 text-gray-600">
                  {balance > 0 ? "Nachzahlung" : balance < 0 ? "Erstattung" : "Ausgeglichen"}
                </p>
              </div>
              <Link
                href={`/mieter/abrechnungen`}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Details →
              </Link>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/mieter/abrechnungen" className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="bg-brand-50 p-2.5 rounded-xl">
                <Receipt className="w-5 h-5 text-brand-700" />
              </div>
              <div>
                <div className="text-2xl font-bold">{billings.length}</div>
                <div className="text-sm text-gray-500">Abrechnungen</div>
              </div>
            </div>
          </Link>
          <Link href="/mieter/dokumente" className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <FileText className="w-5 h-5 text-slate-700" />
              </div>
              <div>
                <div className="text-2xl font-bold">{docCount}</div>
                <div className="text-sm text-gray-500">Dokumente</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Billing list */}
        {billings.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Ihre Abrechnungen</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Jahr</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Kosten</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Saldo</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {billings.map((b) => {
                  const bal = parseFloat(b.balance);
                  return (
                    <tr key={b.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium">{b.year}</td>
                      <td className="px-4 py-3 text-right">{formatEur(b.total_costs)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${bal > 0 ? "text-red-600" : bal < 0 ? "text-green-600" : ""}`}>
                        {bal > 0 ? "+" : ""}{formatEur(b.balance)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/mieter/abrechnungen/${b.id}`} className="text-brand-600 text-xs font-medium hover:text-brand-800">
                          Details →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
