/**
 * next-path — куда вести покупателя после входа по ссылке из письма.
 *
 * Ядро (спека 120, 2.6) ставит в ссылку входа `/verify?token=…&next=<путь>`:
 * кнопка письма расширения ведёт, например, в «Мои заказы». Страница входа
 * темы читает `next` и после входа идёт туда. Верим только своему пути сайта:
 * `/…`, но не `//…` и не `/\…` (браузер прочёл бы их как чужой хост), без
 * пробелов и управляющих символов. Иначе — в кабинет, как раньше.
 */
import { sitePath } from "./extension-call";

export const DEFAULT_NEXT_PATH = "/account";

/** Путь из `?next=` страницы входа; чужой адрес или нет параметра — `/account`. */
export function nextPathOf(search: string): string {
  const raw = new URLSearchParams(search).get("next");
  return sitePath(raw) ?? DEFAULT_NEXT_PATH;
}
