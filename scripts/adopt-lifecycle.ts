#!/usr/bin/env tsx
/**
 * Перевод магазинов ОДНОГО аккаунта в сагу рождения (этап 3, кусок 3.8;
 * merfy-mcp/docs/plans/stage3-finish/14-sites-adopt-script.md). Правило — planAdoption.
 *
 *   DATABASE_URL=… TENANT_ID=… pnpm site:adopt-lifecycle                                       # план, без записи
 *   DATABASE_URL=… TENANT_ID=… SITE_ID=… DRY_RUN=false pnpm site:adopt-lifecycle               # перевести один магазин
 *   DATABASE_URL=… TENANT_ID=… SITE_ID=… ROLLBACK=true DRY_RUN=false pnpm site:adopt-lifecycle # вернуть его старым cron
 *
 * SITES_USE_CENTRAL_PROXY — как в окружении sites целевого контура: при центральном прокси магазину не нужен
 * проект Coolify. Не задан — строгий режим: проект нужен, магазин без проекта останется неготовым.
 */
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { planAdoption, type AdoptDecision } from "../src/store/lifecycle/adopt-plan";
import { LIFECYCLE_ROW_COLUMNS, type LifecycleRow } from "../src/store/lifecycle/lifecycle.repository";

interface Options {
  databaseUrl: string;
  tenantId: string;
  siteId: string | null;
  dryRun: boolean;
  rollback: boolean;
  projectRequired: boolean;
}

function readOptions(env: NodeJS.ProcessEnv): Options {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("нужен DATABASE_URL — строка подключения к базе целевого контура");
  const tenantId = env.TENANT_ID;
  if (!tenantId) throw new Error("нужен TENANT_ID — аккаунт, чьи магазины переводим");
  return {
    databaseUrl,
    tenantId,
    siteId: env.SITE_ID ?? null,
    dryRun: env.DRY_RUN !== "false",
    rollback: env.ROLLBACK === "true",
    // Центральный прокси снимает требование проекта Coolify; не задан — считаем, что проект нужен.
    projectRequired: env.SITES_USE_CENTRAL_PROXY !== "true",
  };
}

async function listTenantStores(
  db: NodePgDatabase<typeof schema>,
  tenantId: string,
): Promise<LifecycleRow[]> {
  const rows = await db
    .select(LIFECYCLE_ROW_COLUMNS)
    .from(schema.site)
    .where(and(eq(schema.site.tenantId, tenantId), isNull(schema.site.deletedAt)));
  return rows as LifecycleRow[];
}

function printPlan(decisions: readonly AdoptDecision[]): void {
  console.table(
    decisions.map((d) => ({
      siteId: d.siteId,
      name: d.name,
      action: d.action,
      reason: d.action === "skip" ? d.reason : "",
      missing: d.action === "skip" && d.reason === "not_ready" ? d.missing : "",
    })),
    ["siteId", "name", "action", "reason", "missing"],
  );
  const adopt = decisions.filter((d) => d.action === "adopt").length;
  console.log(`итог: к переводу ${adopt}, пропущено ${decisions.length - adopt}`);
}

function skipReasonText(decision: AdoptDecision): string {
  if (decision.action === "skip" && decision.reason === "already_in_saga") {
    return "магазин уже в саге (lifecycle не пуст)";
  }
  if (decision.action === "skip" && decision.reason === "not_ready") {
    return `магазин не готов по фактам, не хватает шага "${decision.missing}" — его ведёт старый cron`;
  }
  return "решение не adopt";
}

async function adoptOne(db: NodePgDatabase<typeof schema>, options: Options): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select(LIFECYCLE_ROW_COLUMNS)
      .from(schema.site)
      .where(
        and(
          eq(schema.site.id, options.siteId ?? ""),
          eq(schema.site.tenantId, options.tenantId),
          isNull(schema.site.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    const row = (rows[0] as LifecycleRow | undefined) ?? null;
    if (!row) throw new Error("магазин не найден у этого тенанта");
    const decision = planAdoption([row], options.projectRequired)[0];
    if (!decision || decision.action !== "adopt") {
      throw new Error(decision ? skipReasonText(decision) : "план пуст");
    }
    await tx
      .update(schema.site)
      .set({
        lifecycle: "ready",
        lifecycleError: null,
        lifecycleAttempts: 0,
        lifecycleNextAt: null,
      })
      .where(eq(schema.site.id, options.siteId ?? ""));
  });
}

async function rollbackOne(db: NodePgDatabase<typeof schema>, options: Options): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select(LIFECYCLE_ROW_COLUMNS)
      .from(schema.site)
      .where(
        and(
          eq(schema.site.id, options.siteId ?? ""),
          eq(schema.site.tenantId, options.tenantId),
          isNull(schema.site.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    const row = (rows[0] as LifecycleRow | undefined) ?? null;
    if (!row) throw new Error("магазин не найден у этого тенанта");
    if (row.lifecycle !== "ready") {
      throw new Error("откатить можно только переведённый магазин (lifecycle = ready)");
    }
    await tx
      .update(schema.site)
      .set({
        lifecycle: null,
        lifecycleError: null,
        lifecycleAttempts: null,
        lifecycleNextAt: null,
      })
      .where(eq(schema.site.id, options.siteId ?? ""));
  });
}

async function main(): Promise<void> {
  const options = readOptions(process.env);
  const pool = new Pool({ connectionString: options.databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    printPlan(planAdoption(await listTenantStores(db, options.tenantId), options.projectRequired));
    if (options.dryRun) {
      console.log("DRY_RUN — ничего не записано");
      return;
    }
    if (!options.siteId) throw new Error("по одному магазину за запуск — задай SITE_ID");
    if (options.rollback) await rollbackOne(db, options);
    else await adoptOne(db, options);
    console.log(
      `записано. Откат этого магазина: TENANT_ID=${options.tenantId} SITE_ID=${options.siteId} ` +
        "ROLLBACK=true DRY_RUN=false pnpm site:adopt-lifecycle",
    );
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
