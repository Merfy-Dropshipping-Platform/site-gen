/**
 * Заготовка магазина в ревизии — чистая функция: документ → новый документ и отчёт (команда `PlaceSkeleton`).
 *
 * - Секции встают только в ПУСТЫЕ списки: где мерчант или ИИ уже что-то поставил, список не трогаем. Поэтому повтор
 *   ничего не меняет.
 * - Список заполняется, только когда в магазине есть все его секции: иначе он ждёт (`waiting`), и повтор после
 *   докопирования секций его заполнит.
 * - Экземпляр — как «Добавить секцию» в конструкторе: пустые настройки, блоки по умолчанию с id `<тип>-<n>`, id —
 *   имя секции и 8 случайных знаков. Секции с ролью («Уведомления», «Корзина-панель», «Баннер cookie») конструктор в
 *   «Поверх страниц» не предлагает, но заготовка кладёт их туда сама — так они стоят на эталоне.
 * - «О нас» — своя страница (строка `customPageOf`, пустое дерево, пункт в главном меню), как из кабинета; на ней
 *   секция «Страница» с заголовком.
 */
import { randomBytes, randomUUID } from "crypto";
import {
  customPageOf,
  withMenuItem,
  type Menu,
} from "../../pages/pages.service";
import type { Library, LibrarySection } from "./skeleton-library";
import {
  SHARED_LISTS,
  type SkeletonLayout,
  type SkeletonWrapper,
} from "./skeleton-layout";

const SHOP_PREFIX = "shop:";
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

type Doc = Record<string, unknown>;

export interface SkeletonInstance {
  id: string;
  section: string;
  settings: Record<string, unknown>;
  blocks?: { id: string; type: string; settings: Record<string, unknown> }[];
  /** Общие настройки экземпляра (`wrapper` ревизии) — только у экземпляров из `layout.wrappers`. */
  wrapper?: SkeletonWrapper;
}

export interface ListRef {
  /** Ключ в `sections` ревизии. */
  key: string;
  /** Название для мерчанта: «Главная», «Шапка». */
  label: string;
}

export interface SkeletonPlacement {
  /** Списки, в которые встали секции, и сколько секций. */
  filled: (ListRef & { sections: number })[];
  /** Списки, где секции уже были: не тронуты. */
  kept: ListRef[];
  /** Списки, для которых в магазине нет нужных секций: ждут повтора. */
  waiting: (ListRef & { missing: string[] })[];
  /** Ключи раскладки, которых нет в магазине (ни страницы, ни общего списка). */
  absent: string[];
  /** «О нас»: создана сейчас, уже была или ждёт секции «Страница». */
  about: "created" | "kept" | "waiting";
}

export interface SkeletonPlan {
  document: Doc;
  changed: boolean;
  placement: SkeletonPlacement;
}

export interface PlanInput {
  document: Doc;
  layout: SkeletonLayout;
  library: Library;
  /** Имена секций (без префикса), которые есть в магазине после копирования. */
  present: ReadonlySet<string>;
  /** Случайная часть id; тесты подставляют свою. */
  random?: () => string;
}

const isRecord = (value: unknown): value is Doc =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const randomPart = (): string =>
  Array.from(
    randomBytes(8),
    (byte) => ID_ALPHABET[byte % ID_ALPHABET.length],
  ).join("");

interface PageRow {
  id: string;
  name: string;
  slug?: string;
}

const pagesOf = (doc: Doc): PageRow[] =>
  (Array.isArray(doc.pages) ? doc.pages : []).flatMap((page: unknown) =>
    isRecord(page) && typeof page.id === "string"
      ? [
          {
            id: page.id,
            name: typeof page.name === "string" ? page.name : page.id,
            ...(typeof page.slug === "string" ? { slug: page.slug } : {}),
          },
        ]
      : [],
  );

const normalize = (text: string): string => text.trim().toLowerCase();

function labelOf(pages: PageRow[], key: string): string {
  return (
    SHARED_LISTS[key] ?? pages.find((page) => page.id === key)?.name ?? key
  );
}

/** Плановщик держит id всех экземпляров документа: новый id не совпадёт ни с одним. */
class Ids {
  private readonly taken = new Set<string>();

  constructor(
    sections: Record<string, unknown>,
    private readonly random: () => string,
  ) {
    for (const list of Object.values(sections))
      if (Array.isArray(list))
        for (const item of list)
          if (isRecord(item) && typeof item.id === "string")
            this.taken.add(item.id);
  }

