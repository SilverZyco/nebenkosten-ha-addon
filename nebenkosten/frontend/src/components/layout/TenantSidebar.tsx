"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { LayoutDashboard, FileText, Receipt, BookOpen, X, ChevronLeft, ChevronRight } from "lucide-react";
import { ThemeToggleButton, LogoutButton } from "./SidebarShared";

const navItems = [
  { href: "/mieter", label: "Übersicht", icon: LayoutDashboard, exact: true },
  { href: "/mieter/abrechnungen", label: "Abrechnungen", icon: Receipt },
  { href: "/mieter/dokumente", label: "Dokumente", icon: FileText },
  { href: "/mieter/vertraege", label: "Verträge & Hausunterlagen", icon: BookOpen },
];

interface Props {
  userName?: string;
  apartmentCode?: string;
  onLogout: () => void;
}

function NavContent({ userName, apartmentCode, onLogout, collapsed, onClose }: Props & { collapsed: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className={cn(
        "border-b border-white/10 flex items-center min-h-[64px] shrink-0",
        collapsed ? "justify-center px-3" : "px-4 gap-3",
      )}>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight">Nebenkosten</div>
            <div className="text-xs opacity-60 truncate">{apartmentCode ? `Wohnung ${apartmentCode}` : "Mieter-Portal"}</div>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="p-1 text-slate-300 hover:text-white shrink-0 ml-auto">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

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
                isActive ? "bg-white text-slate-800" : "text-slate-300 hover:bg-white/10 hover:text-white",
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-white/10 p-2 shrink-0", collapsed && "flex flex-col items-center")}>
        {!collapsed && <div className="text-xs text-slate-400 mb-1 px-2 truncate">{userName}</div>}
        <ThemeToggleButton collapsed={collapsed} className="text-slate-300" />
        <LogoutButton onLogout={() => { onClose?.(); onLogout(); }} collapsed={collapsed} className="text-slate-300" />
      </div>
    </div>
  );
}

export default function TenantSidebar({ userName, apartmentCode, onLogout }: Props) {
  const { open, close, collapsed, toggleCollapsed } = useSidebar();

  return (
    <>
      {/* ── Desktop / Tablet sidebar ── */}
      <aside className={cn(
        "hidden md:flex flex-col bg-slate-800 text-white",
        "sticky top-0 h-screen shrink-0 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64",
      )}>
        <div className="absolute top-3 right-2 z-10">
          <button
            onClick={toggleCollapsed}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={collapsed ? "Ausklappen" : "Einklappen"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        <NavContent userName={userName} apartmentCode={apartmentCode} onLogout={onLogout} collapsed={collapsed} />
      </aside>

      {/* ── Mobile drawer ── */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={close} />}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-slate-800 flex flex-col text-white md:hidden",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <NavContent userName={userName} apartmentCode={apartmentCode} onLogout={onLogout} collapsed={false} onClose={close} />
      </aside>
    </>
  );
}
