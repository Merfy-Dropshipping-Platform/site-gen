#!/usr/bin/env node
/**
 * Фаза 0 — снятие базовой линии (read-only).
 *
 * Снимает страницу в фиксированном Chromium/DPR/viewport и записывает:
 *   - golden full-page PNG;
 *   - геометрию секций (bounding boxes);
 *   - computed styles ключевых узлов (заголовки/текст/кнопки/картинки);
 *   - DOM-структуру секции;
 *   - ассеты, шрифты, тексты и ссылки;
 *   - признаки динамических (несравнимых напрямую) областей.
 *
 * Использование:
 *   node flux-baseline/capture.mjs --url https://flux.merfy.ru/ --label reference
 *   node flux-baseline/capture.mjs --url http://localhost:8088/... --label local
 *
 * Флаги:
 *   --url <u>        что снимаем (обязательно)
 *   --label <name>   имя набора (каталог flux-baseline/<label>/)
 *   --viewport <w>   снять только один viewport
 *   --repeat         снять дважды и сверить хеши (проверка Gate 0)
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Фиксированные условия съёмки. Любое изменение здесь инвалидирует golden-набор.
const CAPTURE_ENV = {
  engine: 'chromium (playwright bundled)',
  deviceScaleFactor: 1,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  locale: 'ru-RU',
  timezone: 'Europe/Moscow',
  animations: 'disabled via injected CSS',
};

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 720 },
  { name: '1920', width: 1920, height: 1080 },
];

const KILL_ANIMATIONS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
  /* Секции темы стартуют с opacity:0 и проявляются по IntersectionObserver.
     Без этого верх страницы снимается прозрачным. */
  [data-animate], .animate-on-scroll, [class*="fade"] { opacity: 1 !important; }
