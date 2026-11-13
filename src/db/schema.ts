import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
// relative import: drizzle-kit loads this file without the @/ alias
import { SEVERITIES } from "../lib/scanner/types";
import type { CoverageEntry } from "../lib/github";
import type { SkillInfo } from "../lib/skill-info";

export const scanStatus = pgEnum("scan_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

// same list the scanner uses, so the two can't drift apart
export const severity = pgEnum("severity", SEVERITIES);

export const scans = pgTable(
  "scans",
  {
    // random UUID so report links can't be guessed by counting
    id: uuid("id").primaryKey().defaultRandom(),
    repo: text("repo").notNull(), // "owner/name"
    commitSha: text("commit_sha"), // filled in once the repo is fetched
    status: scanStatus("status").notNull().default("pending"),
    step: text("step"), // human-readable progress while running
    score: integer("score"), // 0–100, set when done
    error: text("error"), // set when failed
    // which files were read fully / partially / skipped — always shown in the report
    coverage: jsonb("coverage").$type<CoverageEntry[]>(),
    // what each skill says it does (SKILL.md front matter) + optional Thai summary;
    // null on scans made before this existed, which are then not reused from the cache
    skills: jsonb("skills").$type<SkillInfo[]>(),
    // results are only reused for the same commit AND the same rules
    scannerVersion: text("scanner_version"),
    // no auth yet; kept nullable so adding login later needs no migration of old rows
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // cache lookup: same repo at the same commit → reuse the result
    index("scans_repo_commit_idx").on(t.repo, t.commitSha),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    severity: severity("severity").notNull(),
    rule: text("rule").notNull(), // e.g. "hidden.zero-width"
    file: text("file").notNull(),
    line: integer("line"),
    message: text("message").notNull(),
    excerpt: text("excerpt"), // offending text, invisible chars made visible
  },
  (t) => [index("findings_scan_idx").on(t.scanId)],
);

export type Scan = typeof scans.$inferSelect;
export type Finding = typeof findings.$inferSelect;
