import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import Link from "next/link";
import { Suspense } from "react";
import { Report } from "./report";

export const metadata: Metadata = {
  title: "ผลการสแกน · Skill Auditor",
};

export default function ScanPage({ params }: PageProps<"/scans/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="inline-flex min-h-9 items-center gap-2 self-start font-mono text-sm text-muted-foreground hover:text-foreground">
        <LogoMark className="size-5 text-foreground" />
        skill-auditor
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">กำลังโหลด…</p>}>
        <ReportForId params={params} />
      </Suspense>
    </main>
  );
}

async function ReportForId({ params }: { params: PageProps<"/scans/[id]">["params"] }) {
  const { id } = await params;
  // key: opening another scan (the "check latest" button) must start from a clean state
  return <Report key={id} id={id} />;
}
