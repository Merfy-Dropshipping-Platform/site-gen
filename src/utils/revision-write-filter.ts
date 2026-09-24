/**
 * B17 — сервер решает, что из присланного конструктором является правкой
 * мерчанта, а что — его же собственным сидом.
 *
 * Как ломалось. `getRevision` отдаёт ревизию ДОСЕЯННОЙ: `migrateRevisionData`
 * (revision-migrations.ts) создаёт на лету каталог, товар, корзину, чекаут,
 * страницы аккаунта и «спасибо за заказ», а `normalizeRevision` домёрдживает
 * метаданные страниц из манифеста темы. Конструктор шлёт полученное обратно
 * ЦЕЛИКОМ (`pagesData` без фильтра), а `createRevision` пишет payload дословно.
 * В результате одно нажатие «Сохранить» вмораживает в ревизию до одиннадцати
 * страниц, которых мерчант не открывал. После этого `extractPageBlocks`
 * (themes/page-blocks.ts) перестаёт брать страницу из пакета темы — ветка
 * lazy-seed работает ТОЛЬКО когда `pagesData[page]` отсутствует, — и правки
 * `theme.json` до этой страницы больше не доходят никогда.
 *
 * Как чинится. Перед записью сервер восстанавливает СВОЙ эталон: прогоняет
 * `migrateRevisionData` по ревизии, из которой убраны все досеиваемые страницы,
 * и получает канонический сид каждой из них. Страница, чьё ТЕЛО совпадает с
 * эталоном, в ревизию не пишется — она и так будет досеяна на чтении и на
 * сборке, зато остаётся живой связь с пакетом темы.
 *
 * Почему сравнивается только тело. Шапка, промо-баннер и подвал — производные
 * от главной: их раскатывает `unifyHeaderWithHome` на чтении и
 * `syncSharedSections` в конструкторе на каждом сохранении. Любая правка
 * логотипа или названия магазина меняет их копии на ВСЕХ страницах разом, и
 * сравнение «по всей странице» считало бы правкой мерчанта каждую из них.
 * Признаком намерения мерчанта служат только неслужебные блоки.
 *
 * Обратная совместимость. Правило одинаково работает в обе стороны: страница,
 * УЖЕ вмороженная прошлыми сохранениями, тоже совпадёт с эталоном и будет
 * убрана из ревизии — магазины размораживаются сами на первой же записи, без
 * миграции БД. Всё, что от эталона отличается, остаётся нетронутым.
 */
import { migrateRevisionData } from './revision-migrations';
import { resolveAssetUrls } from '../themes/asset-resolver';
import { seedContentPagesFromTheme } from '../themes/content-page-seed';

type Block = { type?: string; props?: Record<string, unknown> };
type PageData = { content?: Block[]; root?: unknown; zones?: unknown };

/**
 * Служебные блоки-обёртки страницы. Их содержимое задаётся на главной и
 * копируется на остальные страницы автоматически, поэтому оно не является
 * свидетельством того, что мерчант эту страницу открывал.
 */
const CHROME_TYPES = new Set(['PromoBanner', 'Header', 'CheckoutHeader', 'Footer']);

/**
 * Контент-страницы: их тело сидирует КЛИЕНТ (constructor `seedContentPages`,
 * pupaMigrate.ts) пустым блоком «Страница», а сервер — `migrateContentPages`,
 * который подставляет заголовок темы и тот же пустой текст. Сервер такую
 * страницу с нуля не порождает, эталона для неё нет, поэтому пустой сид
 * распознаётся отдельным правилом (см. isEmptyContentPageSeed).
 */
const CONTENT_PAGE_TITLES: Record<string, string> = {
  'page-about': 'О нас',
  'page-delivery': 'Доставка',
  'page-contacts': 'Контакты',
};

export interface WriteFilterResult {
  /** Ревизия в том виде, в каком её следует записать. */
  data: Record<string, unknown>;
  /** Страницы, которые сохранение вморозило бы впервые. */
  dropped: string[];
  /** Страницы, вмороженные прошлыми сохранениями и освобождённые этой записью. */
  unfrozen: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Стабильная сериализация: порядок ключей не должен влиять на сравнение. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = stable(value[k]);
    return out;
  }
  return value;
}

/**
 * Отпечаток тела страницы: неслужебные блоки без `props.id`.
 *
 * `id` выбрасывается намеренно — серверные сидеры штампуют его через
 * `Date.now()`, поэтому два последовательных чтения ОДНОЙ И ТОЙ ЖЕ ревизии
 * дают разные id (проверено на проде: два GET подряд возвращают
 * `AccountSection-1789476652608` и `AccountSection-1789476692369`).
 * Сравнение с учётом id не совпало бы никогда.
 */
function bodyFingerprint(page: unknown): string | null {
  if (!isPlainObject(page)) return null;
  const content = (page as PageData).content;
  if (!Array.isArray(content)) return null;
  const body = content
    .filter((b) => b && !CHROME_TYPES.has(String(b.type)))
    .map((b) => {
      const props = { ...(b.props ?? {}) };
      delete props.id;
      return { type: b.type, props: stable(props) };
    });
  return JSON.stringify(body);
}

