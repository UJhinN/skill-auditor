import { RepoForm } from "./repo-form";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-4 py-24">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-sm text-muted-foreground">skill-auditor</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          ตรวจ skill ก่อนติดตั้ง
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          ใส่ชื่อ repo บน GitHub ระบบจะอ่านไฟล์ของ skill หาข้อความที่ซ่อนไว้และคำสั่งเสี่ยงในสคริปต์
          โดยไม่รันโค้ดใดๆ ทั้งสิ้น
        </p>
      </div>

      <RepoForm />

      <p className="text-sm leading-6 text-muted-foreground">
        ตอนนี้ตรวจด้วยชุดกฎที่หารูปแบบที่รู้จักเท่านั้น ยังไม่มี AI อ่านความหมายของเนื้อหา
        ผลที่ไม่พบปัญหาจึงไม่ได้รับรองว่า skill นั้นปลอดภัย
      </p>
    </main>
  );
}
