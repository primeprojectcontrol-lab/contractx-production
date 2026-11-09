"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LegalFooter from "@/components/LegalFooter";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";

type ThemeMode = "dark" | "light";
type SignupPlan = "professional" | "enterprise";

export default function SignupPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [plan, setPlan] = useState<SignupPlan>("professional");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("contractx-theme");
    const initial: ThemeMode = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(initial);
    document.documentElement.dataset.contractxTheme = initial;
  }, []);

  function switchTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem("contractx-theme", nextTheme);
    document.documentElement.dataset.contractxTheme = nextTheme;
    window.dispatchEvent(
      new CustomEvent("contractx-theme-change", { detail: nextTheme })
    );
  }

  const dark = theme === "dark";
  const inputClass = `w-full rounded-lg border px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/40 ${
    dark
      ? "border-slate-600 bg-[#182029] text-white placeholder:text-slate-400"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
  }`;

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setMessage("");
    if (!acceptedTerms) {
      setMessage("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const origin = window.location.origin;
      const emailRedirectTo = `${origin}/auth/confirm?next=%2Flogin`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo },
      });
      if (error) throw error;

      // Plan choice is presentation-only until a verified server-side Stripe checkout
      // and entitlement workflow exists. Never grant a paid plan from client input.
      // Supabase may return a user without a session when confirmation is required.
      // If confirmation is disabled, an active session may be returned instead.
      if (data.session) {
        router.replace("/onboarding/Project");
        return;
      }
      setSuccess(true);
      setMessage("If registration is available for this address, check your inbox for a verification email. After verification, sign in to continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`min-h-screen ${dark ? "bg-[#1A2027] text-[#EEF3F7]" : "bg-[#F3F6F9] text-slate-900"}`}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <Link href="/landing" className="text-xl font-bold tracking-tight">ContractX<span className="text-[#D8A84E]">.co</span></Link>
          <div className="flex items-center gap-2">
            <Link
              href="/landing"
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition hover:opacity-80 ${dark ? "border-slate-600 text-slate-100" : "border-slate-300 text-slate-800"}`}
            >
              ← Back to Landing Page
            </Link>
            <div
              style={{
                "--cx-border": dark ? "#46515C" : "#CBD5E1",
                "--cx-panel-2": dark ? "#252C34" : "#FFFFFF",
                "--cx-muted": dark ? "#AAB4BE" : "#64748B",
                "--cx-text": dark ? "#EEF3F7" : "#111827",
              } as CSSProperties}
            >
              <ContractXThemeSwitch theme={theme} onChange={switchTheme} />
            </div>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <section className={`w-full max-w-md rounded-2xl border p-6 shadow-xl sm:p-8 ${dark ? "border-[#46515C] bg-[#252C34]" : "border-slate-200 bg-white"}`}>
            <div className="mb-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#D8A84E]">ContractX account</p>
              <h1 className="text-2xl font-bold">Create your account</h1>
              <p className={`mt-2 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>Choose a plan and register to access ContractX project controls and contract management.</p>
            </div>

            {message && <div role={success ? "status" : "alert"} className={`mb-5 rounded-lg border p-3 text-sm ${success ? (dark ? "border-emerald-700 text-emerald-200" : "border-emerald-300 text-emerald-800") : (dark ? "border-amber-700 text-amber-200" : "border-amber-300 text-amber-800")}`}>{message}</div>}

            {!success && (
              <form onSubmit={handleSignup} className="space-y-4">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Choose your plan</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(["professional", "enterprise"] as const).map((option) => (
                      <label key={option} className={`cursor-pointer rounded-lg border p-3 transition ${plan === option ? "border-[#D8A84E] ring-1 ring-[#D8A84E]" : dark ? "border-slate-600" : "border-slate-300"}`}>
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <input type="radio" name="signup-plan" value={option} checked={plan === option} onChange={() => setPlan(option)} />
                          {option === "professional" ? "Professional" : "Enterprise"}
                        </span>
                        <span className={`mt-2 block text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>
                          {option === "professional" ? "For individual professionals" : "For organizations and teams"}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className={`mt-2 text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>
                    Selected: {plan === "professional" ? "Professional" : "Enterprise"}. Stripe payment integration is coming soon.
                    Plan selection does not activate a paid subscription.
                  </p>
                </fieldset>
                <div>
                  <label htmlFor="signup-email" className="mb-1 block text-sm font-medium">Work email</label>
                  <input id="signup-email" className={inputClass} type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </div>
                <div>
                  <label htmlFor="signup-password" className="mb-1 block text-sm font-medium">Password</label>
                  <input id="signup-password" className={inputClass} type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
                </div>
                <div>
                  <label htmlFor="signup-confirm" className="mb-1 block text-sm font-medium">Confirm password</label>
                  <input id="signup-confirm" className={inputClass} type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Show passwords
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input className="mt-1" type="checkbox" required checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
                  <span>I agree to the <Link className="underline underline-offset-2" href="/terms" target="_blank">Terms of Service</Link> and <Link className="underline underline-offset-2" href="/privacy" target="_blank">Privacy Policy</Link>.</span>
                </label>
                <div className={`rounded-lg border px-3 py-3 text-xs ${dark ? "border-slate-600 bg-[#182029] text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  <span className="font-semibold">Stripe checkout</span> — Payment integration loading / coming soon.
                  Checkout will become available after secure server-side payment integration is enabled.
                </div>
                <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#D8A84E] px-4 py-3 text-sm font-bold text-[#17202A] transition hover:bg-[#E6B95E] disabled:cursor-wait disabled:opacity-60">{loading ? "Creating account…" : "Create account"}</button>
              </form>
            )}

            <p className={`mt-6 text-center text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>
              Already have an account? <Link href="/login" className="font-semibold text-[#D8A84E] hover:underline">Sign in</Link>
            </p>
          </section>
        </div>
        <LegalFooter />
      </div>
    </main>
  );
}
