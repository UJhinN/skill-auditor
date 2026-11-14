import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-5 px-4 py-20">
      <LogoMark className="size-12 text-foreground" />
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-bold tracking-tight">ไม่พบหน้านี้</h1>
      <p className="leading-7 text-muted-foreground">
        ลิงก์อาจพิมพ์ผิด หรือรายงานนี้ไม่มีอยู่แล้ว ลองสแกน skill ใหม่จากหน้าแรก
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        กลับหน้าแรก
      </Link>
    </main>
  );
}
