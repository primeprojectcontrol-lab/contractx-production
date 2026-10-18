"use client";

export type ContractXNoticeVariant =
  | "error"
  | "warning"
  | "success"
  | "info";

type ContractXNoticeModalProps = {
  open: boolean;
  message: string;
  variant?: ContractXNoticeVariant;
  title?: string;
  onClose: () => void;
};

const CONFIG: Record<
  ContractXNoticeVariant,
  {
    eyebrow: string;
    title: string;
    border: string;
    soft: string;
    accent: string;
  }
> = {
  error: {
    eyebrow: "Action Required",
    title: "ContractX could not complete the action",
    border: "border-rose-400/25",
    soft: "border-rose-400/20 bg-rose-400/[0.07]",
    accent: "text-rose-500",
  },
  warning: {
    eyebrow: "Attention Required",
    title: "ContractX requires your attention",
    border: "border-amber-400/25",
    soft: "border-amber-400/20 bg-amber-400/[0.07]",
    accent: "text-amber-500",
  },
  success: {
    eyebrow: "Completed",
    title: "ContractX completed the action",
    border: "border-emerald-400/25",
    soft: "border-emerald-400/20 bg-emerald-400/[0.07]",
    accent: "text-emerald-500",
  },
  info: {
    eyebrow: "Information",
    title: "ContractX information",
    border: "border-sky-400/25",
    soft: "border-sky-400/20 bg-sky-400/[0.07]",
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
    <>
      <style>{`
        .cx-notice-overlay {
          background: rgba(0, 0, 0, 0.55);
        }

        .cx-notice-modal {
          background: #0D1117;
          color: #F5F3EE;
          border-color: rgba(255,255,255,.10);
          box-shadow: 0 28px 90px rgba(0,0,0,.42);
        }

        .cx-notice-title {
          color: #F5F3EE;
        }

        .cx-notice-message {
          color: #D6DCE5;
        }

        .cx-notice-close {
          background: #090C11;
          color: #9CA5B1;
          border-color: rgba(255,255,255,.10);
        }

        .cx-notice-close:hover {
          color: #D8A84E;
          border-color: rgba(216,168,78,.40);
        }

        html[data-contractx-theme="light"] .cx-notice-overlay {
          background: rgba(15,23,42,.28);
        }

        html[data-contractx-theme="light"] .cx-notice-modal {
          background: #FFFFFF;
          color: #172033;
          border-color: #D5DDE7;
          box-shadow: 0 28px 80px rgba(15,23,42,.18);
        }

        html[data-contractx-theme="light"] .cx-notice-title {
          color: #172033;
        }

        html[data-contractx-theme="light"] .cx-notice-message {
          color: #334155;
        }

        html[data-contractx-theme="light"] .cx-notice-close {
          background: #F7F9FC;
          color: #526174;
          border-color: #D5DDE7;
        }

        html[data-contractx-theme="light"] .cx-notice-close:hover {
          color: #8B6118;
          border-color: rgba(139,97,24,.35);
        }

        html[data-contractx-theme="light"] .cx-notice-modal .bg-rose-400\\/\\[0\\.07\\] {
          background: rgba(244,63,94,.07) !important;
        }

        html[data-contractx-theme="light"] .cx-notice-modal .bg-amber-400\\/\\[0\\.07\\] {
          background: rgba(251,191,36,.09) !important;
        }

        html[data-contractx-theme="light"] .cx-notice-modal .bg-emerald-400\\/\\[0\\.07\\] {
          background: rgba(52,211,153,.08) !important;
        }

        html[data-contractx-theme="light"] .cx-notice-modal .bg-sky-400\\/\\[0\\.07\\] {
          background: rgba(56,189,248,.08) !important;
        }
      `}</style>

      <div
        className="cx-notice-overlay fixed inset-0 z-[220] flex items-center justify-center px-4 backdrop-blur-[2px]"
        role={variant === "error" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-live={variant === "error" ? "assertive" : "polite"}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          className={[
            "cx-notice-modal w-full max-w-[460px] rounded-2xl border p-5",
            config.border,
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div
                className={[
                  "text-[9px] font-bold uppercase tracking-[0.16em]",
                  config.accent,
                ].join(" ")}
              >
                {config.eyebrow}
              </div>

              <h2 className="cx-notice-title mt-2 text-[17px] font-semibold tracking-[-0.025em]">
                {title || config.title}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="cx-notice-close flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>

          <div
            className={[
              "cx-notice-message mt-4 rounded-xl border px-4 py-3 text-[12px] leading-6",
              config.soft,
            ].join(" ")}
          >
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
    </>
  );
}