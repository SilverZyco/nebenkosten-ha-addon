"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";
import { SidebarProvider } from "@/lib/sidebar-context";
import { getStoredUser, clearStoredUser } from "@/lib/auth";
import { authApi, kiInboxApi } from "@/lib/api";
import toast from "react-hot-toast";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [kiCount, setKiCount] = useState(0);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/mieter");
      return;
    }
    setUserName(user.name);
    setChecked(true);

    // Fetch KI inbox count
    kiInboxApi.count().then((res) => setKiCount(res.data.count)).catch(() => {});
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
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AdminSidebar
          kiInboxCount={kiCount}
          userName={userName}
          onLogout={handleLogout}
        />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
