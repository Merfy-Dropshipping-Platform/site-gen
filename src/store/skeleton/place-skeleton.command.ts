/**
 * Команда «заготовка магазина» — `PlaceSkeleton` (решение 7 спеки MCP «Секции и SDK»: «Заготовку нового магазина
 * ставит платформа одной командой: серые секции на всех особых страницах, всё работает. Дальше ИИ только оформляет»;
 * §11: «sites: команда заготовки магазина»). RPC: `sites.cmd.place_skeleton`.
 *
 *   1. вход — по схеме (zod), отказ `invalid_input`; магазин — в пределах тенанта (`site_not_found`); только новая
 *      тема (`not_new_theme`); у магазина должна быть ревизия (`no_revision`);
 *   2. под блокировкой магазина (`skeleton_in_progress`, если заготовка уже идёт): недостающие секции нашей библиотеки
 *      (`skeleton-library.ts`) — в свои секции магазина через сборщик витрин, без шлюза и лимита. Секция с тем же
 *      именем уже есть — не трогаем, даже если мерчант её правил; роль занята другой секцией — пропуск с причиной;
 *   3. «О нас», если её нет, и секции в ПУСТЫЕ списки по раскладке (`skeleton-layout.ts`) — одной записью ревизии от
 *      прочитанной базы со сведением `last-writer-wins`, как запись конструктора у nova
 *      (`content/constructor-stale-base.ts`): правка конструктора между чтением и записью не теряется.
 *
 * Повтор ничего не меняет: секции есть — не копируются, списки не пустые — не трогаются, ревизия не пишется.
 * Ответ — сводка: сколько секций добавлено, какие списки заполнены, что пропущено и почему.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { z } from "zod";
import { isNewThemeId } from "../../content/new-theme-pages";
import { StoreContentService } from "../../content/store-content.service";
import {
  RevisionConflictError,
  toStoreContentSite,
  type StoreContent,
} from "../../content/store-content.port";
import { SitesDomainService } from "../../sites.service";
import { ok, refused, type CommandResult } from "../commands/command-result";
import { issuesOf } from "../shared/input-issues";
import { skeletonLibrary, type Library } from "./skeleton-library";
import {
  SKELETON_LAYOUT,
  skeletonSectionNames,
  type SkeletonLayout,
} from "./skeleton-layout";
import { planSkeleton, type SkeletonPlacement } from "./skeleton.plan";
import {
  SKELETON_LOCK,
  SKELETON_SECTIONS,
  type SkeletonLock,
  type SkeletonSections,
} from "./skeleton-sections";

export const PlaceSkeletonInputSchema = z.object({
  tenantId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  actorUserId: z.string().trim().min(1).optional(),
});
export type PlaceSkeletonInput = z.infer<typeof PlaceSkeletonInputSchema>;

/** Сколько секций сборщик принимает разом: каждая — сборка и два пробных рендера в отдельном процессе (~2 с). */
export const SKELETON_SAVE_CONCURRENCY = 4;

export interface SkippedSection {
  name: string;
  title: string;
  reason: string;
}

export interface PlaceSkeletonEffect {
  siteId: string;
  /** Команда что-то поменяла: скопировала секции или записала ревизию. */
  changed: boolean;
  /** Всё на месте: секции библиотеки в магазине, списки и «О нас» не ждут. */
  complete: boolean;
  /** Ревизия после команды: новая, если писали, иначе текущая. */
  revisionId: string | null;
  sections: {
    /** Секций в заготовке. */
    total: number;
    /** Скопированы сейчас (имена без префикса). */
    added: string[];
    /** Уже были в магазине. */
    kept: number;
    /** Не скопированы: причина словами. */
    skipped: SkippedSection[];
  };
  lists: Omit<SkeletonPlacement, "about">;
  about: SkeletonPlacement["about"];
}

/** Строка магазина, как её отдаёт `SitesDomainService.get`. */
interface SiteRow {
  id: string;
  themeId: string | null;
  publicUrl: string | null;
  name: string | null;
  currentRevisionId: string | null;
  contentModel?: string | null;
}

/** Что команде нужно от sites-сервиса (реализует `SitesDomainService`). */
export interface SkeletonSites {
  get(tenantId: string, siteId: string): Promise<SiteRow | null>;
}

export interface SkeletonOptions {
  library?: Library;
  layout?: SkeletonLayout;
}

/** Своя библиотека и раскладка — для тестов; в сервисе не задаётся. */
export const SKELETON_OPTIONS = Symbol("SKELETON_OPTIONS");

@Injectable()
export class PlaceSkeletonCommand {
  private readonly logger = new Logger(PlaceSkeletonCommand.name);
  private readonly library: Library;
  private readonly layout: SkeletonLayout;

