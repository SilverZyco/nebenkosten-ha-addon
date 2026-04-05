"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Topbar from "@/components/layout/Topbar";
import { billingApi, kiInboxApi, documentsApi } from "@/lib/api";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  FileText,
  Calculator,
  Inbox,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ClipboardCheck,
  TrendingUp,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PreflightCheck {
  key: string;
  label: string;
  status: "ok" | "warning" | "error" | "info";
  detail: string;
  link: string;
}

interface PreflightResult {
  year: number;
  checks: PreflightCheck[];
  can_calculate: boolean;
  error_count: number;
  warning_count: number;
}

interface BillingPeriod {
  id: string;
  year: number;
  status: "draft" | "calculated" | "finalized" | "sent";
  generated_at: string | null;
  finalized_at: string | null;
  notes: string | null;
  created_at: string;
}

interface DashboardData {
  kiCount: number;
  billingPeriods: BillingPeriod[];
  billingYears: number[];
  docCount: number;
  preflight: PreflightResult | null;
  loading: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const BILLING_STATUS_LABELS: Record<string, string> = {
  draft:      "Entwurf",
  calculated: "Berechnet",
  finalized:  "Abgeschlossen",
  sent:       "Versendet",
};

const BILLING_STATUS_VARIANTS: Record<string, "gray" | "yellow" | "green" | "blue"> = {
  draft:      "gray",
  calculated: "yellow",
  finalized:  "green",
  sent:       "blue",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "–";
  const parts = String(dateStr).split("T")[0].split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

// ─── Step Status icon ────────────────────────────────────────────────────────

type StepStatus = "ok" | "warning" | "error" | "pending";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "ok") return <CheckCircle className="w-5 h-5 text-emerald-500" />;
  if (status === "warning") return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  if (status === "error") return <XCircle className="w-5 h-5 text-red-500" />;
  return <Info className="w-5 h-5 text-gray-400 dark:text-gray-500" />;
}

function StepStatusBadge({ status, label }: { status: StepStatus; label: string }) {
  if (status === "ok")      return <Badge variant="green">{label}</Badge>;
  if (status === "warning") return <Badge variant="yellow">{label}</Badge>;
  if (status === "error")   return <Badge variant="red">{label}</Badge>;
  return <Badge variant="gray">{label}</Badge>;
}

// ─── Individual workflow step ─────────────────────────────────────────────

interface WorkflowStepProps {
  number: number;
  title: string;
  description: string;
  status: StepStatus;
  statusLabel: string;
  details: string[];
  link: string;
  linkLabel: string;
  isLast?: boolean;
}

