"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("contractx-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  const switchTheme = (nextTheme: "dark" | "light") => {
    setTheme(nextTheme);
    window.localStorage.setItem("contractx-theme", nextTheme);
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setRecoveryReady(true);
    });
    supabase.auth.getSession().then(({ data: sessionData }) => { if (sessionData.session) setRecoveryReady(true); });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password.length < 12) return setError("Use a password of at least 12 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    if (!recoveryReady) return setError("This recovery session is not valid or has expired. Request a new reset link.");
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setLoading(false); return; }
    await supabase.auth.signOut();
    router.replace("/login?password=updated");
  };

  return (
    <div
      className={`min-h-screen bg-[#050608] text-[#F5F3EE] ${
        theme === "light" ? "cx-auth-light" : ""
      }`}
    >
      <style>{`
        .cx-auth-light {
          color-scheme: light;
          background: #f3f0e9 !important;
          color: #17191c !important;
        }

        .cx-auth-light [class*="bg-[#050608]"] {
          background-color: #f3f0e9 !important;
        }

        .cx-auth-light [class*="bg-[#0D0F12]"] {
          background-color: rgba(255,255,255,0.92) !important;
        }

        .cx-auth-light [class*="border-white"] {
          border-color: rgba(23,25,28,0.11) !important;
        }

        .cx-auth-light [class*="text-[#F5F3EE]"],
        .cx-auth-light h1 {
          color: #17191c !important;
        }

        .cx-auth-light [class*="text-[#919AA4]"],
        .cx-auth-light [class*="text-[#89939E]"],
        .cx-auth-light [class*="text-[#8F98A2]"],
        .cx-auth-light [class*="text-[#7D8792]"],
        .cx-auth-light [class*="text-[#B9C4CF]"],
        .cx-auth-light [class*="text-[#B8C1CA]"] {
          color: rgba(23,25,28,0.60) !important;
        }

        .cx-auth-light .cx-auth-header {
          background: rgba(243,240,233,0.90) !important;
          border-color: rgba(23,25,28,0.10) !important;
        }

        .cx-auth-light .cx-auth-card {
          background: rgba(255,255,255,0.92) !important;
          border-color: rgba(23,25,28,0.11) !important;
          box-shadow: 0 28px 70px rgba(43,38,28,0.12) !important;
        }

        .cx-auth-light .cx-auth-field {
          background: #ffffff !important;
          border-color: rgba(23,25,28,0.12) !important;
        }

        .cx-auth-light input {
          color: #17191c !important;
        }

        .cx-auth-light input::placeholder {
          color: rgba(23,25,28,0.32) !important;
        }

        .cx-auth-light .cx-theme-toggle {
          background: rgba(255,255,255,0.78) !important;
          border-color: rgba(23,25,28,0.10) !important;
        }
      `}</style>

      <header className="cx-auth-header border-b-2 border-white/[0.14] bg-[#050608]/90 backdrop-blur-2xl"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5"><a href="/" className="inline-flex items-baseline"><span className="text-[1.7rem] font-black tracking-[-0.045em]">contract</span><span className="mx-[1px] text-[1.7rem] font-black tracking-[-0.07em] text-[#D2B06F]">X</span><span className="text-[15px] font-bold text-[#919AA4]">.co</span></a>
          <div className="cx-theme-toggle flex items-center rounded-full border border-white/[0.09] bg-white/[0.025] p-1">
            <button
              type="button"
              onClick={() => switchTheme("dark")}
              className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.10em] ${
                theme === "dark"
                  ? "bg-[#D2B06F] text-[#050608]"
                  : "text-[#8F98A2]"
              }`}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => switchTheme("light")}
              className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.10em] ${
                theme === "light"
                  ? "bg-[#D2B06F] text-[#050608]"
                  : "text-[#8F98A2]"
              }`}
            >
              Light
            </button>
          </div></div></header>
      <main className="mx-auto flex min-h-[calc(100vh-100px)] max-w-7xl items-center justify-center px-5 py-12">
        <section className="cx-auth-card w-full max-w-xl rounded-[30px] border-2 border-white/[0.16] bg-[#0D0F12]/95 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.42)] md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D2B06F]/20 bg-[#D2B06F]/[0.06] px-3 py-2"><ShieldCheck className="h-3.5 w-3.5 text-[#D2B06F]"/><span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#E3C98F]">Secure Reset</span></div>
          <h1 className="mt-6 text-[2.2rem] font-black tracking-[-0.045em]">Choose a new password</h1>
          <p className="mt-3 text-[13px] leading-6 text-[#89939E]">Use a strong unique password for your ContractX account.</p>
          <form onSubmit={handleUpdate} className="mt-8 space-y-5">
            <div><label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[#8F98A2]">New Password</label><div className="cx-auth-field flex items-center gap-3 rounded-2xl border-2 border-white/[0.12] bg-white/[0.025] px-4 py-3.5"><LockKeyhole className="h-4 w-4 text-[#6F8FAF]"/><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full bg-transparent text-[14px] outline-none" required/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? "Hide password" : "Show password"} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.035] text-[#B8C1CA] hover:text-[#E3C98F]">{showPassword ? <EyeOff className="h-[18px] w-[18px]"/> : <Eye className="h-[18px] w-[18px]"/>}</button></div></div>
            <div><label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[#8F98A2]">Confirm Password</label><div className="cx-auth-field flex items-center gap-3 rounded-2xl border-2 border-white/[0.12] bg-white/[0.025] px-4 py-3.5"><LockKeyhole className="h-4 w-4 text-[#6F8FAF]"/><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} className="w-full bg-transparent text-[14px] outline-none" required/></div></div>
            {error && <div className="rounded-2xl border-2 border-[#B85C5C]/25 bg-[#B85C5C]/[0.06] px-4 py-3 text-[12px] text-[#DE8585]">{error}</div>}
            <button type="submit" disabled={loading || !password || !confirmPassword} className="inline-flex w-full items-center justify-center rounded-full bg-[#D2B06F] px-6 py-3.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#050608] hover:bg-[#E3C98F] disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Updating…" : "Update Password"}</button>
          </form>
        </section>
      </main>
    </div>
  );
}
