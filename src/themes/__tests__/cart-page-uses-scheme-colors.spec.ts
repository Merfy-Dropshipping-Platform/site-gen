/**
 * Страница корзины красится ТОКЕНАМИ схемы, а не зашитыми цветами.
 *
 * Владелец 21.09 со скриншотом: в схеме 3 у него «Заголовок» #DF1414 и «Текст»
 * #31FF53, заголовок «КОРЗИНА» действительно красный, мелкая подпись варианта
 * зелёная — а НАЗВАНИЯ ТОВАРОВ и ЦЕНЫ остались чёрными.
 *
 * ЗАМЕР (живая витрина bloom, строка посеяна в корзину, playwright):
 *
 *     цвет названия товара:            rgb(0, 0, 0)
 *     --color-text на том же элементе: 0 0 0
 *     ближайшая схема над строкой:     color-scheme-3
 *     класс названия:                  font-manrope … text-[#000000] …
 *
 * То есть элемент ЛЕЖИТ внутри схемы, но покрашен литералом — токен ему просто
 * не задан.
 *
 * ПОЧЕМУ ЭТО НЕ ВИДНО ПО КОДУ СЕКЦИИ. У корзины ДВА разных рендера: секция
 * `CartBody.astro` (в ней всё на токенах — я проверил все пять тем) и
 * СОБСТВЕННАЯ страница темы `src/pages/cart.astro` со своим инлайн-скриптом,
 * который и рисует строки. Зашитые цвета жили во второй, и грепы по секции их
 * не находили. У bloom и satin было по 9 литералов `text-[#000000]` и по 2
 * `text-white`; у rose, flux и vanilla — ноль, поэтому там всё красилось верно.
 *
 * Роли при замене: заголовки страницы (`font-comfortaa … uppercase`) →
 * `--color-heading`; заливка и текст кнопок → `--color-button-bg` /
 * `--color-button-text`; всё остальное, включая названия товаров и цены →
 * `--color-text`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;

const cartPage = (theme: string): string | null => {
  const path = resolve(ROOT, `themes/${theme}/src/pages/cart.astro`);
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
};

/** Код без строчных комментариев: там литералы упоминаются законно. */
const code = (src: string): string => src.replace(/\/\/.*$/gm, '');

describe('страница корзины: цвета из схемы, а не литералы', () => {
  it('ОПОРА: страницы корзины на месте и читаются', () => {
    // Без этого запреты ниже зеленели бы на отсутствующих файлах.
    // Порог низкий намеренно: у rose, flux и vanilla страница ТОНКАЯ — она
    // делегирует отрисовку секции CartBody и своей разметки строк не имеет.
    // Первая версия требовала 800 символов и падала на flux, потому что я
    // сравнивал порог, снятый в БАЙТАХ (`wc -c`), с длиной в СИМВОЛАХ —
    // русские комментарии весят по два байта.
    const found = THEMES.filter((t) => cartPage(t) !== null);
    expect(found.length).toBe(THEMES.length);
    for (const theme of found) {
      expect({ theme, читается: (cartPage(theme) as string).length > 300 }).toEqual({
        theme,
        читается: true,
      });
    }
  });

  it.each(THEMES)('%s: нет зашитого цвета текста', (theme) => {
    const src = cartPage(theme);
    if (src === null) return; // у темы нет своей страницы корзины — нечего сторожить
    const bad = code(src).match(/text-\[#[0-9a-fA-F]{3,8}\]|\btext-white\b|\btext-black\b/g) ?? [];
    expect({ theme, зашитые: [...new Set(bad)] }).toEqual({ theme, зашитые: [] });
  });

  it.each(THEMES)('%s: кнопка не залита зашитым чёрным', (theme) => {
    const src = cartPage(theme);
    if (src === null) return;
    // Сторожим ровно заливку КНОПКИ. Светлые surface-подложки (напр.
    // `bg-[#F5F5F5]` у bloom) тоже стоило бы перевести на токен, но это другой
    // элемент и другая жалоба — не тащу сюда, чтобы правка осталась узкой.
    const bad = code(src).match(/bg-\[#0{3,8}\]/gi) ?? [];
    expect({ theme, зашитые: [...new Set(bad)] }).toEqual({ theme, зашитые: [] });
  });

  it.each(THEMES)('%s: страница со своей разметкой строк красит текст токеном', (theme) => {
    const src = cartPage(theme);
    if (src === null) return;
    // Только там, где страница РИСУЕТ строки сама (bloom и satin). У тонких
    // страниц rose/flux/vanilla своей разметки нет — они отдают отрисовку
    // секции CartBody, и требовать от них токен бессмысленно.
    const рисует = /line\.name|line\.price/.test(src);
    if (!рисует) return;
    expect({ theme, есть_токен: /text-\[rgb\(var\(--color-text/.test(code(src)) }).toEqual({
      theme,
      есть_токен: true,
    });
  });
});
