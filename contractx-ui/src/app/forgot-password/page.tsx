"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
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

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true); setError(""); setMessage("");

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setMessage("If an account exists for this email, a secure password reset link has been sent.");
    setLoading(false);
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

      <header className="cx-auth-header border-b-2 border-white/[0.14] bg-[#050608]/90 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <a href="/" className="inline-flex items-baseline"><span className="text-[1.7rem] font-black tracking-[-0.045em]">contract</span><span className="mx-[1px] text-[1.7rem] font-black tracking-[-0.07em] text-[#D2B06F]">X</span><span className="text-[15px] font-bold text-[#919AA4]">.co</span></a>
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
          </div>
          <div className="hidden text-[10px] font-black uppercase tracking-[0.16em] text-[#7D8792] md:block">AI Contract & Claims Xpert for Construction</div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-7xl items-center justify-center px-5 py-12">
        <section className="cx-auth-card w-full max-w-xl rounded-[30px] border-2 border-white/[0.16] bg-[#0D0F12]/95 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D2B06F]/20 bg-[#D2B06F]/[0.06] px-3 py-2"><ShieldCheck className="h-3.5 w-3.5 text-[#D2B06F]"/><span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#E3C98F]">Password Recovery</span></div>
          <h1 className="mt-6 text-[2.2rem] font-black tracking-[-0.045em]">Reset your password</h1>
          <p className="mt-3 text-[13px] leading-6 text-[#89939E]">Enter your ContractX work email. We will send a secure Supabase recovery link to that address.</p>

          <form onSubmit={handleReset} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[#8F98A2]">Work Email</label>
              <div className="cx-auth-field flex items-center gap-3 rounded-2xl border-2 border-white/[0.12] bg-white/[0.025] px-4 py-3.5 focus-within:border-white/[0.2]"><Mail className="h-4 w-4 text-[#6F8FAF]"/><input type="email" autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="name@company.com" className="w-full bg-transparent text-[14px] outline-none placeholder:text-white/20" required/></div>
            </div>
            {error && <div className="rounded-2xl border-2 border-[#B85C5C]/25 bg-[#B85C5C]/[0.06] px-4 py-3 text-[12px] text-[#DE8585]">{error}</div>}
            {message && <div className="rounded-2xl border-2 border-[#7BA883]/25 bg-[#7BA883]/[0.06] px-4 py-3 text-[12px] leading-5 text-[#A7D0AE]">{message}</div>}
            <button type="submit" disabled={loading || !email.trim()} className="inline-flex w-full items-center justify-center rounded-full bg-[#D2B06F] px-6 py-3.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#050608] hover:bg-[#E3C98F] disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Sending…" : "Send Reset Link"}</button>
          </form>

          <a href="/login" className="mt-6 inline-flex items-center gap-2 text-[11px] font-bold text-[#B9C4CF] hover:text-[#E3C98F]"><ArrowLeft className="h-4 w-4"/>Back to Sign In</a>
        </section>
      </main>
    </div>
  );
}
