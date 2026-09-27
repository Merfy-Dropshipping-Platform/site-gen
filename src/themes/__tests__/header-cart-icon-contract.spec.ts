/**
 * Иконка корзины в шапке — `<button data-cart-open>` во всех темах.
 *
 * Тестировщик: «если выбрать сайдбар, всё равно открывается страница». Настройка
 * темы «Корзина → Сайдбар/Страница» живёт в `--cart-type`, а решает её по клику
 * договор `[data-cart-open]`: шторка темы открывается по нему, перехватчик в
 * Layout темы при «Страница» уводит на /cart, nav-агент превью конструктора при
 * «Сайдбар» пропускает клик к шторке (preview.service.ts). У vanilla иконка была
 * `<a href="/cart">`: агент превью принимал её за обычную ссылку и уводил
 * конструктор на страницу корзины даже при «Сайдбар», поверх открытой шторки.
 *
 * Шапка рендерится тем же рендером, что витрина (renderSections, живая цепочка).
 */
import { parse, type HTMLElement } from "node-html-parser";
import { renderSections } from "../../../scripts/qa/lib/render";

const THEMES = ["rose", "vanilla", "satin", "bloom", "flux"] as const;

const cartIcons = (theme: string): HTMLElement[] => {
  const [r] = renderSections(theme, [{ block: "Header", props: { id: "Header-1" }, cascade: false }]);
  if (r.error) throw new Error(`${theme}: ${r.error}`);
  return parse(r.html ?? "").querySelectorAll('[aria-label="Корзина"]');
};

describe("иконка корзины в шапке — кнопка data-cart-open", () => {
  it.each(THEMES)("%s", (theme) => {
    const icons = cartIcons(theme);
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.tagName).toBe("BUTTON");
      expect(icon.hasAttribute("data-cart-open")).toBe(true);
      expect(icon.getAttribute("href")).toBeUndefined();
    }
  });
});
