"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import {
  LayoutDashboard, Building2, Users, FileText, Inbox,
  Gauge, Calculator, Upload, ChevronLeft, ChevronRight,
  UserCircle, X, ScrollText, Settings, TrendingUp, FolderOpen,
} from "lucide-react";
import { ThemeToggleButton, LogoutButton } from "./SidebarShared";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/wohnungen", label: "Wohnungen", icon: Building2 },
  { href: "/admin/mietverhaeltnisse", label: "Mietverhältnisse", icon: Users },
  { href: "/admin/mietvertrag", label: "Mietverträge", icon: ScrollText },
  { href: "/admin/hausunterlagen", label: "Hausunterlagen", icon: FolderOpen },
  { href: "/admin/mieterhoeung", label: "Mieterhöhungen", icon: TrendingUp },
  { href: "/admin/dokumente", label: "Dokumente", icon: FileText },
  { href: "/admin/ki-inbox", label: "KI-Inbox", icon: Inbox, badge: true },
  { href: "/admin/zaehlerstaende", label: "Zählerstände", icon: Gauge },
  { href: "/admin/abrechnungen", label: "Abrechnungen", icon: Calculator },
  { href: "/admin/import", label: "Archiv-Import", icon: Upload },
  { href: "/admin/einstellungen", label: "Einstellungen", icon: Settings },
];

interface Props {
  kiInboxCount?: number;
  userName?: string;
  onLogout: () => void;
}

function NavContent({
  kiInboxCount, userName, onLogout, collapsed, onClose,
}: Props & { collapsed: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "border-b border-white/10 flex items-center min-h-[64px] shrink-0",
        collapsed ? "justify-center px-3" : "px-4 gap-3",
      )}>
        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
          <LayoutDashboard className="w-4 h-4" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">Nebenkosten</div>
            <div className="text-xs opacity-60">Admin-Portal</div>
          </div>
        )}
        {/* Mobile close */}
        {onClose && (
          <button onClick={onClose} className="p-1 text-blue-300 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center p-3" : "gap-3 px-3 py-2.5",
                isActive ? "bg-white text-brand-900" : "text-blue-200 hover:bg-white/10 hover:text-white",
              )}
            >
              <div className="relative shrink-0">
                <item.icon className="w-5 h-5" />
                {collapsed && item.badge && kiInboxCount && kiInboxCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-400 text-amber-900 text-[9px] font-bold rounded-full flex items-center justify-center">
                    {kiInboxCount > 9 ? "9+" : kiInboxCount}
                  </span>
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && kiInboxCount && kiInboxCount > 0 && (
                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0">
                      {kiInboxCount}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-white/10 p-2 shrink-0", collapsed && "flex flex-col items-center")}>
        {!collapsed && <div className="text-xs text-blue-300 mb-1 px-2 truncate">{userName}</div>}
        <Link
          href="/admin/profil"
          onClick={onClose}
          title={collapsed ? "Mein Profil" : undefined}
          className={cn(
            "flex items-center rounded-lg text-sm transition-colors mb-1",
            collapsed ? "justify-center p-3" : "gap-2 px-3 py-2.5",
            pathname === "/admin/profil" ? "bg-white text-brand-900 font-medium" : "text-blue-200 hover:text-white hover:bg-white/10",
          )}
        >
          <UserCircle className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Mein Profil</span>}
        </Link>
        <ThemeToggleButton collapsed={collapsed} className="text-blue-200" />
        <LogoutButton onLogout={() => { onClose?.(); onLogout(); }} collapsed={collapsed} className="text-blue-200" />
      </div>
    </div>
  );
}

export default function AdminSidebar({ kiInboxCount, userName, onLogout }: Props) {
  const { open, close, collapsed, toggleCollapsed } = useSidebar();

  return (
    <>
      {/* ── Desktop / Tablet sidebar (always in document flow) ── */}
      <aside className={cn(
        "hidden md:flex flex-col bg-brand-900 text-white",
        "sticky top-0 h-screen shrink-0 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64",
      )}>
        {/* Collapse toggle button */}
        <div className="absolute top-3 right-2 z-10">
          <button
            onClick={toggleCollapsed}
            className="p-1.5 text-blue-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={collapsed ? "Ausklappen" : "Einklappen"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        <NavContent kiInboxCount={kiInboxCount} userName={userName} onLogout={onLogout} collapsed={collapsed} />
      </aside>

      {/* ── Mobile drawer (overlay, outside document flow) ── */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={close} />
      )}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-brand-900 flex flex-col text-white md:hidden",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <NavContent kiInboxCount={kiInboxCount} userName={userName} onLogout={onLogout} collapsed={false} onClose={close} />
      </aside>
    </>
  );
}
