import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";

export async function GET() {
  await connection(); // always answer at request time, never from the build

  let database: "ok" | "error" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    console.error("health: database check failed", e);
    database = "error";
  }

  return Response.json(
    {
      ok: database === "ok",
      database,
      githubToken: Boolean(process.env.GITHUB_TOKEN),
      time: new Date().toISOString(),
    },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
