"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SidebarContextType {
  open: boolean;           // mobile drawer
  toggle: () => void;
  close: () => void;
  collapsed: boolean;      // desktop/tablet collapsed
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  open: false,
  toggle: () => {},
  close: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", String(!c));
      return !c;
    });
  }

  return (
    <SidebarContext.Provider value={{
      open,
      toggle: () => setOpen((o) => !o),
      close: () => setOpen(false),
      collapsed,
      toggleCollapsed,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
