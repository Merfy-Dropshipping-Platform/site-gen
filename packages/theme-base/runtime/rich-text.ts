import sanitizeHtml from 'sanitize-html';

/**
 * Inline rich-text sanitizer для заголовков/подзаголовков секций.
 *
 * Конструктор (кнопки «Курсив»/«Жирный» в AITextInput) оборачивает ВСЁ поле в
 * `<em>…</em>` / `<strong>…</strong>` и сохраняет строку в ревизию. Astro по
 * умолчанию экранирует `{value}` → на витрине/превью показывались сырые теги
 * («<EM>ТЕКСТ</EM>»). Рендерим такое поле через `set:html={sanitizeInline(v)}` —
 * разрешаем ТОЛЬКО инлайн-форматирование, всё прочее (script/style, on*-хендлеры,
 * атрибуты, блочные теги) вырезается. Plain-текст проходит как есть (спецсимволы
 * экранируются sanitize-html) — поведение для обычных заголовков не меняется.
 */
const INLINE_TAGS = ['strong', 'b', 'em', 'i', 'u', 's', 'br'];

export function sanitizeInline(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  return sanitizeHtml(value, {
    allowedTags: INLINE_TAGS,
    allowedAttributes: {},
    // script/style и их содержимое вырезаются (nonTextTags по умолчанию),
    // прочие неразрешённые теги отбрасываются, но их текст сохраняется.
    disallowedTagsMode: 'discard',
  });
}

/**
 * Схемы ссылок, которым мы доверяем. Один список на ОБА стока — HTML
 * (`sanitizeInlineWithLinks`) и голый атрибут (`safeHref`), иначе они
 * разъедутся. Дословно совпадает с `Page.sanitize.ts` (render-side XSS-гейт
 * блока «Страница»): `javascript:`, `data:`, `vbscript:` не проходят,
 * относительные ссылки (`/legal/terms`, `#anchor`) — проходят.
 */
const SAFE_SCHEMES = ['http', 'https', 'mailto', 'tel'];

/**
 * Inline rich-text + ССЫЛКИ. Родной брат `sanitizeInline` для полей, где ссылки
 * нужны по назначению: «Условия» чекаута (`[текст](url)` из настройки мерчанта).
 *
 * Зачем отдельная функция, а не расширение `sanitizeInline`: заголовкам секций
 * ссылки не нужны, и разрешать им `<a href>` — расширять поверхность атаки там,
 * где она сейчас нулевая.
 *
 * Ссылку жёстко «раздеваем» (модель — `Page.sanitize.ts`): остаётся только
 * href из доверенной схемы, `target="_blank"` докладывает `rel`, класс ставит
 * РЕНДЕР (параметр `linkClass`), а не разметка мерчанта — иначе через class
 * можно утащить оформление чужой темы.
 *
 * @param linkClass класс, который навесить на все ссылки (из *.classes.ts блока).
 */
export function sanitizeInlineWithLinks(value: unknown, linkClass = ''): string {
  if (typeof value !== 'string' || !value) return '';
  return sanitizeHtml(value, {
    allowedTags: [...INLINE_TAGS, 'a'],
    // `class` в списке только потому, что его ставит НАШ transformTags ниже:
    // фильтр атрибутов отрабатывает ПОСЛЕ трансформации, и без разрешения
    // наш же класс вырезался бы. Мерчантский class сюда не попадает — transform
    // собирает набор атрибутов с нуля и чужой class не копирует.
    allowedAttributes: { a: ['href', 'target', 'rel', 'class'] },
    allowedSchemes: SAFE_SCHEMES,
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tagName, attribs) => {
        const out: Record<string, string> = {};
        if (typeof attribs.href === 'string') out.href = attribs.href;
        if (attribs.target === '_blank') {
          out.target = '_blank';
          out.rel = 'noopener noreferrer';
        }
        if (linkClass) out.class = linkClass;
        return { tagName: 'a', attribs: out };
      },
    },
  });
}

/**
 * Значение мерчанта, уходящее в АТРИБУТ ссылки (`<a href={…}>`).
 *
 * Astro экранирует значение атрибута, поэтому «вылезти» из него нельзя — но
 * схему он не проверяет, и `javascript:alert(1)` в поле «URL авторизации»
 * остаётся кликабельной хранимой XSS в адрес покупателя. Санитайзер разметки
 * тут не применить (значение не HTML), поэтому сверяем схему по тому же
 * `SAFE_SCHEMES`.
 *
 * Не-строка, пусто или недоверенная схема → `'#'` (ссылка видна и безопасна;
 * выбрасывать её целиком нельзя — вёрстка блока рассчитывает на элемент).
 */
export function safeHref(value: unknown): string {
  if (typeof value !== 'string') return '#';
  const raw = value.trim();
  if (!raw) return '#';
  // Протокол-относительный `//evil.example` схемы не имеет, но уводит на чужой
  // хост — не пропускаем (allowProtocolRelative: false у санитайзера разметки).
  if (raw.startsWith('//')) return '#';
  // Управляющие символы внутри схемы (`java\tscript:`) браузер игнорирует —
  // выкусываем их перед сверкой, иначе проверка обходится одним табом.
  const probe = raw.replace(/[\u0000-\u0020]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)?.[1];
  if (!scheme) return raw; // относительная ссылка или #anchor
  return SAFE_SCHEMES.includes(scheme.toLowerCase()) ? raw : '#';
}
