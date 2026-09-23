/**
 * Чистые функции блока расширения внутри текста политики магазина.
 *
 * Платформа получает механизм расширений (другой сервис — `extensions`).
 * При включении расширения на магазине оно просит sites дописать в текст
 * политики свой блок (цель обработки персональных данных -> privacy,
 * правила программы -> tos); при выключении — убрать. Ядро sites ничего не
 * знает о конкретных расширениях — только про формат маркеров:
 *
 *   <!-- ext:<extensionId> -->
 *   <текст блока>
 *   <!-- /ext:<extensionId> -->
 *
 * Без Nest, без побочных эффектов, без обращений к БД.
 */

const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9-]{2,31}$/;

function assertValidExtensionId(extensionId: string): void {
  if (!EXTENSION_ID_PATTERN.test(extensionId)) {
    throw new Error("invalid extension id");
  }
}

function openMarker(extensionId: string): string {
  return `<!-- ext:${extensionId} -->`;
}

function closeMarker(extensionId: string): string {
  return `<!-- /ext:${extensionId} -->`;
}

/** Новый RegExp на каждый вызов -- без общего lastIndex между проверками. */
function blockRegExp(extensionId: string): RegExp {
  return new RegExp(
    `${openMarker(extensionId)}\\n[\\s\\S]*?\\n${closeMarker(extensionId)}`,
    "g",
  );
}

function buildBlock(extensionId: string, text: string): string {
  return `${openMarker(extensionId)}\n${text}\n${closeMarker(extensionId)}`;
}

/** Схлопывает 3+ переводов строки в один пустой разделитель, обрезает края. */
function normalizeBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Есть ли в тексте политики блок расширения с данным id.
 */
export function hasExtensionBlock(
  content: string,
  extensionId: string,
): boolean {
  assertValidExtensionId(extensionId);
  return blockRegExp(extensionId).test(content);
}

/**
 * Вставить, заменить или убрать блок расширения в тексте политики.
 *
 * - `text` — строка: блок вставляется в конец текста (через пустую строку),
 *   либо, если блок с этим id уже есть, заменяется на месте (текст других
 *   блоков не трогается).
 * - `text === null`: блок убирается вместе с лишними пустыми строками,
 *   которые он оставил бы после себя. Если блока с этим id и так нет —
 *   контент возвращается без изменений.
 * - Идемпотентно: повторный вызов с теми же аргументами не меняет результат.
 */
export function setExtensionBlock(
  content: string,
  extensionId: string,
  text: string | null,
): string {
  assertValidExtensionId(extensionId);

  const exists = blockRegExp(extensionId).test(content);

  if (text === null) {
    if (!exists) return content;
    return normalizeBlankLines(content.replace(blockRegExp(extensionId), ""));
  }

  const block = buildBlock(extensionId, text);

  if (exists) {
    return content.replace(blockRegExp(extensionId), block);
  }

  const base = content.trimEnd();
  return base === "" ? block : `${base}\n\n${block}`;
}
