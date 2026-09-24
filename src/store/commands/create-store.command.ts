/**
 * Команда «создать магазин» — `CreateStore` (этап 3, кусок 3.2).
 *
 * План: merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И1–И3.
 * Одна команда для всех входов: кабинет (после переезда шлюза, 3.5),
 * регистрация (`user.listener`), cron «пользователи без магазина»
 * (`provisionMissingSites`), потом агент. RPC: `sites.cmd.create_store`.
 *
 *   1. вход — по схеме (zod), отказ `invalid_input`;
 *   2. тема — по каталогу (`unknown_theme` со списком доступных); без темы —
 *      тема по умолчанию из каталога (объявлена в одном месте);
 *   3. права тарифа — у биллинга, ОДИН раз на команду;
 *   4. под блокировкой тенанта: «у тенанта ещё нет магазинов» (если просили),
 *      лимит (`shops_limit_reached` с `limit/current` — тело сегодняшнего 402
 *      шлюза), слаг (транслит кириллицы, Н4; `-1`, `-2` при коллизии),
 *      вставка строки сразу в саге (`lifecycle = 'reserved'`);
 *   5. событие `sites.site.created` — та же форма, что у старого `reserve()`;
 *   6. сид стартовой ревизии ВЫБРАННОЙ темы — синхронно (конструктор видит
 *      содержимое с первой секунды), дальше: `wait:true` — довести до `ready`
 *      с таймаутом, иначе — фоном; строку в любом случае дотянет доводчик.
 *
 * Ответ — эффект: вид магазина с состоянием рождения.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  BillingClient,
  decideSiteCreation,
  type EntitlementsReading,
} from "../../billing/billing.client";
import { SitesEventsService } from "../../events/events.service";
import {
  LIFECYCLE_REPOSITORY,
  type LifecycleRepository,
  type LifecycleRow,
} from "../lifecycle/lifecycle.repository";
import { StoreLifecycleReconciler } from "../lifecycle/store-lifecycle.reconciler";
import {
  STORE_REGISTRY,
  type StoreRegistry,
  type StoreRegistryTx,
} from "../store-registry";
import { storeSlugFromName } from "../store-slug";
import { toStoreView, type StoreView } from "../store-view";
import { THEME_CATALOG, type ThemeCatalog } from "../theme-catalog";
import { ok, refused, type CommandResult } from "./command-result";

export const CREATE_STORE_SOURCES = [
  "cabinet",
  "registration",
  "missing-store",
  "agent",
] as const;
export type CreateStoreSource = (typeof CREATE_STORE_SOURCES)[number];

export const DEFAULT_WAIT_TIMEOUT_MS = 20_000;

export const CreateStoreInputSchema = z.object({
  tenantId: z.string().trim().min(1),
  actorUserId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(120).optional(),
  themeId: z.string().trim().min(1).optional(),
  wait: z.boolean().default(false),
  waitTimeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(DEFAULT_WAIT_TIMEOUT_MS),
  /** Создать, только если у тенанта ещё нет ни одного магазина (регистрация, cron). */
  ifNoStores: z.boolean().default(false),
  source: z.enum(CREATE_STORE_SOURCES).default("cabinet"),
});
export type CreateStoreInput = z.infer<typeof CreateStoreInputSchema>;

/**
 * Биллинг не дал ответа (нет аккаунта, RPC упал, `success:false`) — что
 * делать, решает вход. Кабинет и регистрация как раньше работают по
 * умолчанию тарифа (`BillingClient` отдаёт 1 магазин); cron «без магазина»
 * как раньше отказывается (`provisionMissingSites`: «unknown billing is
 * refused»). Правило — данными, не веткой.
 */
export const REFUSE_WHEN_BILLING_UNKNOWN: Record<CreateStoreSource, boolean> = {
  cabinet: false,
  registration: false,
  "missing-store": true,
  agent: false,
};

export interface CreateStoreEffect {
  created: boolean;
  /** Почему не создан (только при `ifNoStores`). */
  reason?: "tenant_has_stores";
  storeCount?: number;
  store?: StoreView;
  /** Команда ждала `ready` (`wait:true`). */
  waited: boolean;
  /** Магазин готов на момент ответа. */
  ready: boolean;
}

type Reservation =
  | { kind: "created"; id: string; slug: string }
  | { kind: "skipped"; storeCount: number }
  | { kind: "refused"; code: string; details: Record<string, unknown> };

const SLUG_ATTEMPTS = 1_000;

@Injectable()
export class CreateStoreCommand {
  private readonly logger = new Logger(CreateStoreCommand.name);
  private readonly background = new Set<Promise<unknown>>();

