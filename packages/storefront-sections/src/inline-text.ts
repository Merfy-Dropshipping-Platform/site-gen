import sanitizeHtml from 'sanitize-html';

// Текст с начертаниями (базовые секции, этап 0, E14; как aiText пяти тем на проде): значение строки и абзаца с
// подсказкой ai — HTML, в котором можно только <em> и <strong> без атрибутов; их ставят кнопки «К» и «Ж» конструктора.
// Остальные теги вырезаются (текст внутри остаётся, у script, style и им подобных — уходит вместе с тегом), атрибуты
// снимаются, знаки <, > и & текста становятся сущностями; повторная очистка ничего не меняет. Очищает одна функция в
// двух местах: sites — при записи ревизии (src/content/section-text.ts: через запись идут и конструктор, и MCP) и
// сборщик — при сведении значений перед рендером (settings.ts). Шаблон выводит такое поле через set:html (set-html.ts).
// Модуль не импортирует ничего из пакета: его импортирует sites (CommonJS) относительным путём.
export const INLINE_TAGS = ['em', 'strong'] as const;

const OPTIONS: sanitizeHtml.IOptions = { allowedTags: [...INLINE_TAGS], allowedAttributes: {} };

export const cleanInlineText = (value: string): string => sanitizeHtml(value, OPTIONS);

// Вид настройки с начертаниями: string или text с подсказкой ai.
export const isInlineTextSpec = (spec: { kind: unknown; ai?: unknown }): boolean =>
  (spec.kind === 'string' || spec.kind === 'text') && spec.ai !== undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// id полей с начертаниями в списке полей section.json (сырой JSON: так его читает sites из storefront_section).
function inlineIdsOf(fields: unknown): ReadonlySet<string> {
  if (!Array.isArray(fields)) return new Set();
  return new Set(
    fields.flatMap((field) =>
      isRecord(field) &&
      typeof field.id === 'string' &&
      isRecord(field.setting) &&
      isInlineTextSpec({ kind: field.setting.kind, ai: field.setting.ai })
        ? [field.id]
        : [],
    ),
  );
}

// Значения настроек с очищенными полями с начертаниями; не объект — как есть (форму проверяет сборщик).
function cleanValues(values: unknown, ids: ReadonlySet<string>): unknown {
  if (!isRecord(values) || ids.size === 0) return values;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      ids.has(key) && typeof value === 'string' ? cleanInlineText(value) : value,
    ]),
  );
}

// Экземпляр секции в ревизии с очищенными полями с начертаниями: settings секции и settings каждого блока по полям его
// типа. Манифест и экземпляр — сырой JSON; чего нет или не той формы — остаётся как есть.
export function cleanInstanceInlineText(manifest: unknown, instance: unknown): unknown {
  if (!isRecord(manifest) || !isRecord(instance)) return instance;
  const types = isRecord(manifest.blocks) ? manifest.blocks : {};
  const blockIds = (type: unknown): ReadonlySet<string> => {
    const blockType = typeof type === 'string' ? types[type] : undefined;
    return isRecord(blockType) ? inlineIdsOf(blockType.settings) : new Set();
  };
  const cleaned: Record<string, unknown> = { ...instance };
  if ('settings' in instance) cleaned.settings = cleanValues(instance.settings, inlineIdsOf(manifest.settings));
  const blocks: unknown = instance.blocks;
  if (Array.isArray(blocks))
    cleaned.blocks = blocks.map((block: unknown) =>
      isRecord(block) && 'settings' in block
        ? { ...block, settings: cleanValues(block.settings, blockIds(block.type)) }
        : block,
    );
  return cleaned;
}
