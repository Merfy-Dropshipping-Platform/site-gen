/**
 * Секция «Публикации» в сохранённой ревизии: категория → id блога (контракт
 * «Публикации», PUB-3; правила прежней миграции 0028).
 *
 * До 0027 секция выбирала записи по категории: publicationType / categoryFilter
 * = news | blog | articles (или русские подписи «Новости» | «Блог» | «Статьи»).
 * Категории стали блогами, и конструктор теперь пишет publicationSource = 'blog',
 * blogId = <id блога>. Здесь каждая такая секция на любой глубине документа
 * (pagesData.*.content, zones, корневой content) получает id блога своего
 * магазина: news → novosti, blog → blog, articles → stati; блога нет — блог по
 * умолчанию (novosti). Старые поля получают тот же id — так их понимает и рендер
 * витрины, и прежний конструктор.
 *
 * Не трогаем: секцию с publicationSource (уже новый формат), «Все публикации»
 * ('' / all), выбранную запись (id / slug), чужие блоки. Повторный перевод
 * ничего не меняет: id блога — не категория.
 */

/** Адреса блогов магазина → id блога (`blogs.handle` → `blogs.id`). */
export type BlogIdsByHandle = Readonly<Record<string, string>>;

/** Блог по умолчанию у каждого магазина (миграция 0027). */
export const DEFAULT_BLOG_HANDLE = "novosti";

/** Прежняя категория (в любом регистре, с пробелами по краям) → адрес блога. */
export const LEGACY_CATEGORY_BLOG_HANDLES: Readonly<Record<string, string>> = {
  news: "novosti",
  новости: "novosti",
  blog: "blog",
  блог: "blog",
  articles: "stati",
  статьи: "stati",
};

/**
 * Отбор ревизий на стороне Postgres (`data::text ~* …`): в документе есть
 * publicationType / categoryFilter с прежней категорией. Без учёта регистра;
 * заглавная буква русских подписей задана явно — `~*` складывает кириллицу
 * только при UTF-8 локали базы, а подписи пикера писались с заглавной.
 */
export const LEGACY_PUBLICATIONS_PATTERN =
  '"(publicationType|categoryFilter)": ?"(news|blog|articles|[нН]овости|[бБ]лог|[сС]татьи)"';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const legacyHandle = (value: unknown): string | undefined =>
  typeof value === "string"
    ? LEGACY_CATEGORY_BLOG_HANDLES[value.trim().toLowerCase()]
    : undefined;

/**
 * Категория секции так, как её читает сама секция (resolvePublicationsType):
 * непустой publicationType главнее categoryFilter.
 */
function sectionCategory(props: Record<string, unknown>): unknown {
  const type = props.publicationType;
  return typeof type === "string" && type.trim() ? type : props.categoryFilter;
}

function translateProps(
  props: Record<string, unknown>,
  blogIds: BlogIdsByHandle,
): Record<string, unknown> | null {
  if (Object.prototype.hasOwnProperty.call(props, "publicationSource"))
    return null;
  const handle = legacyHandle(sectionCategory(props));
  if (!handle) return null;
  const target = blogIds[handle] ?? blogIds[DEFAULT_BLOG_HANDLE];
  if (!target) return null;
  const next: Record<string, unknown> = {
    ...props,
    publicationSource: "blog",
    blogId: target,
    publicationType: target,
  };
  if (legacyHandle(props.categoryFilter)) next.categoryFilter = target;
  return next;
}

export interface BlogRefsResult<T> {
  /** Новый документ; без изменений — тот же объект, что пришёл. */
  data: T;
  /** Сколько секций переведено. */
  sections: number;
}

/** Переводит все секции «Публикации» документа ревизии; вход не мутирует. */
export function translatePublicationsBlogRefs<T>(
  doc: T,
  blogIds: BlogIdsByHandle,
): BlogRefsResult<T> {
  let sections = 0;

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      let changed = false;
      const out = node.map((item) => {
        const next = walk(item);
        if (next !== item) changed = true;
        return next;
      });
      return changed ? out : node;
    }
    if (!isRecord(node)) return node;

    let result: Record<string, unknown> = node;
    for (const [key, value] of Object.entries(node)) {
      const next = walk(value);
      if (next !== value) {
        if (result === node) result = { ...node };
        result[key] = next;
      }
    }

    if (result.type !== "Publications" || !isRecord(result.props))
      return result;
    const props = translateProps(result.props, blogIds);
    if (!props) return result;
    sections += 1;
    return { ...result, props };
  };

  return { data: walk(doc) as T, sections };
}
