/**
 * Правила записей и блогов без базы: адреса, анонс, переходы статусов,
 * проверка полей. Контракт «Публикации» (20.10.2026), PUB-3/4/7/10/11/12.
 */
import { PublicationError } from "./publications.errors";

export type PublicationStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "archived";

export const PUBLICATION_STATUSES: readonly PublicationStatus[] = [
  "draft",
  "scheduled",
  "published",
  "archived",
];

/** Адрес записи и блога: латиница, цифры, дефис между ними. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 200;
export const TITLE_MAX = 255;
export const BLOG_TITLE_MAX = 255;
export const EXCERPT_MAX = 500;
export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;
export const AUTO_EXCERPT_MAX = 200;

/** Блог по умолчанию — есть у каждого магазина. */
export const DEFAULT_BLOG = { title: "Новости", handle: "novosti" } as const;

/**
 * Устаревшие категории (до блогов) → блог. Та же таблица, что в миграции 0027.
 * Принимаются API на время выкатки и секцией «Публикации» в старых ревизиях.
 */
export const LEGACY_CATEGORY_BLOGS: Readonly<
  Record<string, { title: string; handle: string }>
> = {
  news: DEFAULT_BLOG,
  blog: { title: "Блог", handle: "blog" },
  articles: { title: "Статьи", handle: "stati" },
};

// --- Транслит и адреса ---

const CYRILLIC_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "j",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function transliterate(input: string): string {
  return input
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      return CYRILLIC_MAP[lower] ?? lower;
    })
    .join("");
}

/**
 * Адрес из заголовка: транслит, всё лишнее — в дефис, без дефисов по краям.
 * Результат проходит SLUG_PATTERN или пуст (в заголовке нет ни одной буквы/цифры).
 */
export function slugify(input: string): string {
  return transliterate(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .substring(0, SLUG_MAX)
    .replace(/^-+|-+$/g, "");
}

/** Адрес записи на витрине. Одна формула для API, редиректов и витрины. */
export function publicationPath(blogHandle: string, slug: string): string {
  return `/blogs/${blogHandle}/${slug}`;
}

// --- Анонс ---

/** Текст без HTML и лишних пробелов. */
export function plainText(html: string): string {
  return (
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      // Тег закрылся перед знаком препинания: «<b>мир</b>!» → «мир!».
      .replace(/ ([.,;:!?…)])/g, "$1")
      .trim()
  );
}

/**
 * Анонс для витрины и ответа API (`excerptAuto`): заданный продавцом — как есть;
 * иначе текст без HTML, обрезанный по границе слова до 200 знаков, с «…».
 */
export function autoExcerpt(
  content: string,
  excerpt: string | null | undefined,
): string {
  if (typeof excerpt === "string" && excerpt.trim()) return excerpt;
  const text = plainText(content ?? "");
  if (text.length <= AUTO_EXCERPT_MAX) return text;
  const head = text.slice(0, AUTO_EXCERPT_MAX);
  // Слово, разрезанное на границе, не показываем: срез до последнего пробела.
  // Если пробела нет вовсе (одно длинное слово) — режем по знаку.
  const nextIsBoundary = /\s/.test(text.charAt(AUTO_EXCERPT_MAX));
  const lastSpace = head.lastIndexOf(" ");
  const cut =
    nextIsBoundary || lastSpace <= 0 ? head : head.slice(0, lastSpace);
  return `${cut.replace(/[\s.,;:!?…—-]+$/u, "")}…`;
}

// --- Переходы статусов ---

const ALLOWED_TRANSITIONS: Record<PublicationStatus, PublicationStatus[]> = {
  draft: ["published", "scheduled"],
  scheduled: ["draft", "published"],
  published: ["archived", "draft"],
  archived: ["draft"],
};

const STATUS_LABEL: Record<PublicationStatus, string> = {
  draft: "Черновик",
  scheduled: "Запланирована",
  published: "Опубликована",
  archived: "В архиве",
};