  constructor(
    @Inject(STORE_REGISTRY) private readonly registry: StoreRegistry,
    @Inject(THEME_CATALOG) private readonly catalog: ThemeCatalog,
    @Inject(BillingClient)
    private readonly billing: Pick<BillingClient, "readEntitlements">,
    @Inject(StoreLifecycleReconciler)
    private readonly reconciler: StoreLifecycleReconciler,
    @Inject(LIFECYCLE_REPOSITORY)
    private readonly lifecycle: LifecycleRepository,
    @Inject(SitesEventsService)
    private readonly events: Pick<SitesEventsService, "emit">,
  ) {}

  async execute(raw: unknown): Promise<CommandResult<CreateStoreEffect>> {
    const parsed = CreateStoreInputSchema.safeParse(raw);
    if (!parsed.success) {
      return refused("invalid_input", {
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`,
        ),
      });
    }
    const input = parsed.data;

    const themeId = input.themeId ?? this.catalog.defaultThemeId;
    const theme = await this.catalog.find(themeId, input.tenantId);
    if (!theme) {
      const available = (await this.catalog.list(input.tenantId)).map(
        (t) => t.id,
      );
      return refused("unknown_theme", { themeId, available });
    }

    const billing = await this.billing.readEntitlements(input.tenantId);
    const reservation = await this.registry.withTenantLock(
      input.tenantId,
      (tx) => this.reserve(tx, input, theme.id, billing),
    );
    if (reservation.kind === "refused")
      return refused(reservation.code, reservation.details);
    if (reservation.kind === "skipped") {
      return ok({
        created: false,
        reason: "tenant_has_stores",
        storeCount: reservation.storeCount,
        waited: false,
        ready: false,
      });
    }

    this.events.emit("sites.site.created", {
      tenantId: input.tenantId,
      siteId: reservation.id,
      name: input.name,
      slug: reservation.slug,
      publicUrl: null,
    });

    const row = await this.bringUp(reservation.id, input);
    const store = row ? toStoreView(row) : undefined;
    return ok({
      created: true,
      store,
      waited: input.wait,
      ready: store?.lifecycle.state === "ready",
    });
  }

  /** Дождаться фоновых проходов, запущенных командой (тесты, остановка сервиса). */
  async settle(): Promise<void> {
    while (this.background.size) await Promise.allSettled([...this.background]);
  }

  private async reserve(
    tx: StoreRegistryTx,
    input: CreateStoreInput,
    themeId: string,
    billing: EntitlementsReading,
  ): Promise<Reservation> {
    if (input.ifNoStores) {
      const storeCount = await tx.countStores(input.tenantId, "any");
      if (storeCount > 0) return { kind: "skipped", storeCount };
    }
    const current = await tx.countStores(input.tenantId, "counted");
    const decision = decideSiteCreation(billing.entitlements, current, {
      billingKnown: billing.known,
      refuseWhenBillingUnknown: REFUSE_WHEN_BILLING_UNKNOWN[input.source],
    });
    if (!decision.allowed)
      return {
        kind: "refused",
        code: decision.reason,
        details: decision.details,
      };

    const slug = await this.uniqueSlug(
      tx,
      input.tenantId,
      storeSlugFromName(input.slug || input.name),
    );
    const id = randomUUID();
    await tx.insertStore({
      id,
      tenantId: input.tenantId,
      name: input.name,
      slug,
      themeId,
      actorUserId: input.actorUserId,
    });
    return { kind: "created", id, slug };
  }

  private async uniqueSlug(
    tx: StoreRegistryTx,
    tenantId: string,
    base: string,
  ): Promise<string> {
    for (let n = 0; n < SLUG_ATTEMPTS; n += 1) {
      const candidate = n === 0 ? base : `${base}-${n}`;
      if (!(await tx.slugTaken(tenantId, candidate))) return candidate;
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Сид — синхронно; дальше либо ждём `ready` не дольше таймаута, либо
   * отпускаем фоном. Потерянный фоновый проход не страшен: строку подберёт
   * тик доводчика. Возвращает снимок строки для ответа.
   */
  private async bringUp(
    siteId: string,
    input: CreateStoreInput,
  ): Promise<LifecycleRow | null> {
    if (!input.wait) {
      await this.reconciler.advance(siteId, { stopAfter: "seeded" });
      const seeded = await this.lifecycle.read(siteId);
      void this.inBackground(this.reconciler.advance(siteId));
      return seeded;
    }
    const drive = this.inBackground(this.reconciler.advance(siteId));
    await Promise.race([drive, delay(input.waitTimeoutMs)]);
    return this.lifecycle.read(siteId);
  }

  private inBackground<T>(work: Promise<T>): Promise<T | undefined> {
    const tracked = work.catch((e: unknown) => {
      this.logger.error(
        `store lifecycle background advance failed: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    });
    this.background.add(tracked);
    void tracked.finally(() => this.background.delete(tracked));
    return tracked;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}