/** Пустая контент-страница, какой её кладут клиентский и серверный сид. */
function isEmptyContentPageSeed(pageId: string, page: unknown): boolean {
  const title = CONTENT_PAGE_TITLES[pageId];
  if (title === undefined) return false;
  if (!isPlainObject(page)) return false;
  const content = (page as PageData).content;
  if (!Array.isArray(content)) return false;
  const body = content.filter((b) => b && !CHROME_TYPES.has(String(b.type)));
  if (body.length !== 1) return false;
  const only = body[0];
  if (only.type !== 'Page') return false;
  const props = only.props ?? {};
  const text = String(props.content ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  if (text !== '') return false;
  // Блок «Страница», привязанный к политике магазина, пустым не является:
  // текст ему подставляет build-пайплайн из site_policy.
  if (String(props.pageId ?? '') !== '') return false;
  const heading = String(props.heading ?? '').trim();
  return heading === '' || heading === title;
}

/**
 * Эталон сида: что сервер досеет в ревизию, где нет ни одной досеиваемой
 * страницы. Считается по СОХРАНЁННОЙ ревизии, а не по входящей, — иначе
 * эталон вычислялся бы из тех же данных, что проверяем.
 *
 * Экспортирован для записи с базой (этап 2, `src/content/`): там одним и тем
 * же эталоном фильтруются три документа — база, текущая и входящая.
 */
export async function buildSeedReference(
  storedPrev: Record<string, unknown> | null | undefined,
  themeId: string | null,
  publicUrl: string | null | undefined,
): Promise<Record<string, unknown>> {
  const stored = isPlainObject(storedPrev) ? storedPrev : {};
  const storedPages = isPlainObject(stored.pagesData) ? stored.pagesData : {};
  const home = storedPages['home'];
  // Первый прогон — только с главной: его ключи и есть множество страниц,
  // которые сервер умеет породить сам.
  const seeded = migrateRevisionData(
    { ...stored, pagesData: home === undefined ? {} : { home } },
    themeId,
  );
  // Контент-страницы приходят не из migrateRevisionData, а из пакета темы —
  // эталон обязан строиться тем же путём, каким они уезжают клиенту.
  const withContentPages = await seedContentPagesFromTheme(seeded, themeId);
  return resolveAssetUrls(withContentPages, publicUrl) as Record<string, unknown>;
}

export async function filterSeededPagesOnWrite(
  incoming: Record<string, unknown>,
  storedPrev: Record<string, unknown> | null | undefined,
  themeId: string | null,
  publicUrl?: string | null,
): Promise<WriteFilterResult> {
  if (!isPlainObject(incoming) || !isPlainObject(incoming.pagesData)) {
    return { data: incoming, dropped: [], unfrozen: [] };
  }
  let reference: Record<string, unknown>;
  try {
    reference = await buildSeedReference(storedPrev, themeId, publicUrl);
  } catch {
    // Эталон не построился — ничего не выбрасываем. Потеря данных хуже,
    // чем лишняя вмороженная страница.
    return { data: incoming, dropped: [], unfrozen: [] };
  }
  return applySeedFilter(incoming, reference, storedPrev);
}

/** Тот же фильтр по уже построенному эталону (`buildSeedReference`). */
export function applySeedFilter(
  incoming: Record<string, unknown>,
  reference: Record<string, unknown>,
  storedPrev: Record<string, unknown> | null | undefined,
): WriteFilterResult {
  if (!isPlainObject(incoming) || !isPlainObject(incoming.pagesData)) {
    return { data: incoming, dropped: [], unfrozen: [] };
  }
  const incomingPages = incoming.pagesData as Record<string, unknown>;
  const storedPages = isPlainObject(storedPrev?.pagesData)
    ? (storedPrev!.pagesData as Record<string, unknown>)
    : {};
  const referencePages = isPlainObject(reference.pagesData)
    ? (reference.pagesData as Record<string, unknown>)
    : {};

  const nextPages: Record<string, unknown> = {};
  const dropped: string[] = [];
  const unfrozen: string[] = [];

  for (const [pageId, page] of Object.entries(incomingPages)) {
    // Главная — единственный источник правды по хрому, её не трогаем никогда.
    // Служебные ключи pagesData (напр. `_vanillaHomeMigrationVersion`: number)
    // страницами не являются и проходят насквозь.
    if (pageId === 'home' || !isPlainObject(page)) {
      nextPages[pageId] = page;
      continue;
    }

    const refPage = referencePages[pageId];
    const isSeed =
      (refPage !== undefined &&
        bodyFingerprint(page) !== null &&
        bodyFingerprint(page) === bodyFingerprint(refPage)) ||
      isEmptyContentPageSeed(pageId, page);

    if (!isSeed) {
      nextPages[pageId] = page;
      continue;
    }
    // Страница = сид. В ревизию не пишем: и чтение, и сборка витрины возьмут
    // её из пакета темы, значит правки темы до неё продолжат доходить.
    if (storedPages[pageId] === undefined) dropped.push(pageId);
    else unfrozen.push(pageId);
  }

  return {
    data: { ...incoming, pagesData: nextPages },
    dropped,
    unfrozen,
  };
}
