// Секция любого автора (design.md блока 7, С7-15 Б): автор пишет mount и unmount, запускает секцию ядро. Модуль секции
// отдаёт определение по умолчанию: export default defineSection({ mount, unmount }). Имя секции даёт список модулей
// страницы, а не код: секция не назовётся чужим именем. Договор ядро ↔ секция целиком — следующая часть (API); здесь —
// запуск и снятие. saveState — для замены кода в превью (С7-22 В): что отдать новой версии секции.
export interface SectionContext {
  // Имя с приставкой автора: nova:scarf-colors (п. 22).
  name: string;
  // Состояние от прошлой версии кода — только в превью при замене (С7-22 В); на витрине всегда undefined.
  state: unknown;
}

export interface SectionDefinition {
  mount: (element: HTMLElement, context: SectionContext) => void | Promise<void>;
  unmount?: (element: HTMLElement) => void | Promise<void>;
  saveState?: (element: HTMLElement) => unknown;
}

export const defineSection = (definition: SectionDefinition): SectionDefinition => definition;

const isFunctionAt = (value: object, key: string): boolean => typeof Reflect.get(value, key) === 'function';
const isOptionalFunctionAt = (value: object, key: string): boolean =>
  Reflect.get(value, key) === undefined || isFunctionAt(value, key);

// Модуль секции пишут разные авторы: определение проверяем по форме, а не по тому, чем его создали.
export function isSectionDefinition(value: unknown): value is SectionDefinition {
  if (typeof value !== 'object' || value === null) return false;
  return (
    isFunctionAt(value, 'mount') && isOptionalFunctionAt(value, 'unmount') && isOptionalFunctionAt(value, 'saveState')
  );
}
