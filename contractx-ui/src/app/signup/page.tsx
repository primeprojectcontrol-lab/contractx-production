"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Home,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ContractXThemeSwitch from "@/components/ContractXThemeSwitch";
import LegalFooter from "@/components/LegalFooter";

type Theme = "dark" | "light";
type SignupPlan = "professional" | "enterprise";

const plans: Array<{
  id: SignupPlan;
  label: string;
  eyebrow: string;
  detail: string;
}> = [
  {
    id: "professional",
    label: "Professional",
    eyebrow: "PROJECT ACCESS",
    detail: "Individual professionals and focused project workspaces",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    eyebrow: "ORGANISATION ACCESS",
    detail: "Multi-project organisations, teams and governance",
  },
];

export default function SignupPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [theme, setTheme] = useState<Theme>("dark");
  const [plan, setPlan] = useState<SignupPlan>("professional");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("contractx-theme");
    const initial: Theme = saved === "light" ? "light" : "dark";
    setTheme(initial);
    document.documentElement.dataset.contractxTheme = initial;
  }, []);

  const changeTheme = (next: Theme) => {
    setTheme(next);
    window.localStorage.setItem("contractx-theme", next);
    document.documentElement.dataset.contractxTheme = next;
    window.dispatchEvent(new CustomEvent("contractx-theme-change", { detail: next }));
  };

  const styleVars = {
    "--cx-border": theme === "dark" ? "rgba(255,255,255,.12)" : "rgba(23,25,28,.14)",
    "--cx-panel-2": theme === "dark" ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.72)",
    "--cx-muted": theme === "dark" ? "#9CA5B0" : "#65717A",
    "--cx-text": theme === "dark" ? "#F4F1EA" : "#17191C",
  } as CSSProperties;

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setMessage("");
    if (!acceptedTerms) {
      setMessage("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    if (password.length < 8) {
      setMessage("Your password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const emailRedirectTo = `${window.location.origin}/auth/confirm?next=%2Flogin`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo },
      });
      if (error) throw error;

      // Selection is a UI preference only. Stripe checkout and paid access must
      // be enabled via verified server-side payment and entitlement workflows.
      if (data.session) {
        router.replace("/onboarding/Project");
        return;
      }
      setComplete(true);
      setMessage("Check your inbox for your verification email, then sign in to continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to register at this time.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-cx-signup-theme={theme}
      style={styleVars}
      className={`relative isolate flex min-h-[100dvh] flex-col overflow-x-hidden selection:bg-[#D8A84E] selection:text-[#050608] ${theme === "dark" ? "bg-[#050608] text-[#F4F1EA]" : "bg-[#F3F0E9] text-[#17191C]"}`}
    >
      <style>{`
        [data-cx-signup-theme] { --signup-fg:#f4f1ea; --signup-sub:#aab3bd; --signup-panel:rgba(8,11,15,.80); --signup-field:rgba(255,255,255,.035); --signup-line:rgba(255,255,255,.105); --signup-glow:rgba(216,168,78,.11); color-scheme:dark; }
        [data-cx-signup-theme="light"] { --signup-fg:#17191c; --signup-sub:#5c6872; --signup-panel:rgba(255,255,255,.89); --signup-field:rgba(255,255,255,.91); --signup-line:rgba(23,25,28,.15); --signup-glow:rgba(169,130,62,.09); color-scheme:light; }
        .cx-signup-panel { background:var(--signup-panel); border:1px solid var(--signup-line); }
        .cx-signup-muted { color:var(--signup-sub); }
        .cx-signup-input { background:var(--signup-field); border:1px solid var(--signup-line); color:var(--signup-fg); width:100%; border-radius:12px; padding:11px 13px; font-size:13px; outline:none; transition:border-color .2s,box-shadow .2s; }
        .cx-signup-input::placeholder { color:var(--signup-sub); opacity:.75; }
        .cx-signup-input:focus { border-color:#D8A84E; box-shadow:0 0 0 3px rgba(216,168,78,.15); }
        .cx-signup-plan { border:1px solid var(--signup-line); background:var(--signup-field); transition:background .2s,border-color .2s,box-shadow .2s; }
        .cx-signup-plan[data-selected="true"] { border-color:#D8A84E; box-shadow:inset 0 0 0 1px rgba(216,168,78,.32); background:var(--signup-glow); }
        .cx-signup-check { accent-color:#D8A84E; }
        @media (prefers-reduced-motion:reduce) { .cx-signup-plan,.cx-signup-input { transition:none; } }
      `}</style>

      {/* Landing-page-inspired atmospheric background; no viewport overflow. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              theme === "dark"
                ? "radial-gradient(ellipse at 18% 40%,rgba(216,168,78,.11),transparent 37%),radial-gradient(ellipse at 85% 22%,rgba(111,143,175,.13),transparent 39%),radial-gradient(ellipse at 70% 95%,rgba(184,110,60,.06),transparent 35%)"
                : "radial-gradient(ellipse at 18% 40%,rgba(169,130,62,.13),transparent 40%),radial-gradient(ellipse at 85% 22%,rgba(85,117,147,.12),transparent 41%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[.2]"
          style={{
            backgroundImage:
              theme === "dark"
                ? "linear-gradient(rgba(185,193,201,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(185,193,201,.10) 1px,transparent 1px)"
                : "linear-gradient(rgba(23,25,28,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(23,25,28,.09) 1px,transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        <div className="absolute left-[-180px] top-[10%] size-[480px] rounded-full border border-[#D8A84E]/10" />
        <div className="absolute bottom-[-230px] right-[-130px] size-[500px] rounded-full border border-[#6F8FAF]/15" />
      </div>

      <header className="relative z-10 border-b border-[var(--signup-line)] px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <Link href="/landing" aria-label="ContractX landing page" className="flex shrink-0 items-baseline tracking-[-.05em]">
            <span className="text-[23px] font-black leading-none sm:text-[27px]">contract</span>
            <span className="text-[25px] font-black leading-none text-[#D8A84E] sm:text-[29px]">X</span>
            <span className="text-xs font-bold tracking-normal opacity-65 sm:text-sm">.co</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/landing"
              aria-label="Home — landing page"
              title="Home"
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--signup-line)] bg-[var(--signup-field)] transition hover:border-[#D8A84E]/60 hover:text-[#D8A84E]"
            >
              <Home size={16} strokeWidth={2} />
            </Link>
            <ContractXThemeSwitch theme={theme} onChange={changeTheme} />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-4 py-5 sm:px-6 lg:py-6">
        <div className="grid w-full items-center gap-5 lg:grid-cols-[.86fr_1.14fr] lg:gap-8 xl:gap-12">
          {/* Brand / product positioning */}
          <section className="hidden lg:block lg:pr-2" aria-label="ContractX platform introduction">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--signup-line)] bg-[var(--signup-field)] px-3 py-2 text-[10px] font-bold uppercase tracking-[.17em] cx-signup-muted">
              <Sparkles size={13} className="text-[#D8A84E]" /> Construction intelligence platform
            </span>
            <h1 className="mt-7 max-w-xl text-[clamp(2.6rem,4.2vw,4.8rem)] font-black leading-[1.02] tracking-[-.055em]">
              Begin your <span className="bg-gradient-to-r from-[#D8A84E] via-[#E7BC69] to-[#6F8FAF] bg-clip-text text-transparent">ContractX</span> journey.
            </h1>
            <p className="mt-5 text-lg font-semibold tracking-wide">Review. Monitor. Resolve.</p>
            <p className="cx-signup-muted mt-3 max-w-lg text-sm leading-7">
              Make sense of construction contracts, project evidence, programme performance and claims from a secure, project-aware workspace.
            </p>
            <div className="mt-8 grid max-w-lg gap-3">
              <div className="flex items-center gap-3 text-xs font-semibold"><ShieldCheck size={17} className="text-[#6F9C83]" /> Private project workspaces</div>
              <div className="flex items-center gap-3 text-xs font-semibold"><Building2 size={17} className="text-[#D8A84E]" /> Built for construction teams</div>
              <div className="flex items-center gap-3 text-xs font-semibold"><CheckCircle2 size={17} className="text-[#6F8FAF]" /> Controlled access and verification</div>
            </div>
          </section>

          {/* Compact signup panel */}
          <section className="cx-signup-panel relative mx-auto w-full max-w-[700px] overflow-hidden rounded-[22px] p-4 shadow-[0_22px_65px_rgba(0,0,0,.16)] sm:p-6 xl:p-7" aria-labelledby="signup-title">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D8A84E]/80 to-transparent" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-1.5 text-[9px] font-black uppercase tracking-[.2em] text-[#D8A84E]">Secure account registration</div>
                <h2 id="signup-title" className="text-[25px] font-black tracking-[-.04em] sm:text-[29px]">Create your account</h2>
                <p className="cx-signup-muted mt-1 text-xs leading-5">Select an access option and register with your work email.</p>
              </div>
              <LockKeyhole size={20} className="mt-1 shrink-0 text-[#D8A84E]" aria-hidden="true" />
            </div>

            {message && (
              <div
                role={complete ? "status" : "alert"}
                className={`mb-3 rounded-xl border px-3 py-2.5 text-xs leading-5 ${complete ? "border-[#6F9C83]/40 bg-[#6F9C83]/10" : "border-[#D8A84E]/40 bg-[#D8A84E]/10"}`}
              >
                {message}
              </div>
            )}

            {!complete ? (
              <form onSubmit={handleSignup} className="space-y-3">
                <fieldset>
                  <legend className="mb-2 text-[11px] font-bold">Choose your access plan</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {plans.map((item) => (
                      <label key={item.id} data-selected={plan === item.id} className="cx-signup-plan relative flex min-h-[104px] cursor-pointer flex-col rounded-xl p-3">
                        <input
                          type="radio"
                          name="plan"
                          value={item.id}
                          checked={plan === item.id}
                          onChange={() => setPlan(item.id)}
                          className="sr-only"
                        />
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-[.11em] text-[#D8A84E]">{item.eyebrow}</span>
                          {plan === item.id ? <Check size={15} className="shrink-0 text-[#D8A84E]" /> : item.id === "enterprise" ? <Users size={14} className="cx-signup-muted" /> : <Building2 size={14} className="cx-signup-muted" />}
                        </span>
                        <span className="mt-1.5 text-sm font-extrabold">{item.label}</span>
                        <span className="cx-signup-muted mt-1 text-[10px] leading-[1.5]">{item.detail}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="cx-signup-email" className="mb-1 block text-[11px] font-semibold">Work email</label>
                  <input id="cx-signup-email" type="email" autoComplete="email" required maxLength={254} className="cx-signup-input" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cx-signup-password" className="mb-1 block text-[11px] font-semibold">Password</label>
                    <div className="relative">
                      <input id="cx-signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} className="cx-signup-input pr-9" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} />
                      <button type="button" aria-label={showPassword ? "Hide passwords" : "Show passwords"} onClick={() => setShowPassword((current) => !current)} className="cx-signup-muted absolute inset-y-0 right-2 flex w-7 items-center justify-center hover:text-[#D8A84E]">
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="cx-signup-confirm" className="mb-1 block text-[11px] font-semibold">Confirm password</label>
                    <input id="cx-signup-confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} className="cx-signup-input" placeholder="Re-enter password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-0.5">
                  <input id="cx-signup-terms" type="checkbox" className="cx-signup-check mt-0.5 size-3.5 shrink-0" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
                  <label htmlFor="cx-signup-terms" className="cx-signup-muted text-[11px] leading-[1.5]">
                    I agree to the <Link className="font-semibold text-[#D8A84E] hover:underline" href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link> and <Link className="font-semibold text-[#D8A84E] hover:underline" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
                  </label>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[#D8A84E]/25 bg-[#D8A84E]/[.055] px-3 py-2 text-[10px] leading-[1.6]">
                  <span className="size-1.5 shrink-0 rounded-full bg-[#D8A84E]" />
                  <span><strong>Stripe checkout:</strong> Payment integration coming soon. Registration does not activate a paid subscription.</span>
                </div>

                <button type="submit" disabled={submitting} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#D8A84E] px-4 py-3 text-xs font-black uppercase tracking-[.12em] text-[#050608] transition hover:bg-[#E7BC69] disabled:cursor-wait disabled:opacity-60">
                  {submitting ? "Creating your account…" : "Create account"}
                  {!submitting && <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />}
                </button>
              </form>
            ) : (
              <div className="rounded-xl border border-[#6F9C83]/25 bg-[#6F9C83]/[.06] p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 text-[#6F9C83]" size={30} />
                <p className="text-sm font-bold">Verification email requested</p>
                <p className="cx-signup-muted mt-1 text-xs leading-5">After confirming your email address, continue through the existing sign-in flow.</p>
                <Link href="/login" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#D8A84E] px-4 py-2.5 text-xs font-bold text-[#050608]">Go to sign in <ArrowRight size={14} /></Link>
              </div>
            )}

            <div className="cx-signup-muted mt-3 text-center text-xs">
              Already have an account? <Link href="/login" className="font-bold text-[#D8A84E] hover:underline">Sign in</Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-[var(--signup-line)] px-4 py-2.5 sm:px-6">
        <div className="mx-auto max-w-7xl text-[10px] cx-signup-muted">
          <LegalFooter />
        </div>
      </footer>
    </div>
  );
}
