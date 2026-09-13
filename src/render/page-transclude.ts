/**
 * Секция «Страница» (Page) — привязка к странице магазина.
 *
 * Панель отдаёт `pageId` (пикер «Выбор страницы», pageContentPicker): либо id
 * страницы конструктора (`page-about`, `page-contacts`, `page-custom-<uuid>`),
 * либо тип политики магазина (`refund` / `privacy` / `tos` / `shipping`).
 *
 * До 2026-09-13 это значение не доезжало до рендера НИГДЕ, кроме одной ветки
 * сборки (`build.service.ts`: policyByType), которая понимала только политики.
 * Превью игнорировало `pageId` целиком, и мерчант, выбрав страницу, продолжал
 * видеть старый (сид-дизайнерский) текст секции. Здесь — единственный резолвер
 * привязки, который зовут и превью, и сборка.
 *
 * Правило: привязка задана ⇒ заголовок и тело берутся ТОЛЬКО у выбранной
 * страницы. Страница пустая или удалена ⇒ пусто. Старый текст секции наружу
 * не протекает никогда — иначе мерчант видит данные, которых в админке нет.
 */

/** Заголовки платформенных политик (зеркало build.service POLICY_TITLE_MAP). */
const POLICY_TITLE_MAP: Record<string, string> = {
  refund: "Политика возврата",
  privacy: "Политика конфиденциальности",
  tos: "Условия обслуживания",
  shipping: "Политика доставки",
};

/** Заголовки системных контент-страниц (зеркало CONTENT_PAGE_TITLES). */
const SYSTEM_PAGE_TITLES: Record<string, string> = {
  "page-about": "О нас",
  "page-delivery": "Доставка",
  "page-contacts": "Контакты",
};

export type BoundPageContent = { heading: string; content: string };

export interface PageBindingSource {
  /** Данные ревизии сайта (`pages`, `pagesData`). */
  revision: Record<string, unknown> | null | undefined;
  /**
   * Политики магазина из site_policy (для pageId = refund/privacy/tos/shipping).
   *
   * `undefined` = «вызывающий политик не знает» → привязка к политике НЕ
   * трогается (её на живой сборке подставляет build.service до рендера, и
   * затирать её пустотой нельзя). Переданный массив (даже пустой) —
   * авторитетный источник.
   */
  policies?: Array<{ type?: unknown; content?: unknown }> | null;
  /** Страница, на которой стоит секция — защита от привязки самой к себе. */
  selfPageId?: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Plain-text политики (textarea админки) → безопасный HTML.
 * Дословно повторяет `policyTextToHtml` из build.service: двойной перенос —
 * новый абзац, одиночный — <br>, спецсимволы экранируются.
 */
export function policyTextToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p>${para
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function pageIdCandidates(pageId: string): string[] {
  const bare = pageId.startsWith("page-") ? pageId.slice("page-".length) : pageId;
  return Array.from(new Set([pageId, `page-${bare}`, bare]));
}

/** Имя страницы из метаданных ревизии (`pages[]`) либо системный заголовок. */
function pageTitle(revision: Record<string, unknown>, pageId: string): string {
  const pages = Array.isArray(revision.pages)
    ? (revision.pages as Array<Record<string, unknown>>)
    : [];
  const ids = new Set(pageIdCandidates(pageId));
  const meta = pages.find((p) => typeof p?.id === "string" && ids.has(p.id as string));
  if (meta && typeof meta.name === "string" && meta.name.trim()) return meta.name.trim();
  for (const id of ids) {
    if (SYSTEM_PAGE_TITLES[id]) return SYSTEM_PAGE_TITLES[id];
  }
  return "";
}

/** Блоки страницы из ревизии (`pagesData[<id>].content`). */
function pageBlocks(
  revision: Record<string, unknown>,
  pageId: string,
): Array<Record<string, unknown>> | null {
  const pagesData = isRecord(revision.pagesData) ? revision.pagesData : null;
  if (!pagesData) return null;
  for (const key of pageIdCandidates(pageId)) {
    const page = pagesData[key];
    if (!isRecord(page)) continue;
    const raw = page.content;
    const parsed =
      typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          })()
        : raw;
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  }
  return null;
}

/**
 * Контент привязанной страницы.
 *
 * `null` — привязки нет (свободный режим) или страница привязана сама к себе:
 * секция остаётся со своим heading/content (их мерчант правит прямо в секции).
 */
export function resolveBoundPage(
  pageId: unknown,
  source: PageBindingSource,
): BoundPageContent | null {
  const id = typeof pageId === "string" ? pageId.trim() : "";
  if (!id) return null;

  const self = typeof source.selfPageId === "string" ? source.selfPageId.trim() : "";
  if (self && pageIdCandidates(id).includes(self)) return null;

  // Политика магазина — живой текст из site_policy.
  if (POLICY_TITLE_MAP[id]) {
    if (source.policies === undefined) return null;
    const policy = (source.policies ?? []).find((p) => p?.type === id);
    const text = typeof policy?.content === "string" ? policy.content : "";
    return {
      heading: POLICY_TITLE_MAP[id],
      content: text.trim() ? policyTextToHtml(text) : "",
    };
  }

  const revision = isRecord(source.revision) ? source.revision : null;
  if (!revision) return { heading: "", content: "" };

  const blocks = pageBlocks(revision, id);
  if (!blocks) {
    // Страницы с таким id в ревизии нет — мерчант её удалил. Показываем пусто,
    // а НЕ старое содержимое секции.
    return { heading: "", content: "" };
  }

  const pageBlock = blocks.find((b) => b?.type === "Page" && isRecord(b.props));
  const props = isRecord(pageBlock?.props) ? (pageBlock!.props as Record<string, unknown>) : {};
  const heading =
    (typeof props.heading === "string" && props.heading.trim()) ||
    pageTitle(revision, id) ||
    "";
  const content = typeof props.content === "string" ? props.content : "";
  return { heading, content };
}

/**
 * Props секции «Страница» с подставленным контентом привязанной страницы.
 * Для остальных блоков и для свободного режима возвращает исходный объект.
 */
export function applyPageBinding(
  props: Record<string, unknown>,
  source: PageBindingSource,
): Record<string, unknown> {
  const bound = resolveBoundPage(props.pageId, {
    ...source,
    // Секция страницы «О нас», привязанная к «О нас», — это она сама.
    // Ловим и по id страницы, и по id самого блока (`Page-about`).
    selfPageId: source.selfPageId ?? selfPageIdFromBlockId(props.id),
  });
  if (!bound) return props;
  return { ...props, heading: bound.heading, content: bound.content };
}

/**
 * `Page-about` → `page-about`. Сид-страницы конструктора и миграции ревизий
 * кладут блоку детерминированный id вида `Page-<slug>` / `Page-page-<slug>`,
 * поэтому самопривязку видно и без знания текущей страницы (POST
 * /preview/block контекста страницы не передаёт).
 */
function selfPageIdFromBlockId(blockId: unknown): string | null {
  if (typeof blockId !== "string") return null;
  const m = /^Page-(.+)$/.exec(blockId.trim());
  if (!m) return null;
  const rest = m[1];
  return rest.startsWith("page-") ? rest : `page-${rest}`;
}