const STATUS_ACTION: Record<PublicationStatus, string> = {
  draft: "вернуть в черновики",
  scheduled: "поставить в расписание",
  published: "опубликовать",
  archived: "отправить в архив",
};

function transitionHint(
  from: PublicationStatus,
  to: PublicationStatus,
): string {
  if (from === "published" && to === "scheduled") {
    return "Чтобы опубликовать её позже, сначала верните запись в черновики.";
  }
  if (from === "archived") {
    return "Сначала верните запись из архива в черновики.";
  }
  if (to === "archived") {
    return "В архив отправляется только опубликованная запись.";
  }
  return "Выберите другой статус.";
}

export function isPublicationStatus(
  value: unknown,
): value is PublicationStatus {
  return (
    typeof value === "string" &&
    (PUBLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransition(
  from: PublicationStatus,
  to: PublicationStatus,
): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

/** Запрещённый переход — 409 `publication_transition_not_allowed`. */
export function assertTransition(
  from: PublicationStatus,
  to: PublicationStatus,
): void {
  if (canTransition(from, to)) return;
  throw new PublicationError(
    "publication_transition_not_allowed",
    `Запись в статусе «${STATUS_LABEL[from]}» нельзя ${STATUS_ACTION[to]}. ${transitionHint(from, to)}`,
    { status: 409, field: "status" },
  );
}

// --- Проверка полей (400 `validation_failed`) ---

function invalid(field: string, message: string): PublicationError {
  return new PublicationError("validation_failed", message, {
    status: 400,
    field,
  });
}

export function requireTitle(
  value: unknown,
  field = "title",
  max = TITLE_MAX,
): string {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title) {
    throw invalid(
      field,
      field === "newBlogTitle"
        ? "Укажите название блога."
        : "Укажите заголовок записи.",
    );
  }
  if (title.length > max) {
    throw invalid(field, `Название длиннее ${max} знаков — сократите его.`);
  }
  return title;
}

export function validateSlug(value: unknown, field = "slug"): string {
  const slug = typeof value === "string" ? value.trim() : "";
  const what = field === "handle" ? "Адрес блога" : "Адрес записи";
  if (!slug) throw invalid(field, `${what} не может быть пустым.`);
  if (slug.length > SLUG_MAX) {
    throw invalid(field, `${what} длиннее ${SLUG_MAX} знаков — сократите его.`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw invalid(
      field,
      `${what} может содержать только строчные латинские буквы, цифры и дефис между ними, например «moya-zapis».`,
    );
  }
  return slug;
}

/**
 * Необязательный текст с пределом длины. undefined — поле не пришло (не
 * трогаем), null/пусто — «не задано» (храним null).
 */
export function optionalText(
  value: unknown,
  field: string,
  max: number,
  label: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw invalid(field, `${label}: ожидается текст.`);
  }
  if (!value.trim()) return null;
  if (value.length > max) {
    throw invalid(
      field,
      `${label} — не больше ${max} знаков, сейчас ${value.length}.`,
    );
  }
  return value;
}

export function parseStatus(value: unknown): PublicationStatus | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isPublicationStatus(value)) {
    throw invalid(
      "status",
      "Неизвестный статус записи. Допустимо: черновик, опубликована, по расписанию, в архиве.",
    );
  }
  return value;
}

/**
 * Дата публикации по расписанию. undefined — не пришла; null — очистить.
 */
export function parseScheduledAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw invalid("scheduledAt", "Дата публикации указана неверно.");
  }
  return date;
}

export function requireFutureSchedule(
  date: Date | null | undefined,
  now: Date,
): Date {
  if (!date) {
    throw invalid(
      "scheduledAt",
      "Укажите дату и время публикации для записи по расписанию.",
    );
  }
  if (date.getTime() <= now.getTime()) {
    throw invalid(
      "scheduledAt",
      "Время публикации уже прошло — выберите время в будущем.",
    );
  }
  return date;
}
