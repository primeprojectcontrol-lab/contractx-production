"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light" | "system";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("contractx-theme") as ThemeMode) || "dark";
    setTheme(saved);
    applyTheme(saved);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if ((localStorage.getItem("contractx-theme") || "dark") === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, []);

  function applyTheme(mode: ThemeMode) {
    const resolved =
      mode === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;

    document.documentElement.setAttribute("data-theme", resolved);
  }

  function chooseTheme(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem("contractx-theme", mode);
    applyTheme(mode);
  }

  return (
    <div className="flex items-center rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel)] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
      {(["dark", "light", "system"] as ThemeMode[]).map((mode) => {
        const active = theme === mode;

        return (
          <button
            key={mode}
            type="button"
            onClick={() => chooseTheme(mode)}
            className={[
              "rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
              active
                ? "bg-[var(--cx-gold)] text-[#050608]"
                : "text-[var(--cx-muted)] hover:text-[var(--cx-foreground)]",
            ].join(" ")}
          >
            {mode === "dark" ? "Dark" : mode === "light" ? "Light" : "System"}
          </button>
        );
      })}
    </div>
  );
}
