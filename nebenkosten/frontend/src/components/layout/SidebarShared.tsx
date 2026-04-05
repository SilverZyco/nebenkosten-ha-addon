"use client";

import { Sun, Moon, LogOut } from "lucide-react";
import { useTheme } from "@/lib/theme-context";

interface ThemeToggleButtonProps {
  collapsed?: boolean;
  className?: string;
}

export function ThemeToggleButton({ collapsed = false, className = "" }: ThemeToggleButtonProps) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "Helles Design" : "Dunkles Design"}
      className={cn(
        "flex items-center rounded-lg text-sm hover:text-white hover:bg-white/10 transition-colors mb-1 w-full",
        collapsed ? "justify-center p-2.5" : "gap-2 px-3 py-2.5",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
      {!collapsed && <span>{theme === "dark" ? "Helles Design" : "Dunkles Design"}</span>}
    </button>
  );
}

interface LogoutButtonProps {
  onLogout: () => void;
  collapsed?: boolean;
  className?: string;
}

export function LogoutButton({ onLogout, collapsed = false, className = "" }: LogoutButtonProps) {
  return (
    <button
      onClick={onLogout}
      title="Abmelden"
      className={cn(
        "flex items-center rounded-lg text-sm hover:text-white hover:bg-white/10 transition-colors w-full",
        collapsed ? "justify-center p-2.5" : "gap-2 px-3 py-2.5",
        className,
      )}
    >
      <LogOut className="w-5 h-5 shrink-0" />
      {!collapsed && <span>Abmelden</span>}
    </button>
  );
}

// Minimal cn helper (avoids importing from utils in shared component)
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// Keep SidebarLogo export for backward compat (no longer used but safe to keep)
export function SidebarLogo({ subtitle, closeButton }: { subtitle: string; closeButton?: React.ReactNode }) {
  return (
    <div className="p-4 border-b border-white/10 flex items-center justify-between min-h-[64px]">
      <div className="font-semibold text-sm">{subtitle}</div>
      {closeButton}
    </div>
  );
}