function WorkflowStep({
  number,
  title,
  description,
  status,
  statusLabel,
  details,
  link,
  linkLabel,
  isLast,
}: WorkflowStepProps) {
  const borderColors: Record<StepStatus, string> = {
    ok:      "border-emerald-200 dark:border-emerald-800",
    warning: "border-amber-200 dark:border-amber-800",
    error:   "border-red-200 dark:border-red-800",
    pending: "border-gray-200 dark:border-gray-700",
  };
  const bgColors: Record<StepStatus, string> = {
    ok:      "bg-emerald-50 dark:bg-emerald-900/20",
    warning: "bg-amber-50 dark:bg-amber-900/20",
    error:   "bg-red-50 dark:bg-red-900/20",
    pending: "bg-gray-50 dark:bg-gray-800",
  };
  const numColors: Record<StepStatus, string> = {
    ok:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    error:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    pending: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  };

  return (
    <div className="flex items-stretch gap-0">
      <div
        className={`flex-1 rounded-xl border p-5 ${borderColors[status]} ${bgColors[status]}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold shrink-0 ${numColors[status]}`}
            >
              {number}
            </span>
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</div>
            </div>
          </div>
          <StepIcon status={status} />
        </div>

        {/* Status badge */}
        <div className="mb-3">
          <StepStatusBadge status={status} label={statusLabel} />
        </div>

        {/* Detail lines */}
        {details.length > 0 && (
          <ul className="space-y-1 mb-3">
            {details.map((d, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0 text-gray-400">·</span>
                {d}
              </li>
            ))}
          </ul>
        )}

        {/* Link */}
        <Link
          href={link}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
        >
          {linkLabel}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Arrow connector (not after last step) */}
      {!isLast && (
        <div className="hidden lg:flex items-center px-2 text-gray-300 dark:text-gray-600 shrink-0">
          <ArrowRight className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const currentYear = new Date().getFullYear();

  const [data, setData] = useState<DashboardData>({
    kiCount: 0,
    billingPeriods: [],
    billingYears: [],
    docCount: 0,
    preflight: null,
    loading: true,
  });

  const loadData = useCallback(async () => {
    setData((d) => ({ ...d, loading: true }));

    const [ki, years, periods, docs, preflight] = await Promise.allSettled([
      kiInboxApi.count(),
      billingApi.years(),
      billingApi.list(),
      documentsApi.list({ year: currentYear }),
      billingApi.preflight(currentYear),
    ]);

    setData({
      kiCount:        ki.status === "fulfilled"       ? (ki.value.data.count ?? 0)                     : 0,
      billingYears:   years.status === "fulfilled"    ? (years.value.data.years ?? [])                 : [],
      billingPeriods: periods.status === "fulfilled"  ? (periods.value.data ?? [])                     : [],
      docCount:       docs.status === "fulfilled"     ? (docs.value.data.length ?? 0)                  : 0,
      preflight:      preflight.status === "fulfilled" ? (preflight.value.data as PreflightResult)     : null,
      loading:        false,
    });
  }, [currentYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derive workflow step states from preflight ────────────────────────────

  const checks = data.preflight?.checks ?? [];

  function getChecksByKeys(keys: string[]): PreflightCheck[] {
    return checks.filter((c) => keys.includes(c.key));
  }

  function worstStatus(items: PreflightCheck[]): StepStatus {
    if (items.some((c) => c.status === "error"))   return "error";
    if (items.some((c) => c.status === "warning")) return "warning";
    if (items.some((c) => c.status === "ok"))      return "ok";
    return "pending";
  }

  function statusLabel(s: StepStatus, items: PreflightCheck[]): string {
    if (s === "ok")      return "Vollständig";
    const errors   = items.filter((c) => c.status === "error").length;
    const warnings = items.filter((c) => c.status === "warning").length;
    if (s === "error")   return `${errors} Fehler`;
    if (s === "warning") return `${warnings} Hinweis${warnings !== 1 ? "e" : ""}`;
    return "Ausstehend";
  }

  // Step 1: Zählerstände
  const meterKeys = ["water_main", "water_apt_meters", "gas_meters", "gas_du_meter", "gas_main"];
  const meterChecks = getChecksByKeys(meterKeys);
  const meterStatus = data.preflight ? worstStatus(meterChecks) : "pending";
  const meterProblems = meterChecks
    .filter((c) => c.status === "error" || c.status === "warning")
    .map((c) => c.detail);

  // Step 2: Belege hochladen
  const docKeys = [
    "property_tax_notice", "insurance_invoice", "rainwater_fee_invoice",
    "electricity_common_invoice", "water_invoice", "gas_invoice", "evs_invoice",
  ];
  const docChecks = getChecksByKeys(docKeys);
  const docStatus = data.preflight ? worstStatus(docChecks) : "pending";
  const docProblems = docChecks
    .filter((c) => c.status === "error" || c.status === "warning")
    .map((c) => c.detail);

  // Step 3: KI-Prüfung
  const kiStatus: StepStatus = !data.preflight
    ? "pending"
    : data.kiCount > 0
    ? "warning"
    : "ok";

  // Step 4: Abrechnung
  const currentPeriod = data.billingPeriods.find((p) => p.year === currentYear);
  const billingStatus: StepStatus = !data.preflight
    ? "pending"
    : currentPeriod
    ? "ok"
    : data.preflight.can_calculate
    ? "warning"
    : "pending";

  // Quick stats
  const hasAnyError = data.preflight && data.preflight.error_count > 0;
  const hasKiWarning = data.kiCount > 0;

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle={`Überblick · ${currentYear}`}
        actions={
          <button
            onClick={loadData}
            disabled={data.loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${data.loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </button>
        }
      />

      <div className="p-4 md:p-6 space-y-6 overflow-y-auto flex-1">

        {/* ── Alert Banner ─────────────────────────────────────────────────── */}
        {(hasAnyError || hasKiWarning) && (
          <div className="space-y-2">
            {hasAnyError && (
              <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-red-800 dark:text-red-300">
                    {data.preflight!.error_count} Pflichtfeld{data.preflight!.error_count !== 1 ? "er" : ""} fehlen für die Abrechnung {currentYear}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                    Bitte prüfe den Jahres-Workflow unten und ergänze die fehlenden Daten.
                  </p>
                </div>
                <Link
                  href="/admin/dokumente"
                  className="shrink-0 text-xs font-medium text-red-700 dark:text-red-300 underline hover:no-underline"
                >
                  Dokumente →
                </Link>
              </div>
            )}
            {hasKiWarning && (
              <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                    KI-Inbox: {data.kiCount} Dokument{data.kiCount !== 1 ? "e" : ""} warten auf Prüfung
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                    Die KI hat Daten extrahiert und wartet auf Ihre Bestätigung.
                  </p>
                </div>
                <Link
                  href="/admin/ki-inbox"
                  className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300 underline hover:no-underline"
                >
                  Jetzt prüfen →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Schnell-Status (4 Cards) ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            label="Dokumente dieses Jahr"
            value={data.loading ? "…" : String(data.docCount)}
            icon={FileText}
            variant="blue"
            href="/admin/dokumente"
          />
          <StatCard
            label="KI-Inbox offen"
            value={data.loading ? "…" : String(data.kiCount)}
            icon={Inbox}
            variant={data.kiCount > 0 ? "amber" : "green"}
            href="/admin/ki-inbox"
            badge={data.kiCount > 0 ? data.kiCount : undefined}
          />
          <StatCard
            label="Abrechnungsjahre"
            value={data.loading ? "…" : String(data.billingYears.length)}
            icon={Calculator}
            variant="purple"
            href="/admin/abrechnungen"
          />
          <StatCard
            label="Abrechnung Status"
            value={String(currentYear)}
            icon={TrendingUp}
            variant="slate"
            href={`/admin/abrechnungen?year=${currentYear}`}
            subLabel={currentPeriod ? BILLING_STATUS_LABELS[currentPeriod.status] : "Noch nicht erstellt"}
          />
        </div>

        {/* ── Jahres-Workflow ───────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Jahres-Workflow {currentYear}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Schritt-für-Schritt Anleitung für die Nebenkostenabrechnung
              </p>
            </div>
            {data.preflight && (
              <div className="hidden sm:flex items-center gap-3 text-sm">
                {data.preflight.error_count > 0 && (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <XCircle className="w-4 h-4" />
                    {data.preflight.error_count} Fehler
                  </span>
                )}
                {data.preflight.warning_count > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {data.preflight.warning_count} Hinweise
                  </span>
                )}
                {data.preflight.can_calculate && data.preflight.error_count === 0 && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Bereit zur Berechnung
                  </span>
                )}
              </div>
            )}
          </div>

          {data.loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 lg:gap-0">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-5 animate-pulse"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                  </div>
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 lg:gap-0">
              <WorkflowStep
                number={1}
                title="Zählerstände"
                description="Jahresanfang &amp; Jahresende erfassen"
                status={meterStatus}
                statusLabel={statusLabel(meterStatus, meterChecks)}
                details={meterProblems.slice(0, 3)}
                link="/admin/zaehlerstaende"
                linkLabel="Zählerstände öffnen"
              />
              <WorkflowStep
                number={2}
                title="Belege hochladen"
                description="Alle Jahresrechnungen erfassen"
                status={docStatus}
                statusLabel={statusLabel(docStatus, docChecks)}
                details={docProblems.slice(0, 3)}
                link="/admin/dokumente"
                linkLabel="Dokumente öffnen"
              />
              <WorkflowStep
                number={3}
                title="KI-Prüfung"
                description="Extrahierte Daten bestätigen"
                status={kiStatus}
                statusLabel={
                  kiStatus === "ok"
                    ? "Alles geprüft"
                    : `${data.kiCount} ausstehend`
                }
                details={
                  data.kiCount > 0
                    ? [`${data.kiCount} Dokument${data.kiCount !== 1 ? "e" : ""} warten auf Bestätigung`]
                    : []
                }
                link="/admin/ki-inbox"
                linkLabel="KI-Inbox öffnen"
              />
              <WorkflowStep
                number={4}
                title="Abrechnung"
                description="Jahresabrechnung berechnen"
                status={billingStatus}
                statusLabel={
                  currentPeriod
                    ? BILLING_STATUS_LABELS[currentPeriod.status]
                    : data.preflight?.can_calculate
                    ? "Bereit"
                    : "Daten fehlen"
                }
                details={
                  currentPeriod
                    ? [`Erstellt am ${formatDate(currentPeriod.generated_at ?? currentPeriod.created_at)}`]
                    : data.preflight && !data.preflight.can_calculate
                    ? [`${data.preflight.error_count} Pflichtfeld${data.preflight.error_count !== 1 ? "er" : ""} fehlen`]
                    : []
                }
                link="/admin/abrechnungen"
                linkLabel="Abrechnungen öffnen"
                isLast
              />
            </div>
          )}
        </div>

        {/* ── Preflight Detail (Aufklappbar) ────────────────────────────────── */}
        {data.preflight && (
          <PreflightDetail preflight={data.preflight} />
        )}

        {/* ── Verlauf ───────────────────────────────────────────────────────── */}
        {data.billingPeriods.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Abrechnungsverlauf
              </h2>
              <Link
                href="/admin/abrechnungen"
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
              >
                Alle anzeigen
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Jahr
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                        Erstellt am
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Aktion
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.billingPeriods.map((period) => (
                      <tr
                        key={period.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                          {period.year}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={BILLING_STATUS_VARIANTS[period.status] ?? "gray"}>
                            {BILLING_STATUS_LABELS[period.status] ?? period.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                          {formatDate(period.generated_at ?? period.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/abrechnungen?year=${period.year}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Öffnen
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Empty state when no billing years yet */}
        {!data.loading && data.billingPeriods.length === 0 && (
          <Card className="p-8 text-center">
            <ClipboardCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
              Noch keine Abrechnung erstellt
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Schließe den Jahres-Workflow ab, um die erste Nebenkostenabrechnung zu erstellen.
            </p>
            <Link
              href="/admin/abrechnungen"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              <Calculator className="w-4 h-4" />
              Zur Abrechnung
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  variant: "blue" | "amber" | "green" | "purple" | "slate";
  href: string;
  badge?: number;
  subLabel?: string;
}

const STAT_ICON_COLORS: Record<string, string> = {
  blue:   "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  amber:  "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  green:  "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  slate:  "bg-slate-50 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

function StatCard({ label, value, icon: Icon, variant, href, badge, subLabel }: StatCardProps) {
  return (
    <Link href={href}>
      <Card hoverable className="p-4 md:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`inline-flex p-2 rounded-lg ${STAT_ICON_COLORS[variant]}`}>
            <Icon className="w-4 h-4 md:w-5 md:h-5" />
          </div>
          {badge !== undefined && badge > 0 && (
            <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {badge}
            </span>
          )}
        </div>
        <div className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {value}
        </div>
        <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
        {subLabel && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-medium">{subLabel}</div>
        )}
      </Card>
    </Link>
  );
}

// ─── PreflightDetail ──────────────────────────────────────────────────────────

function PreflightDetail({ preflight }: { preflight: PreflightResult }) {
  const [open, setOpen] = useState(false);

  const errors   = preflight.checks.filter((c) => c.status === "error");
  const warnings = preflight.checks.filter((c) => c.status === "warning");
  const infos    = preflight.checks.filter((c) => c.status === "info");
  const oks      = preflight.checks.filter((c) => c.status === "ok");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-600 dark:text-gray-400"
      >
        <span className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          <span className="font-medium text-gray-700 dark:text-gray-300">Preflight-Details</span>
          <span className="text-xs">
            ({errors.length} Fehler · {warnings.length} Hinweise · {oks.length} OK)
          </span>
        </span>
        <ArrowRight className="w-4 h-4" />
      </button>
    );
  }

  const statusConfig = {
    error:   { label: "Fehler",   icon: XCircle,       color: "text-red-600 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900" },
    warning: { label: "Hinweise", icon: AlertTriangle,  color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900" },
    info:    { label: "Info",     icon: Info,            color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900" },
    ok:      { label: "OK",       icon: CheckCircle,    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900" },
  } as const;

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            Preflight-Details · {preflight.year}
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium"
        >
          Einklappen
        </button>
      </div>

      <div className="p-5 space-y-4">
        {(["error", "warning", "info", "ok"] as const).map((s) => {
          const items = preflight.checks.filter((c) => c.status === s);
          if (items.length === 0) return null;
          const cfg = statusConfig[s];
          const Icon = cfg.icon;
          return (
            <div key={s}>
              <div className={`flex items-center gap-2 mb-2 text-sm font-semibold ${cfg.color}`}>
                <Icon className="w-4 h-4" />
                {cfg.label} ({items.length})
              </div>
              <div className="space-y-1.5">
                {items.map((check) => (
                  <div
                    key={check.key}
                    className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${cfg.bg}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 dark:text-gray-200 text-xs mb-0.5">
                        {check.label}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400 text-xs">{check.detail}</div>
                    </div>
                    {check.link && (
                      <Link
                        href={check.link}
                        className="shrink-0 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
