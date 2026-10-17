"use client";

export type ContractXNoticeVariant = "error" | "warning" | "success" | "info";

type ContractXNoticeModalProps = {
  open: boolean;
  message: string;
  variant?: ContractXNoticeVariant;
  title?: string;
  onClose: () => void;
};

const CONFIG: Record<
  ContractXNoticeVariant,
  { eyebrow: string; title: string; border: string; soft: string; accent: string }
> = {
  error: {
    eyebrow: "Action Required",
    title: "ContractX could not complete the action",
    border: "border-rose-400/25",
    soft: "border-rose-400/15 bg-rose-400/[0.055]",
    accent: "text-rose-500",
  },
  warning: {
    eyebrow: "Attention Required",
    title: "ContractX requires your attention",
    border: "border-amber-400/25",
    soft: "border-amber-400/15 bg-amber-400/[0.055]",
    accent: "text-amber-500",
  },
  success: {
    eyebrow: "Completed",
    title: "ContractX completed the action",
    border: "border-emerald-400/25",
    soft: "border-emerald-400/15 bg-emerald-400/[0.055]",
    accent: "text-emerald-500",
  },
  info: {
    eyebrow: "Information",
    title: "ContractX information",
    border: "border-sky-400/25",
    soft: "border-sky-400/15 bg-sky-400/[0.055]",
    accent: "text-sky-500",
  },
};

export default function ContractXNoticeModal({
  open,
  message,
  variant = "info",
  title,
  onClose,
}: ContractXNoticeModalProps) {
  if (!open || !message) return null;

  const config = CONFIG[variant];

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
      role={variant === "error" ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-live={variant === "error" ? "assertive" : "polite"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={[
          "w-full max-w-[460px] rounded-2xl border bg-[var(--cx-panel,#0D1117)] p-5 text-[var(--cx-text,#F5F3EE)] shadow-[0_28px_90px_rgba(0,0,0,.42)]",
          config.border,
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={["text-[9px] font-bold uppercase tracking-[0.16em]", config.accent].join(" ")}>
              {config.eyebrow}
            </div>
            <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.025em]">
              {title || config.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--cx-border,rgba(255,255,255,.10))] bg-[var(--cx-panel-2,#090C11)] text-[var(--cx-muted,#9CA5B1)] transition hover:border-[#D8A84E]/40 hover:text-[#D8A84E]"
            aria-label="Close notification"
          >
            ×
          </button>
        </div>

        <div className={["mt-4 rounded-xl border px-4 py-3 text-[12px] leading-6", config.soft].join(" ")}>
          {message}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#D8A84E] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#111318] transition hover:bg-[#E3BB69]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
