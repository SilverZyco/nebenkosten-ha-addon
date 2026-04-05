"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/lib/sidebar-context";

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function Topbar({ title, subtitle, actions }: TopbarProps) {
  const { toggle, collapsed, toggleCollapsed } = useSidebar();

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile: hamburger opens drawer */}
        <button
          onClick={toggle}
          className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Menü öffnen"
        >
          <Menu className="w-5 h-5" />
        </button>
        {/* Desktop: hamburger toggles collapsed state when sidebar is collapsed */}
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className="hidden md:flex p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Sidebar ausklappen"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
      </div>
    </header>
  );
}