`;

function args() {
  const a = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = a.indexOf(flag);
    return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : dflt;
  };
  return {
    url: get('--url', null),
    label: get('--label', 'reference'),
    viewport: get('--viewport', null),
    repeat: a.includes('--repeat'),
  };
}

/**
 * Извлечение метрик выполняется в контексте страницы.
 * Возвращает сериализуемый снимок секций.
 */
const EXTRACT = () => {
  const px = (v) => (v == null ? null : String(v));
  const round = (n) => Math.round(n * 100) / 100;

  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: round(r.left + window.scrollX),
      y: round(r.top + window.scrollY),
      w: round(r.width),
      h: round(r.height),
    };
  };

  const STYLE_KEYS = [
    'display', 'position', 'backgroundColor', 'color',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'textTransform', 'textAlign',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginBottom',
    'gap', 'gridTemplateColumns', 'flexDirection', 'alignItems', 'justifyContent',
    'borderRadius', 'borderWidth', 'borderColor',
    'width', 'height', 'minHeight', 'maxWidth', 'aspectRatio', 'objectFit',
  ];

  const styles = (el, keys = STYLE_KEYS) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const k of keys) out[k] = px(cs[k]);
    return out;
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

  /** Скелет DOM секции — теги + классы, ограниченная глубина. */
  const outline = (el, depth = 0, max = 4) => {
    if (depth > max) return null;
    const node = {
      tag: el.tagName.toLowerCase(),
      cls: el.getAttribute('class') || '',
      id: el.id || undefined,
      nt: el.getAttribute('data-nt') || undefined,
    };
    const kids = Array.from(el.children)
      .map((c) => outline(c, depth + 1, max))
      .filter(Boolean);
    if (kids.length) node.children = kids;
    return node;
  };

  const collectNodes = (root, selector, extraKeys = []) =>
    Array.from(root.querySelectorAll(selector))
      .filter(visible)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: el.getAttribute('class') || '',
        text: text(el).slice(0, 200),
        box: rect(el),
        style: styles(el, [...STYLE_KEYS, ...extraKeys]),
      }));

  // ── Границы секций ───────────────────────────────────────────────
  const sectionEls = [];
  const header = document.querySelector('header');
  if (header) sectionEls.push({ key: 'Header', el: header });

  const main = document.querySelector('main');
  if (main) {
    // Наши секции обёрнуты в <div class="color-scheme-N"> (обёртку вешает
    // компоновщик), у верстальщиков обёрток нет. Без спуска внутрь инструмент
    // сравнивал ОБЁРТКУ с секцией эталона: обёртка прозрачна, и правильный фон
    // секции читался как расхождение. Дважды сбивало с толку — спускаемся.
    const unwrap = (el) => {
      let cur = el;
      for (let d = 0; d < 3; d++) {
        const kids = Array.from(cur.children);
        const onlyChild = kids.length === 1 ? kids[0] : null;
        const isWrapper =
          cur.tagName === 'DIV' &&
          /(^|\s)color-scheme-\d/.test(cur.getAttribute('class') || '');
        if (isWrapper && onlyChild) cur = onlyChild;
        else break;
      }
      return cur;
    };

    Array.from(main.children)
      .filter((el) => el.tagName === 'SECTION' || el.tagName === 'DIV')
      .forEach((outer, i) => {
        const el = unwrap(outer);
        const label =
          el.id ||
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          outer.id ||
          outer.getAttribute('aria-label') ||
          outer.getAttribute('aria-labelledby') ||
          `main-child-${i}`;
        sectionEls.push({ key: label, el });
      });
  }
  const footer = document.querySelector('footer');
  if (footer) sectionEls.push({ key: 'Footer', el: footer });

  const sections = sectionEls.map(({ key, el }, index) => ({
    index,
    key,
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    ariaLabel: el.getAttribute('aria-label'),
    ariaLabelledBy: el.getAttribute('aria-labelledby'),
    cls: el.getAttribute('class') || '',
    box: rect(el),
    style: styles(el),
    outline: outline(el),
    headings: collectNodes(el, 'h1,h2,h3,h4,h5,h6'),
    paragraphs: collectNodes(el, 'p'),
    controls: Array.from(el.querySelectorAll('a,button'))
      .filter(visible)
      .map((n) => ({
        tag: n.tagName.toLowerCase(),
        cls: n.getAttribute('class') || '',
        text: text(n).slice(0, 120),
        href: n.getAttribute('href') || null,
        dataAttrs: Object.fromEntries(
          Array.from(n.attributes)
            .filter((a) => a.name.startsWith('data-'))
            .map((a) => [a.name, a.value]),
        ),
        box: rect(n),
        style: styles(n),
      })),
    images: Array.from(el.querySelectorAll('img,video,source'))
      .filter((n) => n.tagName !== 'IMG' || visible(n))
      .map((n) => ({
        tag: n.tagName.toLowerCase(),
        src: n.getAttribute('src') || n.getAttribute('srcset') || null,
        alt: n.getAttribute('alt') || null,
        loading: n.getAttribute('loading') || null,
        natural: n.naturalWidth ? { w: n.naturalWidth, h: n.naturalHeight } : null,
        box: n.tagName === 'SOURCE' ? null : rect(n),
        style: n.tagName === 'SOURCE' ? null : styles(n),
      })),
    links: Array.from(el.querySelectorAll('a[href]')).map((n) => n.getAttribute('href')),
    // Раскладочные контейнеры — здесь живёт breakpoint-сетка секции.
    // Корень секции почти всегда block, поэтому по нему адаптив не виден.
    layout: Array.from(el.querySelectorAll('*'))
      .filter((n) => {
        if (!visible(n)) return false;
        const d = getComputedStyle(n).display;
        if (d !== 'grid' && d !== 'flex' && d !== 'inline-grid' && d !== 'inline-flex') return false;
        return Array.from(n.children).filter(visible).length > 1;
      })
      .slice(0, 12)
      .map((n) => {
        const cs = getComputedStyle(n);
        // Путь от секции до контейнера — чтобы сопоставлять между viewport.
        const parts = [];
        let cur = n;
        while (cur && cur !== el && parts.length < 6) {
          parts.unshift(`${cur.tagName.toLowerCase()}${cur.id ? '#' + cur.id : ''}`);
          cur = cur.parentElement;
        }
        return {
          path: parts.join('>'),
          cls: (n.getAttribute('class') || '').slice(0, 200),
          display: cs.display,
          gridTemplateColumns: cs.gridTemplateColumns,
          gridTemplateRows: cs.gridTemplateRows,
          flexDirection: cs.flexDirection,
          flexWrap: cs.flexWrap,
          gap: cs.gap,
          alignItems: cs.alignItems,
          justifyContent: cs.justifyContent,
          childCount: Array.from(n.children).filter(visible).length,
          box: rect(n),
        };
      }),
  }));

  // ── Шрифты ───────────────────────────────────────────────────────
  const familySet = new Set();
  document.querySelectorAll('*').forEach((el) => {
    if (!visible(el)) return;
    if (!el.textContent || !el.textContent.trim()) return;
    familySet.add(getComputedStyle(el).fontFamily);
  });

  const fontFaces = [];
  try {
    document.fonts.forEach((f) => {
      fontFaces.push({ family: f.family, weight: f.weight, style: f.style, status: f.status });
    });
  } catch { /* FontFaceSet может быть недоступен */ }

  // ── Ассеты ───────────────────────────────────────────────────────
  const assets = {
    stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href),
    scripts: Array.from(document.querySelectorAll('script[src]')).map((s) => s.src),
    images: Array.from(new Set(Array.from(document.images).map((i) => i.currentSrc || i.src))),
    preloads: Array.from(document.querySelectorAll('link[rel="preload"]')).map((l) => ({
      href: l.href, as: l.getAttribute('as'),
    })),
  };

  // ── Горизонтальное переполнение ──────────────────────────────────
  const overflow = {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasHorizontalOverflow:
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    offenders: Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1);
      })
      .slice(0, 15)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 120),
        right: Math.round(el.getBoundingClientRect().right),
      })),
  };

  return {
    documentHeight: document.documentElement.scrollHeight,
    sections,
    fonts: { computedFamilies: Array.from(familySet).sort(), fontFaces },
    assets,
    overflow,
    title: document.title,
  };
};

async function prepare(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.addStyleTag({ content: KILL_ANIMATIONS });

  // Прокрутить страницу целиком — снять lazy-loading, затем вернуться наверх.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 120));
  });

  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  // Дождаться декодирования всех картинок — иначе PNG нестабилен между прогонами.
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images)
        .filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })),
    );
  });
  await page.waitForTimeout(400);
}

async function captureOne(browser, url, vp, outDir, suffix = '') {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: CAPTURE_ENV.deviceScaleFactor,
    colorScheme: CAPTURE_ENV.colorScheme,
    reducedMotion: CAPTURE_ENV.reducedMotion,
    locale: CAPTURE_ENV.locale,
    timezoneId: CAPTURE_ENV.timezone,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() });
  });

  await prepare(page, url);

  const pngPath = path.join(outDir, `home.${vp.name}${suffix}.png`);
  const buf = await page.screenshot({ path: pngPath, fullPage: true });
  const hash = crypto.createHash('sha256').update(buf).digest('hex');

  const data = await page.evaluate(EXTRACT);

  await context.close();
  return { data, hash, pngPath, consoleErrors, failedRequests };
}

async function main() {
  const { url, label, viewport, repeat } = args();
  if (!url) {
    console.error('нужен --url');
    process.exit(2);
  }

  const outDir = path.join(__dirname, label);
  await fs.mkdir(outDir, { recursive: true });

  const targets = viewport ? VIEWPORTS.filter((v) => v.name === viewport) : VIEWPORTS;
  const browser = await chromium.launch();
  const manifest = {
    label,
    url,
    capturedAtViewports: [],
    captureEnv: CAPTURE_ENV,
    reproducible: true,
  };

  for (const vp of targets) {
    process.stdout.write(`[${label}] ${vp.width}x${vp.height} … `);
    const first = await captureOne(browser, url, vp, outDir);

    let reproducible = null;
    if (repeat) {
      const second = await captureOne(browser, url, vp, outDir, '.repeat');
      reproducible = first.hash === second.hash;
      if (!reproducible) manifest.reproducible = false;
      await fs.unlink(second.pngPath).catch(() => {});
    }

    await fs.writeFile(
      path.join(outDir, `home.${vp.name}.json`),
      JSON.stringify(
        {
          viewport: vp,
          url,
          captureEnv: CAPTURE_ENV,
          screenshotSha256: first.hash,
          reproducible,
          consoleErrors: first.consoleErrors,
          failedRequests: first.failedRequests,
          ...first.data,
        },
        null,
        2,
      ),
    );

    manifest.capturedAtViewports.push({
      viewport: vp.name,
      sections: first.data.sections.length,
      documentHeight: first.data.documentHeight,
      sha256: first.hash,
      reproducible,
      horizontalOverflow: first.data.overflow.hasHorizontalOverflow,
      consoleErrors: first.consoleErrors.length,
      failed404: first.failedRequests.length,
    });

    console.log(
      `секций=${first.data.sections.length} h=${first.data.documentHeight} ` +
        `sha=${first.hash.slice(0, 12)}` +
        (reproducible === null ? '' : reproducible ? ' воспроизводим ✓' : ' НЕ воспроизводим ✗'),
    );
  }

  await browser.close();
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nГотово → ${outDir}`);
  if (repeat && !manifest.reproducible) {
    console.error('GATE 0 НЕ ПРОЙДЕН: съёмка не воспроизводится побайтово');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
