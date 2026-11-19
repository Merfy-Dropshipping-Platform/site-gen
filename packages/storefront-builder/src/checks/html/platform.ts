// Секции платформы на странице (место `html`). Платформенная — библиотечная секция, которую в магазине не меняли
// (решение владельца 19.11): отпечаток её файлов есть в индексе библиотеки (`isLibrarySection` в storefront-sections).
// Роль секции (`data-role`) её не определяет: агент может написать свою корзину, и тогда находки в ней — его. Файлов в
// снимке нет, поэтому отбирает превью (`platformIdsOf` в `preview-sample.ts`) и кладёт id экземпляров в тег снимка.
import { parseSample } from '../../look/look-sample';

// id экземпляров (`data-section-id`) секций платформы на странице; тега нет — таких секций нет.
export const platformSections = (html: string): Set<string> => new Set(parseSample(html)?.platform ?? []);
