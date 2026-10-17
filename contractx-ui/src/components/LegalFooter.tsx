"use client";

import Link from "next/link";

type LegalFooterProps = {
  active?: "privacy" | "terms" | "security";
  compact?: boolean;
};

export default function LegalFooter({
  active,
  compact = false,
}: LegalFooterProps) {
  const legalNotice =
    "ContractX provides AI-assisted contractual, commercial, project, claims and schedule intelligence for professional decision support only. The Service and its outputs do not constitute legal advice, engineering advice, contractual certification, expert opinion, or any other regulated professional advice. Users remain responsible for independent verification, professional review, contractual compliance, notices, deadlines, submissions, decisions, and all actions taken in reliance on the Service.";

  return (
    <>
      <style>{`
        #contractx-footer-logo-x {
          color: #D8A84E !important;
          -webkit-text-fill-color: #D8A84E !important;
        }
      `}</style>

      <footer className="relative z-20 border-t border-[var(--cx-footer-border,var(--cx-border,rgba(255,255,255,.065)))] bg-[var(--cx-footer-bg,var(--cx-background,#050608))] text-[var(--cx-footer-text,var(--cx-foreground,#F4F1EA))]">
        <div
          className={[
            "mx-auto w-full max-w-[1500px] px-5 sm:px-8 lg:px-12",
            compact ? "py-8" : "py-10 lg:py-12",
          ].join(" ")}
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_auto] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-[18px] font-semibold tracking-[-0.035em] text-[var(--cx-footer-text,var(--cx-foreground,#F4F1EA))]">
                  contract<span id="contractx-footer-logo-x">X</span>.co
                </div>

                <div className="hidden h-5 w-px bg-[var(--cx-footer-divider,var(--cx-divider,rgba(255,255,255,.10)))] sm:block" />

                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--cx-footer-muted,var(--cx-muted,rgba(244,241,234,.40)))]">
                  Review. Monitor. Resolve.
                </div>
              </div>

              <p className="mt-5 max-w-4xl text-[11px] leading-[1.75] text-[var(--cx-footer-muted,var(--cx-muted,rgba(244,241,234,.40)))]">
                {legalNotice}
              </p>

              <div className="mt-4 text-[11px] text-[var(--cx-footer-muted-strong,var(--cx-muted-strong,rgba(244,241,234,.48)))]">
                info@contractx.co
              </div>
            </div>

            <nav
              aria-label="Legal"
              className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.13em]"
            >
              <Link
                href="/privacy"
                className={
                  active === "privacy"
                    ? "text-[var(--cx-footer-accent,var(--cx-gold,#D2B06F))]"
                    : "text-[var(--cx-footer-muted,var(--cx-muted,rgba(244,241,234,.40)))] transition hover:text-[var(--cx-footer-hover,var(--cx-foreground,#F4F1EA))]"
                }
              >
                Privacy
              </Link>

              <Link
                href="/terms"
                className={
                  active === "terms"
                    ? "text-[var(--cx-footer-accent,var(--cx-gold,#D2B06F))]"
                    : "text-[var(--cx-footer-muted,var(--cx-muted,rgba(244,241,234,.40)))] transition hover:text-[var(--cx-footer-hover,var(--cx-foreground,#F4F1EA))]"
                }
              >
                Terms
              </Link>

              <Link
                href="/security"
                className={
                  active === "security"
                    ? "text-[var(--cx-footer-accent,var(--cx-gold,#D2B06F))]"
                    : "text-[var(--cx-footer-muted,var(--cx-muted,rgba(244,241,234,.40)))] transition hover:text-[var(--cx-footer-hover,var(--cx-foreground,#F4F1EA))]"
                }
              >
                Security
              </Link>
            </nav>
          </div>

          <div className="mt-8 border-t border-[var(--cx-footer-border-soft,var(--cx-border-soft,rgba(255,255,255,.05)))] pt-5">
            <div className="flex flex-col gap-2 text-[10px] text-[var(--cx-footer-muted-soft,var(--cx-muted-soft,rgba(244,241,234,.30)))] sm:flex-row sm:items-center sm:justify-between">
              <span>
                © {new Date().getFullYear()} contractX.co. All rights reserved.
              </span>

              <span>
                AI Contract & Claims Xpert for Construction
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
