"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyDelayForensicRedirect() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");

    router.replace(
      projectId
        ? `/delay-analytics?project=${encodeURIComponent(projectId)}`
        : "/portfolio"
    );
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050608] px-5 text-[#F5F3EE]">
      <div className="rounded-full border border-white/[0.10] bg-[#0D0F12] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#B9C1C9]">
        Redirecting to Delay & Forensic Analytics…
      </div>
    </main>
  );
}
