$ErrorActionPreference = "Stop"

$Root = Get-Location
$ComponentDir = Join-Path $Root "src\components"
$ComponentPath = Join-Path $ComponentDir "LegalFooter.tsx"

if (-not (Test-Path $ComponentDir)) {
    New-Item -ItemType Directory -Path $ComponentDir -Force | Out-Null
}

$FooterSource = @'
"use client";

import Link from "next/link";

type LegalFooterProps = {
  active?: "privacy" | "terms" | "security";
};

export default function LegalFooter({ active }: LegalFooterProps) {
  const legalNotice =
    "ContractX provides AI-assisted contractual, commercial, project, claims and schedule intelligence for professional decision support only. The Service and its outputs do not constitute legal advice, engineering advice, contractual certification, expert opinion, or any other regulated professional advice. Users remain responsible for independent verification, professional review, contractual compliance, notices, deadlines, submissions, decisions, and all actions taken in reliance on the Service.";

  return (
    <footer className="relative z-20 border-t border-white/[0.065] bg-[#050608]">
      <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-8 lg:px-12 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_auto] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[18px] font-semibold tracking-[-0.035em] text-[#F4F1EA]">
                contract<span className="text-[#D8A84E]">X</span>.co
              </div>

              <div className="hidden h-5 w-px bg-white/10 sm:block" />

              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                Review. Monitor. Resolve.
              </div>
            </div>

            <p className="mt-5 max-w-4xl text-[11px] leading-[1.75] text-white/34">
              {legalNotice}
            </p>

            <div className="mt-4 text-[11px] text-white/38">
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
                  ? "text-[#D2B06F]"
                  : "text-white/35 transition hover:text-white/70"
              }
            >
              Privacy
            </Link>

            <Link
              href="/terms"
              className={
                active === "terms"
                  ? "text-[#D2B06F]"
                  : "text-white/35 transition hover:text-white/70"
              }
            >
              Terms
            </Link>

            <Link
              href="/security"
              className={
                active === "security"
                  ? "text-[#D2B06F]"
                  : "text-white/35 transition hover:text-white/70"
              }
            >
              Security
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-white/[0.05] pt-5">
          <div className="flex flex-col gap-2 text-[10px] text-white/25 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} contractX.co. All rights reserved.
            </span>

            <span className="text-white/20">
              AI Contract & Claims Xpert for Construction
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
'@

Set-Content -Path $ComponentPath -Value $FooterSource -Encoding UTF8

Write-Host ""
Write-Host "Created shared footer:" -ForegroundColor Green
Write-Host $ComponentPath
Write-Host ""

$Pages = @(
    @{ Path = "src\app\page.tsx"; Active = ""; Name = "Landing" },
    @{ Path = "src\app\login\page.tsx"; Active = ""; Name = "Login" },
    @{ Path = "src\app\dashboard\page.tsx"; Active = ""; Name = "Dashboard" },
    @{ Path = "src\app\onboarding\project\page.tsx"; Active = ""; Name = "Onboarding" },
    @{ Path = "src\app\onboarding\Project\page.tsx"; Active = ""; Name = "Onboarding" },
    @{ Path = "src\app\privacy\page.tsx"; Active = "privacy"; Name = "Privacy" },
    @{ Path = "src\app\terms\page.tsx"; Active = "terms"; Name = "Terms" },
    @{ Path = "src\app\security\page.tsx"; Active = "security"; Name = "Security" }
)

$Handled = @{}

foreach ($Page in $Pages) {
    $FullPath = Join-Path $Root $Page.Path

    if (-not (Test-Path $FullPath)) {
        Write-Host "SKIP missing: $($Page.Path)" -ForegroundColor DarkGray
        continue
    }

    $Resolved = (Resolve-Path $FullPath).Path.ToLowerInvariant()

    if ($Handled.ContainsKey($Resolved)) {
        continue
    }

    $Handled[$Resolved] = $true

    $BackupPath = "$FullPath.before-legal-footer.bak"

    if (-not (Test-Path $BackupPath)) {
        Copy-Item $FullPath $BackupPath
    }

    $Source = Get-Content -Path $FullPath -Raw

    $ImportLine = 'import LegalFooter from "@/components/LegalFooter";'

    if ($Source -notmatch [regex]::Escape($ImportLine)) {
        if ($Source -match '^\s*"use client";') {
            $Source = $Source -replace '^\s*"use client";', "`"use client`";`r`n`r`n$ImportLine"
        }
        elseif ($Source -match "^\s*'use client';") {
            $Source = $Source -replace "^\s*'use client';", "'use client';`r`n`r`n$ImportLine"
        }
        else {
            $Source = "$ImportLine`r`n$Source"
        }
    }

    if ([string]::IsNullOrWhiteSpace($Page.Active)) {
        $Replacement = '<LegalFooter />'
    }
    else {
        $Replacement = '<LegalFooter active="' + $Page.Active + '" />'
    }

    if ($Source -match '<LegalFooter\b[^>]*/>') {
        $Source = [regex]::Replace(
            $Source,
            '<LegalFooter\b[^>]*/>',
            $Replacement
        )
    }
    elseif ($Source -match '(?s)<footer\b.*?</footer>') {
        $Source = [regex]::Replace(
            $Source,
            '(?s)<footer\b.*?</footer>',
            $Replacement,
            1
        )
    }
    elseif ($Source.Contains("</main>")) {
        $Index = $Source.LastIndexOf("</main>")
        $Source =
            $Source.Substring(0, $Index) +
            "`r`n      $Replacement`r`n    " +
            $Source.Substring($Index)
    }
    else {
        Write-Host "WARNING: could not place footer in $($Page.Path)" -ForegroundColor Yellow
        continue
    }

    Set-Content -Path $FullPath -Value $Source -Encoding UTF8

    Write-Host "UPDATED $($Page.Name): $($Page.Path)" -ForegroundColor Green
    Write-Host "  Backup: $BackupPath" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "ContractX legal footer migration complete." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next run:"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Verify:"
Write-Host "  /"
Write-Host "  /login"
Write-Host "  /onboarding/Project"
Write-Host "  /dashboard"
Write-Host "  /privacy"
Write-Host "  /terms"
Write-Host "  /security"
