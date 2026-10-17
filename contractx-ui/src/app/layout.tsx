import type { Metadata } from "next";
import "./globals.css";
import ContractXAppShell from "@/components/ContractXAppShell";

export const metadata: Metadata = {
  title: "ContractX",
  description: "AI Contract & Claims Xpert for Construction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ContractXAppShell>{children}</ContractXAppShell>
      </body>
    </html>
  );
}