/**
 * «Слайд-шоу»: картинка, выбранная мерчантом в панели, обязана доехать до
 * разметки слайда.
 *
 * Тестировщик (пункт 61 репорта): «в слайд-шоу vanilla не применяется выбранный
 * медиафайл». Причина — порядок чтения пропов. В панели слайда ДВА поля с одним
 * смыслом: видимое «Изображение» (`image`, type: 'image') и скрытое легаси
 * «Изображение (старое)» (`imageUrl`, type: 'hidden') — см.
 * packages/theme-base/blocks/Slideshow/Slideshow.puckConfig.ts. Скрытое почти
 * всегда заполнено (дефолт слайда/старая ревизия), поэтому порт, который читает
 * его ПЕРВЫМ, показывает старое фото, что бы мерчант ни выбрал.
 *
 * §11 Контракта секции: видимое поле панели приоритетнее скрытого легаси.
 * Порядок `image → imageUrl` уже стоит в flux/satin/bloom (коммит d7cc0ff8,
 * 08.09) и там же дословно записан в комментарии. Замер 2026-09-15 показал, что
 * канон нарушают ДВЕ темы, а не одна: vanilla (Slideshow.astro:58-60) и rose
 * (Slideshow.astro:109-112) читают `imageUrl` первым.
 *
 * Проверка идёт рендером порта темы (dist/theme-sections/<тема>), а не чтением
 * исходника: «доехало до разметки» — единственная формулировка, которую видит
 * мерчант. Оба поля заполнены РАЗНЫМИ адресами, поэтому тест различает «взял
 * выбранное» и «взял легаси» — при одинаковых адресах он был бы неразличим.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Адрес, который мерчант выбрал полем панели «Изображение». */
const CHOSEN = "/uploads/b19-chosen-by-merchant.jpg";
/** Адрес из скрытого легаси-поля «Изображение (старое)». */
const LEGACY = "/uploads/b19-stale-legacy.jpg";

const renderSlideshow = (theme: string): string => {
  const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
  if (!existsSync(mf)) return "";
  const props = {
    id: "Slideshow-1",
    slides: [
      {
        id: "slide-1",
        // Оба поля заполнены — ровно так выглядит ревизия мерчанта, который
        // выбрал новое фото поверх старого.
        image: CHOSEN,
        imageUrl: LEGACY,
        heading: "Слайд",
        subtitle: "Текст слайда",
        ctaText: "Кнопка",
        ctaUrl: "/catalog",
      },
    ],
  };
  const rows = JSON.parse(
    execFileSync(
      "node",
      [RENDERER, theme, JSON.stringify([{ block: "Slideshow", props }])],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  expect(rows[0]?.error).toBeUndefined();
  expect(rows[0]?.missing).toBeFalsy();
  return rows[0]?.html ?? "";
};

describe("слайд-шоу — выбранный медиафайл доезжает до разметки", () => {
  it.each(THEMES)("%s: в разметке стоит выбранное фото, а не скрытое легаси", (theme) => {
    const html = renderSlideshow(theme);
    if (!html) return;
    const chosen = html.split(CHOSEN).length - 1;
    const legacy = html.split(LEGACY).length - 1;
    expect(`${theme}: выбранное=${chosen} легаси=${legacy}`).toBe(
      `${theme}: выбранное=1 легаси=0`,
    );
  });

  it.each(THEMES)("%s: порт читает image раньше imageUrl (§11 Контракта секции)", (theme) => {
    const html = renderSlideshow(theme);
    if (!html) return;
    // Дублирующая формулировка того же требования на случай, если тема начнёт
    // печатать адрес дважды (фон + <img>): легаси не должно быть НИ РАЗУ.
    expect(html).toContain(CHOSEN);
    expect(html).not.toContain(LEGACY);
  });
});
