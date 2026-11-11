import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const scanStatus = pgEnum("scan_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

export const severity = pgEnum("severity", [
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);

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
  },
  (t) => [index("findings_scan_idx").on(t.scanId)],
);

export type Scan = typeof scans.$inferSelect;
export type Finding = typeof findings.$inferSelect;
