"use client";



import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import Link from "next/link";



import { createClient } from "@/lib/supabase/client";

import LegalFooter from "@/components/LegalFooter";
import { House } from "lucide-react";



type ThemeMode = "dark" | "light";



export default function LoginPage() {

  const router = useRouter();

  const supabase = createClient();



  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");



  const [showPassword, setShowPassword] = useState(false);

  const [acceptedTerms, setAcceptedTerms] = useState(false);



  const [loading, setLoading] = useState(false);

  const [googleLoading, setGoogleLoading] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);



  const [message, setMessage] = useState("");



  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      setMessage(authError);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);



  useEffect(() => {

    const saved = localStorage.getItem("contractx-theme");

    if (saved === "light" || saved === "dark") {

      setTheme(saved);

    }

  }, []);



  function switchTheme(nextTheme: ThemeMode) {

    setTheme(nextTheme);

    localStorage.setItem("contractx-theme", nextTheme);

  }



  useEffect(() => {

    async function checkSession() {

      const {

        data: { user },

      } = await supabase.auth.getUser();



      if (user) {

        await routeAuthenticatedUser(user.id);

        return;

      }



      setCheckingSession(false);

    }



    checkSession();

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []);



  async function routeAuthenticatedUser(userId: string) {

    const { data: memberships, error } = await supabase

      .from("project_users")

      .select("project_id")

      .eq("user_id", userId)

      .eq("status", "ACTIVE");



    if (error) {

      console.error("Project membership lookup failed:", error);

      router.replace("/portfolio");

      return;

    }



    const projectIds = Array.from(

      new Set((memberships ?? []).map((item) => item.project_id))

    );



    if (projectIds.length === 0) {

      router.replace("/onboarding/Project");

      return;

    }



    if (projectIds.length === 1) {

      router.replace(`/dashboard?project=${projectIds[0]}`);

      return;

    }



    router.replace("/portfolio");

  }



  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {

    event.preventDefault();



    setMessage("");



    if (!acceptedTerms) {

      setMessage(

        "Please confirm that you accept the Terms of Service and Privacy Policy."

      );

      return;

    }



    if (!email.trim() || !password) {

      setMessage("Enter your email address and password.");

      return;

    }



    setLoading(true);



    const { data, error } = await supabase.auth.signInWithPassword({

      email: email.trim(),

      password,

    });



    if (error) {

      setMessage("Unable to sign in. Check your email and password.");

      setLoading(false);

      return;

    }



    if (!data.user) {

      setMessage("Unable to verify the account.");

      setLoading(false);

      return;

    }



    await routeAuthenticatedUser(data.user.id);

  }



  async function handleGoogleLogin() {
    setMessage("");

    if (!acceptedTerms) {
      setMessage("Please accept the Terms of Service and Privacy Policy first.");
      return;
    }

    setGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage(error.message || "Unable to start Google sign-in.");
        setGoogleLoading(false);
      }
      // On success Supabase redirects the browser to Google.
    } catch {
      setMessage("Unable to connect to Google sign-in. Please try again.");
      setGoogleLoading(false);
    }
  }

  const isDark = theme === "dark";



  if (checkingSession) {

    return (

      <main

        className={`min-h-screen flex items-center justify-center ${

          isDark

            ? "bg-[#050608] text-[#F4F1EA]"

            : "bg-[#F3F0E9] text-[#17191C]"

        }`}

      >

        <div

          className={`text-[11px] uppercase tracking-[0.18em] ${

            isDark ? "text-white/35" : "text-black/40"

          }`}

        >

          Verifying secure session...

        </div>

      </main>

    );

  }



  return (

    <div

      className={`min-h-screen ${

        isDark

          ? "bg-[#050608] text-[#F4F1EA]"

          : "bg-[#F3F0E9] text-[#17191C]"

      }`}

    >

      <main className="relative isolate min-h-[calc(100vh-220px)] overflow-hidden">

        {/* Original premium background */}

        <div className="pointer-events-none absolute inset-0">

          <div

            className={`absolute left-[8%] top-[18%] h-[460px] w-[460px] rounded-full blur-[120px] ${

              isDark

                ? "bg-[#D2B06F]/[0.045]"

                : "bg-[#A9823E]/[0.10]"

            }`}

          />



          <div

            className={`absolute right-[8%] top-[22%] h-[430px] w-[430px] rounded-full blur-[130px] ${

              isDark

                ? "bg-[#6F8FAF]/[0.05]"

                : "bg-[#557593]/[0.08]"

            }`}

          />



          <div

            className={`absolute inset-0 ${

              isDark ? "opacity-[0.035]" : "opacity-[0.08]"

            }`}

            style={{

              backgroundImage: isDark

                ? "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)"

                : "linear-gradient(rgba(23,25,28,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,28,.10) 1px, transparent 1px)",

              backgroundSize: "64px 64px",

            }}

          />

        </div>



        {/* Home navigation and appearance — aligned with the signup page. */}
        <div className="absolute right-5 top-5 z-30 flex items-center gap-2 sm:right-8 sm:top-7 lg:right-12">
          <Link
            href="/landing"
            aria-label="Go to ContractX home"
            title="Home"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur-xl transition ${
              isDark
                ? "border-white/[0.08] bg-[#0A0C0F]/90 text-[#F4F1EA] hover:border-[#D8A84E]/50 hover:text-[#D8A84E]"
                : "border-black/[0.10] bg-white/85 text-[#17191C] hover:border-[#A9823E]/50 hover:text-[#9A7336]"
            }`}
          >
            <House size={17} aria-hidden="true" />
          </Link>
          <div className={`flex items-center rounded-xl border p-1 backdrop-blur-xl ${
            isDark
              ? "border-white/[0.08] bg-[#0A0C0F]/90"
              : "border-black/[0.10] bg-white/85 shadow-[0_10px_30px_rgba(30,28,22,0.08)]"
          }`} role="group" aria-label="Appearance">
            {(["dark", "light"] as ThemeMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => switchTheme(item)}
                aria-pressed={theme === item}
                className={`rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                  theme === item
                    ? "bg-[#D8A84E] text-[#050608]"
                    : isDark
                      ? "text-white/35 hover:text-white/70"
                      : "text-black/45 hover:text-black/75"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-220px)] w-full max-w-[1500px] items-center gap-16 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-12">

          {/* Left */}

          <section className="max-w-2xl">

            <div className="mb-8 flex items-center gap-3">

              <div className="text-[22px] font-semibold tracking-[-0.04em]">

                contract

                <span className={isDark ? "text-[#D8A84E]" : "text-[#A9792F]"}>

                  X

                </span>

                .co

              </div>



              <div

                className={`h-5 w-px ${

                  isDark ? "bg-white/10" : "bg-black/10"

                }`}

              />



              <div

                className={`text-[10px] uppercase tracking-[0.18em] ${

                  isDark ? "text-white/35" : "text-black/40"

                }`}

              >

                Secure Access

              </div>

            </div>



            <p

              className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${

                isDark ? "text-[#D2B06F]" : "text-[#9A7336]"

              }`}

            >

              AI Contract & Claims Xpert for Construction

            </p>



            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-[58px]">

              Enter your ContractX workspace.

            </h1>



            <p

              className={`mt-6 max-w-xl text-[15px] leading-7 ${

                isDark ? "text-white/45" : "text-black/55"

              }`}

            >

              Secure access to contractual intelligence, bespoke contract

              review, delay and claims analytics, project monitoring and

              resolution workflows.

            </p>



            <div

              className={`mt-10 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] ${

                isDark ? "text-white/30" : "text-black/45"

              }`}

            >

              {["Review", "Monitor", "Resolve"].map((label) => (

                <span

                  key={label}

                  className={`rounded-full border px-4 py-2 ${

                    isDark ? "border-white/[0.07]" : "border-black/[0.10]"

                  }`}

                >

                  {label}

                </span>

              ))}

            </div>

          </section>



          {/* Login panel */}

          <section className="w-full max-w-[500px] justify-self-end">

            <div

              className={`rounded-[24px] border p-7 backdrop-blur-xl sm:p-9 ${

                isDark

                  ? "border-white/[0.10] bg-[#0A0C0F]/95 shadow-[0_30px_100px_rgba(0,0,0,0.55),0_0_50px_rgba(255,255,255,0.025)]"

                  : "border-black/[0.10] bg-white/90 shadow-[0_30px_80px_rgba(43,38,28,0.12),0_0_1px_rgba(23,25,28,0.10)]"

              }`}

            >

              <div className="mb-8">

                <div

                  className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${

                    isDark ? "text-[#D2B06F]" : "text-[#9A7336]"

                  }`}

                >

                  Workspace Login

                </div>



                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">

                  Sign in

                </h2>



                <p

                  className={`mt-2 text-[13px] leading-6 ${

                    isDark ? "text-white/40" : "text-black/50"

                  }`}

                >

                  Use your registered ContractX account credentials.

                </p>

              </div>



              <form onSubmit={handleLogin}>

                <div>

                  <label

                    htmlFor="email"

                    className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${

                      isDark ? "text-white/40" : "text-black/50"

                    }`}

                  >

                    Email

                  </label>



                  <input

                    id="email"

                    type="email"

                    required

                    autoComplete="email"

                    value={email}

                    onChange={(e) => setEmail(e.target.value)}

                    placeholder="name@company.com"

                    className={`mt-2 w-full rounded-xl border px-4 py-3.5 text-[14px] outline-none transition ${

                      isDark

                        ? "border-white/[0.09] bg-white/[0.025] text-[#F4F1EA] placeholder:text-white/20 focus:border-[#D2B06F]/40 focus:bg-white/[0.035]"

                        : "border-black/[0.12] bg-white/80 text-[#17191C] placeholder:text-black/30 focus:border-[#A9823E]/50 focus:bg-white"

                    }`}

                  />

                </div>



                <div className="mt-5">

                  <div className="flex items-center justify-between">

                    <label

                      htmlFor="password"

                      className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${

                        isDark ? "text-white/40" : "text-black/50"

                      }`}

                    >

                      Password

                    </label>



                    <Link

                      href="/forgot-password"

                      className={`text-[11px] font-medium transition ${

                        isDark

                          ? "text-[#D2B06F]/80 hover:text-[#E3C98F]"

                          : "text-[#9A7336] hover:text-[#7D5B28]"

                      }`}

                    >

                      Forgot password?

                    </Link>

                  </div>



                  <div className="relative mt-2">

                    <input

                      id="password"

                      type={showPassword ? "text" : "password"}

                      required

                      autoComplete="current-password"

                      value={password}

                      onChange={(e) => setPassword(e.target.value)}

                      placeholder="Enter your password"

                      className={`w-full rounded-xl border py-3.5 pl-4 pr-14 text-[14px] outline-none transition ${

                        isDark

                          ? "border-white/[0.09] bg-white/[0.025] text-[#F4F1EA] placeholder:text-white/20 focus:border-[#D2B06F]/40 focus:bg-white/[0.035]"

                          : "border-black/[0.12] bg-white/80 text-[#17191C] placeholder:text-black/30 focus:border-[#A9823E]/50 focus:bg-white"

                      }`}

                    />



                    <button

                      type="button"

                      aria-label={

                        showPassword ? "Hide password" : "Show password"

                      }

                      onClick={() => setShowPassword((value) => !value)}

                      className={`absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border text-[11px] font-medium transition ${

                        isDark

                          ? "border-white/[0.06] bg-white/[0.035] text-white/55 hover:bg-white/[0.07] hover:text-white"

                          : "border-black/[0.08] bg-black/[0.025] text-black/50 hover:bg-black/[0.05] hover:text-black/80"

                      }`}

                    >

                      {showPassword ? "Hide" : "View"}

                    </button>

                  </div>

                </div>



                <label className="mt-6 flex cursor-pointer items-start gap-3">

                  <input

                    type="checkbox"

                    checked={acceptedTerms}

                    onChange={(e) => setAcceptedTerms(e.target.checked)}

                    className={`mt-1 h-4 w-4 ${

                      isDark ? "accent-[#D2B06F]" : "accent-[#A9823E]"

                    }`}

                  />



                  <span

                    className={`text-[11px] leading-5 ${

                      isDark ? "text-white/38" : "text-black/50"

                    }`}

                  >

                    I accept the{" "}

                    <Link

                      href="/terms"

                      className={

                        isDark

                          ? "text-[#D2B06F]/85 hover:text-[#E3C98F]"

                          : "text-[#9A7336] hover:text-[#7D5B28]"

                      }

                    >

                      Terms of Service

                    </Link>{" "}

                    and acknowledge the{" "}

                    <Link

                      href="/privacy"

                      className={

                        isDark

                          ? "text-[#D2B06F]/85 hover:text-[#E3C98F]"

                          : "text-[#9A7336] hover:text-[#7D5B28]"

                      }

                    >

                      Privacy Policy

                    </Link>

                    .

                  </span>

                </label>



                {message && (

                  <div

                    className={`mt-5 rounded-xl border px-4 py-3 text-[12px] leading-5 ${

                      isDark

                        ? "border-red-400/15 bg-red-400/[0.05] text-red-200/80"

                        : "border-red-500/15 bg-red-500/[0.05] text-red-700"

                    }`}

                  >

                    {message}

                  </div>

                )}



                <button

                  type="submit"

                  disabled={

                    loading ||

                    !email ||

                    !password ||

                    !acceptedTerms

                  }

                  className={`mt-7 w-full rounded-xl border px-5 py-3.5 text-[13px] font-semibold text-[#050608] shadow-[0_8px_30px_rgba(210,176,111,0.12)] transition disabled:cursor-not-allowed disabled:opacity-35 ${

                    isDark

                      ? "border-[#E3C98F]/20 bg-[#D2B06F] hover:bg-[#E3C98F]"

                      : "border-[#A9823E]/20 bg-[#A9823E] hover:bg-[#B9934C]"

                  }`}

                >

                  {loading ? "Authenticating..." : "Secure Login"}

                </button>

              </form>



              <div className="mt-5 flex items-center gap-3" aria-hidden="true">
                <div className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-black/10"}`} />
                <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isDark ? "text-white/40" : "text-black/45"}`}>
                  Or sign in with
                </span>
                <div className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-black/10"}`} />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading || !acceptedTerms}
                className={`mt-4 flex w-full items-center justify-center gap-3 rounded-xl border px-5 py-3.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isDark
                    ? "border-white/[0.13] bg-white/[0.04] text-[#F4F1EA] hover:border-[#D8A84E]/50 hover:bg-white/[0.07]"
                    : "border-black/[0.12] bg-white text-[#17191C] hover:border-[#A9823E]/50 hover:bg-[#FFF9EF]"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.17 7.09-10.32 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59a14.37 14.37 0 0 1 0-9.18l-7.98-6.19a23.91 23.91 0 0 0 0 21.56l7.98-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                {googleLoading ? "Connecting to Google..." : "Continue with Google"}
              </button>
              <p className={`mt-2 text-center text-[10px] ${isDark ? "text-white/35" : "text-black/45"}`}>
                Accept the terms above to enable Google sign-in.
              </p>

              <p className={`mt-4 text-center text-[12px] ${isDark ? "text-white/45" : "text-black/55"}`}>
                New to ContractX?{" "}
                <Link href="/signup" className="font-semibold text-[#D8A84E] hover:underline">
                  Create an account
                </Link>
              </p>

              <div

                className={`mt-6 border-t pt-5 ${

                  isDark ? "border-white/[0.06]" : "border-black/[0.08]"

                }`}

              >

                <p

                  className={`text-center text-[10px] uppercase tracking-[0.15em] ${

                    isDark ? "text-white/22" : "text-black/35"

                  }`}

                >

                  Authorized ContractX users only

                </p>

              </div>

            </div>

          </section>

        </div>

      </main>



      <LegalFooter />

    </div>

  );

}