  constructor(
    @Inject(SitesDomainService) private readonly sites: SkeletonSites,
    @Inject(StoreContentService)
    private readonly content: Pick<StoreContent, "load" | "save">,
    @Inject(SKELETON_SECTIONS) private readonly sections: SkeletonSections,
    @Inject(SKELETON_LOCK) private readonly lock: SkeletonLock,
    @Optional() @Inject(SKELETON_OPTIONS) options?: SkeletonOptions,
  ) {
    this.library = options?.library ?? skeletonLibrary();
    this.layout = options?.layout ?? SKELETON_LAYOUT;
  }

  async execute(raw: unknown): Promise<CommandResult<PlaceSkeletonEffect>> {
    const parsed = PlaceSkeletonInputSchema.safeParse(raw);
    if (!parsed.success)
      return refused("invalid_input", { issues: issuesOf(parsed.error) });
    const input = parsed.data;

    const site = await this.sites.get(input.tenantId, input.siteId);
    if (!site) return refused("site_not_found");
    if (!isNewThemeId(site.themeId))
      return refused("not_new_theme", { themeId: site.themeId });
    if (!site.currentRevisionId) return refused("no_revision");

    const run = await this.lock.withSiteLock(site.id, () =>
      this.place(site, input),
    );
    if (!run.locked) return refused("skeleton_in_progress");
    return run.value;
  }

  private async place(
    site: SiteRow,
    input: PlaceSkeletonInput,
  ): Promise<CommandResult<PlaceSkeletonEffect>> {
    const names = skeletonSectionNames(this.layout);
    const copied = await this.copyMissing(site.id, names);

    const loaded = await this.content.load(site.id, {
      site: toStoreContentSite(site),
      asStored: true,
    });
    const plan = planSkeleton({
      document: loaded.document,
      layout: this.layout,
      library: this.library,
      present: copied.present,
    });

    let revisionId = loaded.version;
    if (plan.changed) {
      try {
        const saved = await this.content.save(site.id, {
          mode: "on-base",
          document: plan.document,
          base: loaded.version,
          mergePolicy: "last-writer-wins",
          tenantId: input.tenantId,
          actor: "system",
          source: "skeleton",
          actorUserId: input.actorUserId,
          meta: { title: "Заготовка магазина" },
          site: toStoreContentSite(site),
        });
        revisionId = saved.version;
      } catch (e) {
        if (e instanceof RevisionConflictError)
          return refused("revision_conflict");
        throw e;
      }
    }

    const { about, ...lists } = plan.placement;
    const effect: PlaceSkeletonEffect = {
      siteId: site.id,
      changed: plan.changed || copied.added.length > 0,
      complete:
        copied.skipped.length === 0 &&
        lists.waiting.length === 0 &&
        about !== "waiting",
      revisionId,
      sections: {
        total: names.length,
        added: copied.added,
        kept: copied.kept,
        skipped: copied.skipped,
      },
      lists,
      about,
    };
    this.logger.log(
      `place_skeleton site=${site.id} added=${copied.added.length} skipped=${copied.skipped.length} ` +
        `filled=${lists.filled.length} waiting=${lists.waiting.length} wrote=${plan.changed}`,
    );
    return ok(effect);
  }

  /** Недостающие секции заготовки — в магазин; сохранённые раньше не трогаем. */
  private async copyMissing(
    siteId: string,
    names: string[],
  ): Promise<{
    present: Set<string>;
    added: string[];
    kept: number;
    skipped: SkippedSection[];
  }> {
    const shop = await this.sections.present(siteId);
    const present = new Set(shop.map((section) => section.name));
    const roles = new Map(
      shop.flatMap((section) =>
        section.role ? [[section.role, section.name] as const] : [],
      ),
    );
    const skipped: SkippedSection[] = [];
    const queue: string[] = [];
    let kept = 0;
    for (const name of names) {
      if (present.has(name)) {
        kept += 1;
        continue;
      }
      const section = this.library.get(name);
      if (!section) {
        skipped.push({
          name,
          title: name,
          reason: "секции нет в библиотеке платформы",
        });
        continue;
      }
      const holder = section.role ? roles.get(section.role) : undefined;
      if (holder !== undefined) {
        skipped.push({
          name,
          title: section.title,
          reason: `её роль уже у секции магазина «${holder}»`,
        });
        continue;
      }
      queue.push(name);
    }

    const added: string[] = [];
    const save = async (name: string): Promise<void> => {
      const section = this.library.get(name)!;
      const outcome = await this.sections.save(siteId, section.files);
      if (outcome.ok) {
        added.push(name);
        present.add(name);
      } else
        skipped.push({ name, title: section.title, reason: outcome.reason });
    };
    await inPool(queue, SKELETON_SAVE_CONCURRENCY, save);
    // Порядок в ответе — порядок раскладки, а не порядок, в котором успел сборщик.
    const order = (name: string): number => names.indexOf(name);
    added.sort((a, b) => order(a) - order(b));
    skipped.sort((a, b) => order(a.name) - order(b.name));
    return { present, added, kept, skipped };
  }
}

/** `work` по списку, не больше `size` разом. */
async function inPool<T>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
}
