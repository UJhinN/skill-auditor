import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Report } from "./report";

export const metadata: Metadata = {
  title: "ผลการสแกน · Skill Auditor",
};

export default function ScanPage({ params }: PageProps<"/scans/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <Link href="/" className="font-mono text-sm text-muted-foreground hover:text-foreground">
        ← skill-auditor
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">กำลังโหลด…</p>}>
        <ReportForId params={params} />
      </Suspense>
    </main>
  );
}

async function ReportForId({ params }: { params: PageProps<"/scans/[id]">["params"] }) {
  const { id } = await params;
  return <Report id={id} />;
}
