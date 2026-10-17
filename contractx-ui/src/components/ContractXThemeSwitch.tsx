"use client";

type Theme = "dark" | "light";

type ContractXThemeSwitchProps = {
  theme: Theme;
  onChange: (theme: Theme) => void;
};

export default function ContractXThemeSwitch({
  theme,
  onChange,
}: ContractXThemeSwitchProps) {
  return (
    <div
      className="inline-flex items-center rounded-xl border border-[var(--cx-border)] bg-[var(--cx-panel-2)] p-1"
      role="group"
      aria-label="Appearance"
    >
      {(["dark", "light"] as Theme[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          aria-pressed={theme === item}
          className={[
            "rounded-lg px-3 py-1.5 text-[10px] font-semibold capitalize transition",
            theme === item
              ? "bg-[#D8A84E] text-[#111318]"
              : "text-[var(--cx-muted)] hover:text-[var(--cx-text)]",
          ].join(" ")}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
