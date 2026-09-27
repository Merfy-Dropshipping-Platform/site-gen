/**
 * Гашение перехода по ссылке в превью конструктора — ОДНА функция для всех
 * ссылок витрины, которые ведут на страницы магазина, которых в конструкторе
 * может не быть (политики: баннер cookie — runtime/cookie-consent.ts,
 * юридическая строка «Спасибо»/чекаута — runtime/legal-links.ts).
 *
 * Навигация конструктора по неизвестному адресу АВТОСОЗДАЁТ страницу
 * (SiteConstructor.autoCreatePageFromPath), а мусорная страница в сайте
 * продавца хуже, чем ссылка без перехода в режиме редактирования. Поэтому в
 * iframe превью нажатие на ссылку `selector` гасится: слушатель на window в
 * фазе захвата — раньше агента превью, который слушает document. На витрине
 * (не iframe) переход обычный.
 *
 * Функция самодостаточна (ни импортов, ни внешних имён): модульный скрипт
 * зовёт её напрямую, встроенный скрипт блока получает её исходником
 * (`.toString()`, второй копии нет). Вешать ОДИН раз на окно — отвечает
 * вызывающий (у каждого свой признак «уже повешено»).
 */
export function guardPreviewClicks(win: Window, selector: string): void {
  function isPreviewFrame(): boolean {
    try {
      return win.self !== win.top;
    } catch (e) {
      return true;
    }
  }
  win.addEventListener(
    "click",
    function (event) {
      const target = event.target as Element | null;
      const hit = target && typeof target.closest === "function" && target.closest(selector);
      if (!hit || !isPreviewFrame()) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}
