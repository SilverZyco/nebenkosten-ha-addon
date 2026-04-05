"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/layout/Topbar";
import { usersApi } from "@/lib/api";
import { getStoredUser, setStoredUser } from "@/lib/auth";
import toast from "react-hot-toast";
import { User, Lock, Save } from "lucide-react";

export default function ProfilPage() {
  const storedUser = getStoredUser();

  const [profileForm, setProfileForm] = useState({
    name: storedUser?.name || "",
    email: "",
    phone: "",
  });
  const [pwForm, setPwForm] = useState({
    old_password: "",
    new_password: "",
    new_password2: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    // Load current user details from /auth/me
    import("@/lib/api").then(({ authApi }) => {
      authApi.me().then((res) => {
        setProfileForm({
          name: res.data.name || "",
          email: res.data.email || "",
          phone: res.data.phone || "",
        });
      }).catch(() => {});
    });
  }, []);

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.name.trim()) return toast.error("Name ist erforderlich");
    setSavingProfile(true);
    try {
      const res = await usersApi.updateProfile({
        name: profileForm.name,
        email: profileForm.email || undefined,
        phone: profileForm.phone || undefined,
      });
      // Update local storage
      if (storedUser) {
        setStoredUser({ ...storedUser, name: res.data.name, email: res.data.email });
      }
      toast.success("Profil gespeichert");
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Fehler beim Speichern"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwForm.old_password) return toast.error("Aktuelles Passwort eingeben");
    if (pwForm.new_password.length < 6) return toast.error("Neues Passwort min. 6 Zeichen");
    if (pwForm.new_password !== pwForm.new_password2) return toast.error("Passwörter stimmen nicht überein");
    setSavingPw(true);
    try {
      await usersApi.changePassword({
        old_password: pwForm.old_password,
        new_password: pwForm.new_password,
      });
      toast.success("Passwort geändert");
      setPwForm({ old_password: "", new_password: "", new_password2: "" });
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Fehler beim Ändern"
      );
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <Topbar
        title="Mein Profil"
        subtitle="Name, Kontaktdaten und Passwort ändern"
      />

      <div className="p-6 max-w-2xl space-y-6 flex-1 overflow-y-auto">

        {/* Profile form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <User className="w-5 h-5 text-brand-600" />
            <h3 className="font-semibold text-gray-800">Profil bearbeiten</h3>
          </div>
          <form onSubmit={submitProfile} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name *</label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ihr Name"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">E-Mail</label>
              <input
                type="text"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="admin@beispiel.de"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Telefon (optional)</label>
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="+49 151 ..."
              />
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-900 text-white rounded-lg text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
            >
              {savingProfile ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Speichern
            </button>
          </form>
        </div>

        {/* Password form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-5 h-5 text-brand-600" />
            <h3 className="font-semibold text-gray-800">Passwort ändern</h3>
          </div>
          <form onSubmit={submitPassword} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Aktuelles Passwort *</label>
              <input
                type="password"
                value={pwForm.old_password}
                onChange={(e) => setPwForm({ ...pwForm, old_password: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Neues Passwort * (min. 6 Zeichen)</label>
              <input
                type="password"
                value={pwForm.new_password}
                onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Neues Passwort wiederholen *</label>
              <input
                type="password"
                value={pwForm.new_password2}
                onChange={(e) => setPwForm({ ...pwForm, new_password2: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={savingPw}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-900 text-white rounded-lg text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
            >
              {savingPw ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Passwort ändern
            </button>
          </form>
        </div>

      </div>
    </>
  );
}
