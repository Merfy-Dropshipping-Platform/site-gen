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
 *      с таймаутом, иначе — фоном; строку в любом случае дотянет доводчик;
 *   7. магазин новой темы (nova) сразу после сида получает заготовку
 *      (`PlaceSkeleton`: секции библиотеки, «О нас», секции на особых
 *      страницах) — разом с поддоменом и маршрутом. `wait:true` ждёт и её в
 *      том же таймауте; не успела — доходит фоном, в ответе `started`.
 *
 * Ответ — эффект: вид магазина с состоянием рождения и, у новой темы, статус
 * заготовки.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
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
import { BackgroundWork, within } from "../shared/background-work";
import { issuesOf } from "../shared/input-issues";
import {
  STORE_REGISTRY,
  type StoreRegistry,
  type StoreRegistryTx,
} from "../store-registry";
import { storeSlugFromName } from "../store-slug";
import { toStoreView, type StoreView } from "../store-view";
import { THEME_CATALOG, type ThemeCatalog } from "../theme-catalog";
import { isNewThemeId } from "../../content/new-theme-pages";
import {
  PlaceSkeletonCommand,
  type PlaceSkeletonEffect,
} from "../skeleton/place-skeleton.command";
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
  /** Заготовка магазина новой темы; у остальных тем ключа нет. */
  skeleton?: SkeletonStatus;
}

/**
 * Заготовка при создании: `done` — сводка команды `PlaceSkeleton`; `started` — идёт фоном (не успела за таймаут или
 * `wait:false`); `failed` — отказ команды с её кодом. Повтор `PlaceSkeleton` доставит недостающее.
 */
export type SkeletonStatus =
  | { status: "done"; summary: PlaceSkeletonEffect }
  | { status: "started" }
  | { status: "failed"; code: string };

type SkeletonRun = () => Promise<CommandResult<PlaceSkeletonEffect>>;

type Reservation =
  | { kind: "created"; id: string; slug: string }
  | { kind: "skipped"; storeCount: number }
  | { kind: "refused"; code: string; details: Record<string, unknown> };

const SLUG_ATTEMPTS = 1_000;

@Injectable()
export class CreateStoreCommand {
  private readonly logger = new Logger(CreateStoreCommand.name);
  private readonly background = new BackgroundWork(
    this.logger,
    "store lifecycle background advance failed",
  );
  private readonly skeletonWork = new BackgroundWork(
    this.logger,
    "store skeleton failed",
  );

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
    // Необязательна: без неё (тесты, собирающие команду руками) магазин новой темы создаётся без заготовки.
    @Optional()
    @Inject(PlaceSkeletonCommand)
    private readonly skeleton?: Pick<PlaceSkeletonCommand, "execute">,
  ) {}

  async execute(raw: unknown): Promise<CommandResult<CreateStoreEffect>> {
    const parsed = CreateStoreInputSchema.safeParse(raw);
    if (!parsed.success) {
      return refused("invalid_input", {
        issues: issuesOf(parsed.error),
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

    const skeleton = this.skeletonRun(theme.id, reservation.id, input);
    const { row, skeletonStatus } = await this.bringUp(
      reservation.id,
      input,
      skeleton,
    );
    const store = row ? toStoreView(row) : undefined;
    return ok({
      created: true,
      store,
      waited: input.wait,
      ready: store?.lifecycle.state === "ready",
      ...(skeletonStatus ? { skeleton: skeletonStatus } : {}),
    });
  }

  /** Заготовка — только у новой темы и только когда команда заготовки подключена. */
  private skeletonRun(
    themeId: string,
    siteId: string,
    input: CreateStoreInput,
  ): SkeletonRun | undefined {
    const command = this.skeleton;
    if (!command || !isNewThemeId(themeId)) return undefined;
    return () =>
      command.execute({
        tenantId: input.tenantId,
        siteId,
        actorUserId: input.actorUserId,
      });
  }

  /** Запустить заготовку фоном; статус читается в момент ответа. */
  private startSkeleton(run: SkeletonRun): {
    done: Promise<void>;
    status: () => SkeletonStatus;
  } {
    let status: SkeletonStatus = { status: "started" };
    const done = this.skeletonWork.start(run()).then((result) => {
      status = !result
        ? { status: "failed", code: "internal_error" }
        : result.ok
          ? { status: "done", summary: result.effect }
          : { status: "failed", code: result.error.code };
    });
    return { done, status: () => status };
  }

  /**
   * Дождаться фоновых проходов, запущенных командой (тесты). Хук остановки
   * сервиса их не ждёт: брошенный проход подберёт тик доводчика после аренды.
   */
  async settle(): Promise<void> {
    await Promise.all([this.background.settle(), this.skeletonWork.settle()]);
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
   * Строка вставлена уже в аренде у команды, поэтому команда ведёт её сама,
   * без захвата (`driveHeld`), и тик в это время её не берёт (В3). Сид —
   * синхронно; дальше либо ждём `ready` не дольше таймаута, либо доводим фоном
   * под той же арендой. Потерянный фоновый проход не страшен: аренда истечёт, и
   * строку подберёт тик. Возвращает снимок строки для ответа.
   */
  private async bringUp(
    siteId: string,
    input: CreateStoreInput,
    skeleton?: SkeletonRun,
  ): Promise<{ row: LifecycleRow | null; skeletonStatus?: SkeletonStatus }> {
    if (!input.wait) {
      const seeded = await this.reconciler.driveHeld(siteId, {
        stopAfter: "seeded",
        keepLease: true,
      });
      const row = await this.lifecycle.read(siteId);
      if (seeded.leaseKept)
        void this.background.start(this.reconciler.driveHeld(siteId));
      if (!skeleton) return { row };
      return { row, skeletonStatus: this.startSkeleton(skeleton).status() };
    }
    if (!skeleton) {
      const drive = this.background.start(this.reconciler.driveHeld(siteId));
      await within(drive, input.waitTimeoutMs, undefined);
      return { row: await this.lifecycle.read(siteId) };
    }
    // Новая тема: заготовке нужна ревизия — сид синхронно, дальше поддомен и маршрут разом с заготовкой; ждём обоих в
    // одном таймауте.
    const seeded = await this.reconciler.driveHeld(siteId, {
      stopAfter: "seeded",
      keepLease: true,
    });
    const drive = seeded.leaseKept
      ? this.background.start(this.reconciler.driveHeld(siteId))
      : Promise.resolve(undefined);
    const placing = this.startSkeleton(skeleton);
    await within(
      Promise.all([drive, placing.done]),
      input.waitTimeoutMs,
      undefined,
    );
    return {
      row: await this.lifecycle.read(siteId),
      skeletonStatus: placing.status(),
    };
  }
}
