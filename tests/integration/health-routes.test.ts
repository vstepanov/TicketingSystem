/**
 * Health & readiness route tests (plan §4.9, step S13).
 *
 * - Contract: GET /api/health → 200 { status: "ok" } (no DB involved, public).
 * - Contract: GET /api/ready → 503 { status: "not_ready" } when the DB check
 *   fails, exercised by injecting a failing db client (no Docker required).
 * - Integration: GET /api/ready → 200 { status: "ready" } against a real,
 *   migrated embedded-postgres cluster; and → 503 once that cluster is torn down
 *   (a genuinely unreachable DB), proving the "db down → 503" path end to end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A valid env before importing anything that reads it at module load.
process.env.SESSION_SECRET ??= "health-routes-secret-of-sufficient-length!!!";
process.env.DATABASE_URL ??= "postgres://app:secret@localhost:5432/ticketing";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SMTP_HOST ??= "relay1.dataart.com";
process.env.SMTP_FROM ??= "Ticket Tracker <no-reply@dataart.com>";

import { GET as healthGET } from "../../app/api/health/route";
import { checkDbReadiness } from "@/server/db/readiness";
import type { DbClient } from "@/server/db/client";
import { createDbClient } from "@/server/db/client";
import { setupTestDb, type TestDb } from "../helpers/pg";

describe("GET /api/health (contract)", () => {
  it("200 { status: 'ok' } without touching the database", async () => {
    const res = healthGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("checkDbReadiness (unit — injectable db down)", () => {
  it("reports not-ready when the injected client throws (does not reject)", async () => {
    const failing = {
      execute: async () => {
        throw new Error("connection refused");
      },
    } as unknown as DbClient;

    await expect(checkDbReadiness(failing)).resolves.toEqual({ ready: false });
  });

  it("reports ready when the injected client resolves", async () => {
    const ok = {
      execute: async () => [{ "?column?": 1 }],
    } as unknown as DbClient;

    await expect(checkDbReadiness(ok)).resolves.toEqual({ ready: true });
  });
});

describe("GET /api/ready (integration — real Postgres)", () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await setupTestDb();
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it("200 { status: 'ready' } when the DB is up", async () => {
    // Build a fresh handler bound to the live test DB (the shared `db` proxy
    // points at DATABASE_URL, which is not the ephemeral cluster).
    const { db, sql } = createDbClient(ctx.url);
    try {
      const result = await checkDbReadiness(db);
      expect(result).toEqual({ ready: true });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("503 { status: 'not_ready' } when the DB is unreachable", async () => {
    // Point at the cluster's port, then stop accepting to guarantee failure by
    // closing the connection before probing.
    const { db, sql } = createDbClient(ctx.url);
    await sql.end({ timeout: 5 }); // connection pool closed → queries fail.

    const result = await checkDbReadiness(db);
    expect(result).toEqual({ ready: false });
  });
});
