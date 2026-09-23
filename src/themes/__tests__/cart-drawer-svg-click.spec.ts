/**
 * @jest-environment jsdom
 *
 * Выдвижная корзина открывается нажатием прямо в картинку иконки корзины.
 *
 * Иконка корзины в шапке — <button data-cart-open> с <svg> внутри, и нажатие
 * приходится на svg (или его <path>). Обработчик выдвижной корзины начинался с
 * `if (!(target instanceof HTMLElement)) return;` — svg не HTMLElement, и
 * нажатие отбрасывалось: корзина открывалась, только если попасть в поля
 * кнопки. Темы обходили это каждая у себя (перехватчик раскладки шлёт
 * «<тема>:cart:open»), у rose обход потерялся: на стенде 23.09 иконка не
 * открывала корзину вовсе, а с ней — и «Продолжить покупки» пустой корзины.
 * Теперь обработчик берёт любой Element и работает без обходов.
 *
 * Проверка — настоящий встроенный скрипт обеих выдвижных корзин (общей
 * SchemeCartDrawer — rose/bloom/satin/flux — и vanilla) из исходника, в jsdom:
 * нажатие в <path> svg иконки открывает, «Закрыть» — закрывает.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const ВЫДВИЖНЫЕ = [
  "packages/theme-base/primitives/SchemeCartDrawer.astro",
  "themes/vanilla/src/components/VanillaCartDrawer.astro",
];

/**
 * Встроенный скрипт выдвижной (`is:inline define:vars`) — так, как его
 * исполняет Astro: переменные становятся константами перед телом. У каждой
 * выдвижной свой корень, чтобы слушатели прошлой не отвечали за следующую.
 */
function запустить(файл: string, rootId: string): void {
  const код = readFileSync(resolve(SITES_ROOT, файл), "utf-8");
  const тело =
    /<script is:inline define:vars=\{\{[^}]*\}\}>([\s\S]*?)<\/script>/.exec(
      код,
    )?.[1];
  if (!тело) throw new Error(`${файл}: нет встроенного скрипта`);
  const переменные = {
    rootId,
    evOpen: `${rootId}:open`,
    evClose: `${rootId}:close`,
    evToggle: `${rootId}:toggle`,
  };
  const константы = Object.entries(переменные)
    .map(([имя, значение]) => `const ${имя} = ${JSON.stringify(значение)};`)
    .join("\n");
  (0, eval)(`(function () {\n${константы}\n${тело}\n})();`);
}

const нажать = (el: Element | null) =>
  el?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );

describe.each(ВЫДВИЖНЫЕ)("выдвижная корзина %s", (файл) => {
  it("нажатие в svg иконки корзины открывает, «Закрыть» — закрывает", () => {
    const id = `drawer-${ВЫДВИЖНЫЕ.indexOf(файл)}`;
    document.body.innerHTML = `
      <header>
        <button type="button" data-cart-open aria-label="Корзина">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0h24v24H0z"></path></svg>
        </button>
      </header>
      <div id="${id}" data-state="closed" aria-hidden="true">
        <aside data-state="closed" role="dialog">
          <button type="button" data-cart-close>Закрыть</button>
        </aside>
      </div>`;
    запустить(файл, id);
    const состояние = () => document.getElementById(id)?.dataset.state;

    const картинка = document.querySelector("[data-cart-open] path");
    нажать(картинка);
    const послеИконки = состояние();
    нажать(document.querySelector("[data-cart-close]"));

    expect({
      картинкаНеHtml: !(картинка instanceof HTMLElement),
      послеИконки,
      послеЗакрыть: состояние(),
    }).toEqual({
      картинкаНеHtml: true,
      послеИконки: "open",
      послеЗакрыть: "closed",
    });
  });
});
