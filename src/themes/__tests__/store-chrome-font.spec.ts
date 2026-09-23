/**
 * @jest-environment jsdom
 *
 * Шапка, корзина и подвал — надписи шрифтами из «Настроек темы».
 *
 * Владелец 23.09: «надо из настроек темы» (про шрифт). Проверяя каталог, замер
 * в браузере нашёл то же самое за его пределами:
 *   • bloom: название магазина в шапке и подвале — системный шрифт, пустая
 *     корзина — Manrope и системный. Разметка там — классами ролей rose
 *     (`font-comfortaa` = заголовок, `font-manrope` = текст), а в CSS bloom
 *     `.font-comfortaa` не было вовсе, `.font-manrope` был Manrope литералом;
 *   • vanilla: пустая корзина — Manrope: `.font-manrope` и кнопка
 *     `.vanilla-button` сидели на `--font-nt-ui` (Manrope из токенов DS).
 * Починено данными темы — ролями в CSS bloom и vanilla, как у rose и flux.
 *
 * Проверка: настоящий рендер Header, CartBody (пустая корзина) и Footer темы;
 * шапка и подвал вне <main>, корзина внутри — как на витрине (перекрытия
 * «Настроек темы» из tokens-css адресуют `main …`). Каждая надпись должна
 * быть из настроек — шрифтом ТЕКСТА или ЗАГОЛОВКОВ (роль выбирает тема:
 * название магазина у rose, bloom и satin — шрифт заголовков, «Корзина» у
 * satin — шрифт текста). Мерка — lib/font-roles.ts. Исключение одно:
 * подпись платформы «Разработано на Merfy» — постоянная роль Inter.
 *
 * Требует сборки: pnpm build:theme-sections:all
 */
import { renderSections } from "../../../scripts/qa/lib/render";
import { ТЕМЫ } from "./lib/catalog-dom";
import { мерка, надписи, подписьУзла } from "./lib/font-roles";

jest.setTimeout(60_000);

const БЛОКИ = ["Header", "CartBody", "Footer"] as const;
/** Постоянная подпись платформы: шрифт Inter по макету, не из настроек. */
const ПОДПИСЬ_ПЛАТФОРМЫ = "Разработано на Merfy";

describe.each(ТЕМЫ)(
  "шапка, корзина и подвал — шрифты из настроек — %s",
  (тема) => {
    const м = мерка(тема);

    beforeAll(() => {
      const рендер = renderSections(
        тема,
        БЛОКИ.map((block) => ({ block, props: { id: `${block}-1` } })),
      );
      const html = рендер.map((r, i) => {
        if (r.error) throw new Error(`${тема} ${БЛОКИ[i]}: ${r.error}`);
        return (r.html ?? "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
      });
      document.body.innerHTML = `${html[0]}<main>${html[1]}</main>${html[2]}`;
      м.взятьCssСтраницы();
    });

    it.each(БЛОКИ)(
      "%s: каждая надпись — шрифтом текста или заголовков из настроек",
      (блок) => {
        const корень = document.querySelector(
          `[data-puck-component-id="${блок}-1"]`,
        );
        if (!корень) throw new Error(`${тема}: нет блока ${блок}`);
        const все = надписи([корень]).filter(
          (el) => (el.textContent ?? "").trim() !== ПОДПИСЬ_ПЛАТФОРМЫ,
        );
        const чужие = все
          .map((el) => ({ el, шрифт: м.действующее(el, "font-family") }))
          .filter(
            (x) =>
              !м.изНастроек(x.шрифт, м.РОЛИ.текст) &&
              !м.изНастроек(x.шрифт, м.РОЛИ.заголовок),
          )
          .map((x) => ({
            надпись: подписьУзла(x.el),
            шрифт: x.шрифт.значение,
          }));
        expect({ надписей: все.length > 0, чужие }).toEqual({
          надписей: true,
          чужие: [],
        });
      },
    );
  },
);
