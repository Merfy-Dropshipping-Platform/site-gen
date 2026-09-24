/**
 * Цель «как у верстальщиков» — секция за секцией, на восьми ширинах экрана.
 *
 * ЗАЧЕМ. Владелец 24.09: «нужно как у верстальщиков, но не ломать структуру
 * секций, их настроек, цветовых схем… чтобы тестер пришёл и обрадовался».
 * Сравнивать наш живой магазин с демо верстальщиков нельзя: разное
 * содержимое (3 товара против 6, свои заголовки) выглядит как разная вёрстка.
 * Поэтому каждая наша секция рисуется ЗЕРКАЛОМ — тем же содержимым, что у
 * верстальщиков (scripts/qa/designer-mirror/<тема>.ts), — и меряется рядом с той
 * же секцией на <тема>.merfy.ru. Любое расхождение тогда — стиль, а не данные.
 *
 * КАК. Наша секция: живой рендер порта темы (та же лестница, что у витрины)
 * с признаком PARITY_DESIGN, страница = живой CSS витрины темы (шрифты и общие
 * правила) + свежесобранный CSS темы из этой ветки + токены схем темы по
 * умолчанию. Их секция: n-я полоса главной <тема>.merfy.ru.
 *
 * ДОПУСКИ. Ширина и положение содержимого ±2px; пропорции фото ±2%, размер
 * фото ±4px; высота секции ±8px; кегль заголовка/текста/кнопки — точно.
 *
 * Запуск: pnpm exec tsx scripts/qa/designer-goal.ts <тема> [--widths 390,1470]
 *           [--only Gallery] [--out каталог]
 * Код выхода 1 — есть красные клетки.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium, type Page } from "playwright";

import { buildTokensCss } from "../../src/themes/tokens-css";
import { MIRRORS } from "./designer-mirror";
import { renderSections } from "./lib/render";
import { SITES_ROOT, themeCss } from "./lib/tailwind-css";

const WIDTHS_ALL = [390, 768, 1024, 1280, 1470, 1536, 1920, 2560];
const TOL = { px: 2, mediaPx: 4, ratio: 0.02, h: 8 };

type Metrics = {
  h: number;
  left: number | null;
  w: number | null;
  media: [number, number][];
  fonts: Partial<Record<"h" | "p" | "btn", number>>;
};

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

/** Метрики полосы: те же правила для их и нашей стороны. Выполняется в браузере. */
function measure(roots: Element[]): Metrics {
  const vw = document.documentElement.clientWidth;
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05;
  };
  const rects = roots.map((e) => e.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  let L = Infinity;
  let R = -Infinity;
  const media: [number, number][] = [];
  const fonts: Metrics["fonts"] = {};
  for (const root of roots)
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (!vis(el)) continue;
      const q = el.getBoundingClientRect();
      if ((el.tagName === "IMG" || el.tagName === "VIDEO") && q.width > 60 && q.height > 60) {
        let box: Element = el;
        for (let k = 0, p = el.parentElement; k < 4 && p; k++, p = p.parentElement) {
          if (getComputedStyle(p).overflow === "hidden") {
            box = p;
            break;
          }
        }
        const b = box.getBoundingClientRect();
        media.push([Math.round(b.width), Math.round(b.height)]);
      }
      const leaf = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? "").trim());
      if (leaf) {
        const role = /^H[1-6]$/.test(el.tagName) ? "h" : el.closest("a,button") ? "btn" : "p";
        const size = Math.round(parseFloat(getComputedStyle(el).fontSize));
        fonts[role] = Math.max(fonts[role] ?? 0, size);
      }
      if (!(leaf || ["IMG", "svg", "BUTTON", "INPUT", "VIDEO"].includes(el.tagName))) continue;
      if (q.width >= vw * 0.95) continue;
      L = Math.min(L, q.left);
      R = Math.max(R, q.right);
    }
  return {
    h: Math.round(bottom - top),
    left: L < Infinity ? Math.round(L) : null,
    w: L < Infinity ? Math.round(R - L) : null,
    media: media.slice(0, 8),
    fonts,
  };
}

/** Полосы главной верстальщиков: крупные прямые потомки body/main. */
function refBands(): Element[] {
  const vw = document.documentElement.clientWidth;
  const out: Element[] = [];
  const push = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "LINK"].includes(c.tagName)) continue;
      const r = c.getBoundingClientRect();
      if (r.height < 30 || r.width < vw * 0.5) continue;
      if (/drawer|modal/i.test(`${c.id} ${c.className}`)) continue;
      if (c.tagName === "MAIN" || (c.tagName === "DIV" && c.children.length > 1 && r.height > innerHeight * 3)) {
        push(c);
        continue;
      }
      out.push(c);
    }
  };
  push(document.body);
  return out;
}

