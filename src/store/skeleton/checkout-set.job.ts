/**
 * Набор оформления заказа у существующих магазинов новой темы (базовые секции, 03.11): «Оформление заказа» и
 * «Спасибо за заказ» стали страницами из секций, и без секций в их списках сборка страниц /checkout не пишет. Новые
 * магазины получают набор заготовкой (`skeleton-layout.ts`), прежние — эта задача после старта, без ручной миграции.
 *
 * - Выборка — магазины новой темы, у текущей ревизии которых списка `page-checkout` или `page-checkout-result` ещё
 *   нет (ключа нет). Пустой список — мерчант убрал секции сам: такой магазин не выбирается и не трогается.
 * - Каждый — командой `PlaceSkeleton` с `lists`: секции библиотеки копируются, если их нет, и встают только в
 *   отсутствующие списки, одной записью ревизии; «О нас» и другие списки не трогаются. Под замком магазина
 *   (`skeleton_in_progress` — заготовка уже идёт, следующий старт подхватит).
 * - Идемпотентно: досеянный магазин выборке больше не отвечает. Сбой одного магазина задачу не валит.
 * - Не держит старт: идёт после `CHECKOUT_SET_START_DELAY_MS`, по одному магазину; выключается
 *   `STORE_CHECKOUT_SET_ENABLED=false`.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../../constants";
import type * as schema from "../../db/schema";
import { readNewThemeIds } from "../../storefront-handoff/storefront-handoff.service";
import { PlaceSkeletonCommand } from "./place-skeleton.command";

export const CHECKOUT_LISTS = ["page-checkout", "page-checkout-result"];
/** Пауза после старта: сборщик витрин (он сохраняет секции) успевает подняться той же выкаткой. */
export const CHECKOUT_SET_START_DELAY_MS = 60_000;

export interface CheckoutSetSummary {
  found: number;
  placed: number;
  failed: number;
}

interface ShopRow {
  id: string;
  tenant_id: string;
}

/** Что задаче нужно от базы и команды — тесты подставляют свои. */
export interface CheckoutSetDeps {
  shops(themeIds: readonly string[]): Promise<ShopRow[]>;
  place: Pick<PlaceSkeletonCommand, "execute">;
}

/** Магазины новой темы без списка оформления в текущей ревизии. */
async function shopsWithoutCheckout(
  db: NodePgDatabase<typeof schema>,
  themeIds: readonly string[],
): Promise<ShopRow[]> {
  if (themeIds.length === 0) return [];
  const themes = sql.join(
    themeIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    SELECT s.id, s.tenant_id
    FROM site s
    JOIN site_revision r ON r.id = s.current_revision_id
    WHERE s.deleted_at IS NULL
      AND s.theme_id IN (${themes})
      AND jsonb_typeof(r.data->'sections') = 'object'
      AND NOT (r.data->'sections' ?& ARRAY[${sql.join(
        CHECKOUT_LISTS.map((list) => sql`${list}`),
        sql`, `,
      )}]::text[])
    ORDER BY s.id`);
  return result.rows as unknown as ShopRow[];
}

/** Один проход: каждый магазин — PlaceSkeleton со списками оформления. */
export async function placeCheckoutSets(
  deps: CheckoutSetDeps,
  themeIds: readonly string[],
  stopped: () => boolean = () => false,
  log: Pick<Logger, "log" | "warn"> = new Logger("CheckoutSetJob"),
): Promise<CheckoutSetSummary> {
  const shops = await deps.shops(themeIds);
  const summary: CheckoutSetSummary = {
    found: shops.length,
    placed: 0,
    failed: 0,
  };
  for (const shop of shops) {
    if (stopped()) break;
    try {
      const result = await deps.place.execute({
        tenantId: shop.tenant_id,
        siteId: shop.id,
        lists: CHECKOUT_LISTS,
      });
      if (result.ok && result.effect.complete) summary.placed += 1;
      else {
        summary.failed += 1;
        const why = result.ok ? result.effect.sections.skipped : result.error;
        log.warn(`checkout_set site=${shop.id}: ${JSON.stringify(why)}`);
      }
    } catch (e) {
      summary.failed += 1;
      log.warn(
        `checkout_set site=${shop.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  log.log(
    `checkout_set found=${summary.found} placed=${summary.placed} failed=${summary.failed}`,
  );
  return summary;
}

@Injectable()
export class CheckoutSetJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutSetJob.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running: Promise<CheckoutSetSummary | null> | null = null;

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PlaceSkeletonCommand) private readonly place: PlaceSkeletonCommand,
  ) {}

  /** Не ждёт досева: Nest вызывает хук до `listen`. */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    if (
      (process.env.STORE_CHECKOUT_SET_ENABLED ?? "true").toLowerCase() ===
      "false"
    ) {
      this.logger.log(
        "STORE_CHECKOUT_SET_ENABLED=false — досев оформления выключен",
      );
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, CHECKOUT_SET_START_DELAY_MS);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  run(): Promise<CheckoutSetSummary | null> {
    this.running ??= placeCheckoutSets(
      {
        shops: (themeIds) => shopsWithoutCheckout(this.db, themeIds),
        place: this.place,
      },
      [...readNewThemeIds(process.cwd())],
      () => this.stopped,
      this.logger,
    )
      .catch((e: unknown) => {
        this.logger.warn(
          `checkout_set: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
}