  next(name: string): string {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 30)
        .replace(/^-+|-+$/g, "") || "section";
    let id = `${base}-${this.random()}`;
    while (this.taken.has(id)) id = `${base}-${this.random()}`;
    this.taken.add(id);
    return id;
  }
}

function instanceOf(
  section: LibrarySection,
  ids: Ids,
  settings: Record<string, unknown> = {},
  wrapper?: SkeletonWrapper,
): SkeletonInstance {
  return {
    id: ids.next(section.name),
    section: `${SHOP_PREFIX}${section.name}`,
    settings: { ...settings },
    ...(wrapper === undefined
      ? {}
      : { wrapper: { padding: { ...wrapper.padding } } }),
    ...(section.hasBlocks
      ? {
          blocks: section.defaultBlocks.map((block, index) => ({
            id: `${block.type}-${index + 1}`,
            type: block.type,
            settings: { ...block.settings },
          })),
        }
      : {}),
  };
}

const listLength = (sections: Record<string, unknown>, key: string): number => {
  const list = sections[key];
  return Array.isArray(list) ? list.length : 0;
};

export function planSkeleton(input: PlanInput): SkeletonPlan {
  const { layout, library, present } = input;
  const doc = input.document;
  const pages = pagesOf(doc);
  const sections: Record<string, unknown> = isRecord(doc.sections)
    ? { ...doc.sections }
    : {};
  const ids = new Ids(sections, input.random ?? randomPart);
  const placement: SkeletonPlacement = {
    filled: [],
    kept: [],
    waiting: [],
    absent: [],
    about: "kept",
  };
  const available = (name: string): LibrarySection | undefined =>
    present.has(name) ? library.get(name) : undefined;
  let changed = false;

  for (const [key, names] of Object.entries(layout.lists)) {
    const label = labelOf(pages, key);
    if (!(key in SHARED_LISTS) && !pages.some((page) => page.id === key)) {
      placement.absent.push(key);
      continue;
    }
    if (listLength(sections, key) > 0) {
      placement.kept.push({ key, label });
      continue;
    }
    const missing = names.filter((name) => available(name) === undefined);
    if (missing.length > 0) {
      placement.waiting.push({ key, label, missing });
      continue;
    }
    sections[key] = names.map((name) =>
      instanceOf(library.get(name)!, ids, {}, layout.wrappers?.[key]?.[name]),
    );
    placement.filled.push({ key, label, sections: names.length });
    changed = true;
  }

  const about = layout.about;
  const aboutSection = available(about.section);
  const existing = pages.find(
    (page) =>
      (page.slug !== undefined &&
        normalize(page.slug) === normalize(about.slug)) ||
      normalize(page.name) === normalize(about.name),
  );
  let next: Doc = doc;
  if (existing) {
    if (listLength(sections, existing.id) > 0)
      placement.kept.push({ key: existing.id, label: existing.name });
    else if (!aboutSection)
      placement.waiting.push({
        key: existing.id,
        label: existing.name,
        missing: [about.section],
      });
    else {
      sections[existing.id] = [instanceOf(aboutSection, ids, about.settings)];
      placement.filled.push({
        key: existing.id,
        label: existing.name,
        sections: 1,
      });
      changed = true;
    }
  } else if (!aboutSection) {
    placement.about = "waiting";
  } else {
    const id = `page-custom-${randomUUID()}`;
    sections[id] = [instanceOf(aboutSection, ids, about.settings)];
    const menus: Menu[] = Array.isArray(doc.menus) ? (doc.menus as Menu[]) : [];
    next = {
      ...doc,
      pages: [
        ...(Array.isArray(doc.pages) ? doc.pages : []),
        customPageOf(id, about.name, about.slug),
      ],
      pagesData: {
        ...(isRecord(doc.pagesData) ? doc.pagesData : {}),
        [id]: {
          content: [],
          root: { props: { title: about.name } },
          zones: {},
        },
      },
      menus: withMenuItem(menus, { label: about.name, url: about.slug }),
    };
    placement.about = "created";
    placement.filled.push({ key: id, label: about.name, sections: 1 });
    changed = true;
  }

  if (!changed) return { document: doc, changed, placement };
  const lockVersion = typeof doc.lockVersion === "number" ? doc.lockVersion : 1;
  return {
    document: { ...next, sections, lockVersion: lockVersion + 1 },
    changed,
    placement,
  };
}