async function stabilize(page: Page) {
  await page.evaluate(async () => {
    document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((i) => (i.loading = "eager"));
    const step = Math.max(300, innerHeight - 100);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo(0, 0);
    document.documentElement.classList.remove("has-js");
    document.querySelectorAll<HTMLElement>("[data-animate],[data-animate-stagger] > *").forEach((e) => {
      e.style.opacity = "1";
      e.style.transform = "none";
    });
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);
}

const near = (a: number | null, b: number | null, tol: number) => (a == null || b == null ? a === b : Math.abs(a - b) <= tol);

/** Расхождения клетки. Пустой список — клетка зелёная. */
export function verdict(ref: Metrics, ours: Metrics): string[] {
  const out: string[] = [];
  if (!near(ref.w, ours.w, TOL.px)) out.push(`ширина содержимого ${ref.w} → у нас ${ours.w}`);
  if (!near(ref.left, ours.left, TOL.px)) out.push(`отступ слева ${ref.left} → у нас ${ours.left}`);
  if (!near(ref.h, ours.h, TOL.h)) out.push(`высота секции ${ref.h} → у нас ${ours.h}`);
  if (ref.media.length !== ours.media.length) out.push(`фото/плиток ${ref.media.length} → у нас ${ours.media.length}`);
  const n = Math.min(ref.media.length, ours.media.length);
  for (let k = 0; k < n; k++) {
    const [rw, rh] = ref.media[k];
    const [ow, oh] = ours.media[k];
    if (Math.abs(rw / rh - ow / oh) / (rw / rh) > TOL.ratio) out.push(`фото ${k + 1}: пропорция ${rw}×${rh} → у нас ${ow}×${oh}`);
    else if (!near(rw, ow, TOL.mediaPx)) out.push(`фото ${k + 1}: размер ${rw}×${rh} → у нас ${ow}×${oh}`);
  }
  const ROLE = { h: "заголовка", p: "текста", btn: "кнопки" } as const;
  for (const role of ["h", "p", "btn"] as const) {
    const a = ref.fonts[role];
    const b = ours.fonts[role];
    if (a && b && a !== b) out.push(`кегль ${ROLE[role]} ${a} → у нас ${b}`);
  }
  return out;
}

async function main() {
  const theme = process.argv[2];
  const mirror = MIRRORS[theme];
  if (!mirror) throw new Error(`нет зеркала для темы «${theme}» в scripts/qa/designer-mirror`);
  const widths = (arg("widths") ?? WIDTHS_ALL.join(",")).split(",").map(Number);
  const only = arg("only");
  const outDir = resolve(arg("out") ?? join(SITES_ROOT, "designer-goal-results", theme));
  mkdirSync(outDir, { recursive: true });

  const sections = mirror.sections.filter((s) => !only || s.blocks.includes(only));
  const tokens = buildTokensCss({}, theme);
  const localCss = themeCss(theme);
  const liveCss = await (await fetch(mirror.liveCss)).text();
  const rendered = sections.map((s) => {
    const rows = renderSections(
      theme,
      s.blocks.map((block) => ({ block, props: { ...(s.props[block] ?? {}), __designParity: true }, catalog: mirror.catalog })),
    );
    for (const r of rows) if (r.error) throw new Error(`${theme}/${r.block}: ${r.error}`);
    return rows.map((r) => r.html ?? "").join("\n");
  });

  const browser = await chromium.launch();
  const report: Record<string, unknown>[] = [];
  let red = 0;
  for (const w of widths) {
    const size = { width: w, height: w <= 400 ? 844 : 900 };
    // Их сторона: одна загрузка главной на ширину.
    const refPage = await browser.newPage({ viewport: size, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await refPage.addInitScript(() => { (window as unknown as { __name: unknown }).__name = (f: unknown) => f; });
    await refPage.goto(mirror.refUrl, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
    await stabilize(refPage);
    const bandsHandle = await refPage.evaluateHandle(refBands);
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const refEl = await bandsHandle.evaluateHandle((b: Element[], idx: number) => b[idx], s.refIndex);
      const ref = (await refEl.evaluate((el: Element | undefined, fn: string) => (el ? (0, eval)(`(${fn})`)([el]) : null), measure.toString())) as Metrics | null;
      const refShot = join(outDir, `${w}-${s.name}-ref.png`);
      if (ref) await (refEl.asElement()?.screenshot({ path: refShot }).catch(() => {}));

      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await page.setContent(
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><base href="${mirror.assetBase}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${liveCss}</style><style>${localCss}</style><style id="__merfy_tokens_css">${tokens}</style><style>html,body{margin:0}</style><script>window.__name=function(f){return f}</script></head><body><main>${rendered[i]}</main></body></html>`,
        { waitUntil: "load" },
      );
      await stabilize(page);
      const ours = (await page.evaluate((fn: string) => {
        // Только корни секций: шторки и модалки шапки (fixed) в полосу не входят.
        const els = Array.from(document.querySelectorAll("main [data-puck-component-id]")).filter((e) => !e.parentElement?.closest("[data-puck-component-id]") && e.getBoundingClientRect().height > 0);
        return (0, eval)(`(${fn})`)(els);
      }, measure.toString())) as Metrics;
      await page.screenshot({ path: join(outDir, `${w}-${s.name}-ours.png`), fullPage: true });
      await page.close();

      const diffs = ref ? verdict(ref, ours) : ["у верстальщиков нет этой полосы"];
      if (diffs.length) red++;
      report.push({ width: w, section: s.name, blocks: s.blocks, ref, ours, diffs });
      console.log(`${diffs.length ? "✗" : "✓"} ${w} ${s.name}${diffs.length ? ": " + diffs.join("; ") : ""}`);
    }
    await refPage.close();
  }
  await browser.close();
  writeFileSync(join(outDir, "report.json"), JSON.stringify({ theme, tol: TOL, cells: report }, null, 1));
  console.log(`\n${theme}: клеток ${report.length}, красных ${red}. Отчёт: ${outDir}/report.json`);
  process.exit(red ? 1 : 0);
}

main().catch((e) => {
  console.error("ОШИБКА", e instanceof Error ? e.message : e);
  process.exit(2);
});
