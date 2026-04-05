"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TenantSidebar from "@/components/layout/TenantSidebar";
import { SidebarProvider } from "@/lib/sidebar-context";
import { getStoredUser, clearStoredUser } from "@/lib/auth";
import { authApi } from "@/lib/api";
import toast from "react-hot-toast";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.role === "admin") {
      router.replace("/admin");
      return;
    }
    setUserName(user.name);
    setChecked(true);
  }, [router]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {}
    clearStoredUser();
    router.replace("/");
    toast.success("Abgemeldet");
  };

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <TenantSidebar userName={userName} onLogout={handleLogout} />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
