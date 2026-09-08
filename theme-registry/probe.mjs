// Измерители реестра. Всё меряется в РЕАЛЬНОМ браузере тем же путём, что
// настоящий конструктор (наследие flux-baseline/settings-liveness3.mjs — все
// три его ловушки учтены: init-рукопожатие, scrollIntoView+settle, реальные
// пропы поверх которых меняется одно поле).
//
// Ни одной проверки по классам или HTML-диффам: только computed-стили,
// координаты (bbox), реальные text-rects и яркость пикселей.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';

const API = 'http://localhost:3110/api';
const SETTLE_MS = 900; // 60мс debounce + fetch /preview/block + outerHTML replace + reveal tween

export async function openPreview({ siteId, themeId, page = 'home' }) {
  const browser = await chromium.launch({ headless: true });
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  // networkidle недостижим с тяжёлыми фото мерчанта (реальный контент сайта) —
  // ждём load, при таймауте довольствуемся domcontentloaded + settle.
  const url = `${API}/sites/${siteId}/preview?page=${encodeURIComponent(page)}`;
  try {
    await pg.goto(url, { waitUntil: 'load', timeout: 45000 });
  } catch {
    await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  }
  await pg.waitForTimeout(1500);
  // ЛОВУШКА 3 (liveness3): без 'init' у превью-агента currentSiteId пуст и
  // каждый update-block молча no-op'ится.
  await pg.evaluate(
    ({ siteId, themeId, page }) => {
      window.postMessage({ type: 'init', siteId, themeId, pageId: page, data: undefined }, '*');
    },
    { siteId, themeId, page },
  );
  await pg.waitForTimeout(300);
  return { browser, pg };
}

// Реальные пропы блоков из текущей ревизии (SELECT only).
export function revisionContent(siteId, page = 'home') {
  const sql = `select data::jsonb->'pagesData'->'${page}'->'content' from site_revision where id=(select current_revision_id from site where id='${siteId}')`;
  const out = execSync(
    `docker exec merfy-postgres psql -U postgres -d sites_service -tAc "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8' },
  ).trim();
  return JSON.parse(out || '[]');
}

export async function focusBlock(pg, blockId) {
  // ЛОВУШКА 1: без scrollIntoView секции ниже вьюпорта законно opacity:0 (reveal).
  await pg.evaluate(
    // block:'start' — ровно так секцию показывает САМ конструктор (превью-агент,
    // preview.service.ts: sectionEl.scrollIntoView({behavior:'smooth',block:'start'})).
    // С 'center' у высокой секции её шапка уезжает ВЫШЕ экрана, reveal-анимация
    // (data-animate) не срабатывает, и заголовок ложно считается невидимым.
    (id) => document.querySelector(`[data-puck-component-id="${id}"]`)?.scrollIntoView({ block: 'start' }),
    blockId,
  );
  await pg.waitForTimeout(SETTLE_MS);
}

export async function applyProps(pg, pageId, blockId, props, { timeoutMs = 4000, blockType } = {}) {
  // 2026-09-08: превью-агент требует blockType (коммит 61d4f00c убрал фолбэк
  // `blockId.split('-')[0]` и добавил `if (!blockType) return`). Настоящий
  // конструктор его шлёт (PreviewFrame.tsx:387) — зонд обязан тоже, иначе
  // update-block молча no-op и ВСЕ проверки читают прошлый DOM.
  const typeForMsg = blockType || String(blockId).split('-')[0];
  // Настоящий канал конструктора — тот же postMessage, что шлёт PreviewFrame.
  // Фикс-ожидание ненадёжно: рендер бывает дольше, а сообщение может молча
  // потеряться → замер видит ПРОШЛЫЙ DOM (ловил в полном прогоне Hero:
  // small-кегль «мерялся» как 40px от предыдущего рендера). Поэтому:
  // штампуем узел атрибутом; замена узла (outerHTML=html в превью-агенте)
  // штамп стирает → это сигнал «рендер долетел». Нет сигнала за timeout —
  // один ресенд; после снова нет — возвращаем false, проверка упадёт с фактами.
  const stamp = () =>
    pg.evaluate((id) => {
      const e = document.querySelector(`[data-puck-component-id="${id}"]`);
      if (e) e.setAttribute('data-registry-epoch', '1');
      return e ? e.outerHTML.length : -1;
    }, blockId);
  const landed = (preLen) =>
    pg.evaluate(
      ({ id, preLen }) => {
        const e = document.querySelector(`[data-puck-component-id="${id}"]`);
        if (!e) return false;
        return !e.hasAttribute('data-registry-epoch') || e.outerHTML.length !== preLen;
      },
      { id: blockId, preLen },
    );
  for (let attempt = 0; attempt < 2; attempt++) {
    const preLen = await stamp();
    await pg.evaluate(
      ({ pageId, blockId, blockType, props }) => {
        window.postMessage({ type: 'update-block', pageId, blockId, blockType, props }, '*');
      },
      { pageId, blockId, blockType: typeForMsg, props },
    );
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await landed(preLen)) {
        await pg.waitForTimeout(400); // reveal/анимации/шрифты после замены узла
        return true;
      }
      await pg.waitForTimeout(120);
    }
  }
  return false;
}

// ---------- низкоуровневые замеры (в странице) ----------

// Все in-page функции — одним evaluate, чтобы не гонять десятки раундтрипов.
export async function snapshot(pg, blockId, opts = {}) {
  return pg.evaluate(
    ({ blockId, opts }) => {
      const root = document.querySelector(`[data-puck-component-id="${blockId}"]`);
      if (!root) return { found: false };

      // Альфа фона из ЛЮБОГО формата computed-цвета (rgb/rgba/oklab/oklch/color()):
      // Tailwind v4 отдаёт oklab(...) — парсер только под rgba молча давал 0.
      const bgAlpha = (bgStr) => {
        if (!bgStr || bgStr === 'transparent') return 0;
        const slash = bgStr.match(/\/\s*([\d.]+%?)\s*\)/);
        if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
        const rgba = bgStr.match(/^rgba\([^)]*[,\s]([\d.]+)\)$/);
        if (rgba) return parseFloat(rgba[1]);
        if (bgStr === 'rgba(0, 0, 0, 0)') return 0;
        return 1; // непрозрачный цвет без явной альфы
      };

      const vis = (el) => {
        // видимость «как глазом»: цепочка opacity, display, visibility, ненулевой bbox
        let node = el;
        let opacity = 1;
        while (node && node !== document.body) {
          const cs = getComputedStyle(node);
          if (cs.display === 'none' || cs.visibility === 'hidden') return { visible: false, opacity: 0 };
          opacity *= parseFloat(cs.opacity || '1');
          node = node.parentElement;
        }
        const r = el.getBoundingClientRect();
        return { visible: opacity > 0.05 && r.width > 1 && r.height > 1, opacity, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
      };

      const rectOf = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };

      // «Заголовок» = первый ВИДИМЫЙ h1-h3 внутри секции (тема-агностично).
      const headingSel = opts.headingSelector || 'h1,h2,h3';
      let heading = null;
      let headingEl = null;
      for (const h of root.querySelectorAll(headingSel)) {
        const v = vis(h);
        if (v.visible) {
          headingEl = h;
          // реальные прямоугольники ТЕКСТА (Range) — text-align двигает именно их,
          // а не bbox блочного элемента
          const range = document.createRange();
          range.selectNodeContents(h);
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
          const union = rects.length
            ? rects.reduce(
                (a, r) => ({
                  x1: Math.min(a.x1, r.x), y1: Math.min(a.y1, r.y),
                  x2: Math.max(a.x2, r.right), y2: Math.max(a.y2, r.bottom),
                }),
                { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
              )
            : null;
          heading = {
            text: (h.textContent || '').trim().slice(0, 80),
            fontSize: parseFloat(getComputedStyle(h).fontSize),
            rect: rectOf(h),
            textRect: union ? { x: union.x1, y: union.y1, w: union.x2 - union.x1, h: union.y2 - union.y1 } : rectOf(h),
          };
          break;
        }
      }

      // Подложка-плашка под текстовым блоком: ближайший предок заголовка
      // (не сам корень секции) с непрозрачным фоном (для check content-plate).
      let headingPlate = null;
      if (heading) {
        let node = root.querySelector(headingSel);
        // тот же элемент, что выбран заголовком (первый видимый h1-h3)
        for (const h of root.querySelectorAll(headingSel)) {
          if ((h.textContent || '').trim().slice(0, 80) === heading.text) { node = h; break; }
        }
        let anc = node?.parentElement;
        while (anc && anc !== root) {
          const cs = getComputedStyle(anc);
          const alpha = bgAlpha(cs.backgroundColor);
          if (alpha > 0.5) {
            headingPlate = {
              alpha,
              bg: cs.backgroundColor,
              paddingSum:
                parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
              radius: parseFloat(cs.borderTopLeftRadius) || 0,
            };
            break;
          }
          anc = anc.parentElement;
        }
      }

      // Крупнейшее видимое изображение секции (главное медиа товара/героя).
      let largestImg = null;
      for (const im of root.querySelectorAll('img')) {
        const r = im.getBoundingClientRect();
        if (r.width > 40 && r.height > 40 && (!largestImg || r.width * r.height > largestImg.w * largestImg.h)) {
          largestImg = { x: r.x, y: r.y, w: r.width, h: r.height };
        }
      }

      // Контрактный селектор медиа (семантические data-маркеры платформы,
      // например [data-product-images]) — приоритетнее эвристик.
      let mediaSel = null;
      if (opts.mediaSelector) {
        // первый ВИДИМЫЙ матч: у шапок бывают скрытые дубли (лого двухрядного
        // варианта display:none) — querySelector попадал в них
        for (const el of root.querySelectorAll(opts.mediaSelector)) {
          const r = el.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) continue;
          const cs = getComputedStyle(el);
          mediaSel = { x: r.x, y: r.y, w: r.width, h: r.height, pos: cs.position, bg: cs.backgroundColor, color: cs.color };
          break;
        }
      }

      // Медиа-плашка без <img> (демо/плейсхолдер-ветки): крупнейший видимый
      // ПОЧТИ безтекстовый блок разумных пропорций — «то, что глаз считает
      // фото». Короткая подпись плейсхолдера («Изображение» + хелпер)
      // допустима; колонку с заголовком/текстом товара отсекаем по длине и
      // по вхождению текста заголовка.
      let mediaBox = null;
      {
        const cands = [];
        for (const el of root.querySelectorAll('div,figure,picture')) {
          const r = el.getBoundingClientRect();
          if (r.width < 160 || r.height < 160) continue;
          const ratio = r.width / r.height;
          if (ratio < 0.5 || ratio > 1.9) continue; // фото-пропорции, не обёртка колонок
          const t = (el.innerText || '').trim();
          if (t.length > 120) continue;
          if (heading && t && heading.text && t.includes(heading.text.slice(0, 20))) continue;
          cands.push({ x: r.x, y: r.y, w: r.width, h: r.height });
        }
        // обёртка, содержащая другого кандидата — не медиа; берём внутренние
        const inner = cands.filter(
          (a) => !cands.some((b) => b !== a && b.x >= a.x - 4 && b.y >= a.y - 4 && b.x + b.w <= a.x + a.w + 4 && b.y + b.h <= a.y + a.h + 4),
        );
        for (const c of inner) if (!mediaBox || c.w * c.h > mediaBox.w * mediaBox.h) mediaBox = c;
      }

      // Сетка плиток: элемент с максимумом однородных видимых детей (≥2,
      // ширины в пределах 1.6×, площадь ребёнка заметная). Тема-агностично —
      // без классов и data-маркеров.
      let grid = null;
      {
        let best = null;
        for (const el of root.querySelectorAll('*')) {
          const kids = Array.from(el.children).filter((k) => {
            const r = k.getBoundingClientRect();
            return r.width > 40 && r.height > 40;
          });
          if (kids.length < 2) continue;
          const ws = kids.map((k) => k.getBoundingClientRect().width);
          if (Math.max(...ws) / Math.min(...ws) > 1.6) continue;
          if (!best || kids.length > best.kids.length) best = { el, kids };
        }
        if (best) {
          const rects = best.kids.map((k) => k.getBoundingClientRect());
          const minTop = Math.min(...rects.map((r) => r.top));
          const firstRow = rects.filter((r) => Math.abs(r.top - minTop) < 12);
          grid = {
            count: best.kids.length,
            firstRowCount: firstRow.length,
            tileW: firstRow[0]?.width ?? rects[0].width,
            tileH: firstRow[0]?.height ?? rects[0].height,
          };
        }
      }

      // Контентный контейнер: НАИМЕНЬШИЙ предок заголовка, геометрически
      // содержащий и медиа — «сетка контента» (для настройки «Ширина»;
      // maxDescendantW ненадёжен: full-bleed потомок маскирует сетку).
      let contentBox = null;
      {
        const media = mediaSel ?? largestImg ?? mediaBox;
        if (headingEl && media) {
          let anc = headingEl.parentElement;
          while (anc && anc !== root) {
            const r = anc.getBoundingClientRect();
            const holds =
              media.x >= r.x - 8 && media.y >= r.y - 8 && media.x + media.w <= r.x + r.width + 8 && media.y + media.h <= r.y + r.height + 8;
            if (holds) { contentBox = { x: r.x, y: r.y, w: r.width, h: r.height }; break; }
            anc = anc.parentElement;
          }
        }
      }

      // Максимальная ширина видимого потомка (для container full-bleed↔boxed).
      let maxDescendantW = 0;
      for (const el of root.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > maxDescendantW && r.height > 8) maxDescendantW = r.width;
        if (maxDescendantW >= root.getBoundingClientRect().width) break;
      }

      // Поиск видимого ТЕКСТА (для text-lands): точное вхождение подстроки.
      let needleHit = null;
      if (opts.needle) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const t = walker.currentNode;
          if (t.nodeValue && t.nodeValue.includes(opts.needle)) {
            const v = vis(t.parentElement);
            if (v.visible) {
              needleHit = { rect: v.rect, fontSize: parseFloat(getComputedStyle(t.parentElement).fontSize) };
              break;
            }
          }
        }
      }

      // Кнопка по тексту (для href/pair-flip): a или button, текст точно равен.
      const buttons = {};
      for (const label of opts.buttonTexts || []) {
        let hit = null;
        for (const el of root.querySelectorAll('a,button')) {
          if ((el.textContent || '').trim() === label) {
            const v = vis(el);
            if (!v.visible) continue;
            const cs = getComputedStyle(el);
            hit = {
              href: el.getAttribute('href'),
              bgAlpha: bgAlpha(cs.backgroundColor),
              bg: cs.backgroundColor,
              borderW: parseFloat(cs.borderTopWidth || '0'),
              rect: rectOf(el),
            };
            break;
          }
        }
        buttons[label] = hit;
      }

      // Картинки секции (для image-swaps).
      const images = Array.from(root.querySelectorAll('img'))
        .map((im) => ({ src: im.currentSrc || im.src, loaded: im.complete && im.naturalWidth > 0 }))
        .slice(0, 12);
      const bgUrls = [];
      for (const el of root.querySelectorAll('*')) {
        const bi = getComputedStyle(el).backgroundImage;
        if (bi && bi !== 'none' && bgUrls.length < 12) bgUrls.push(bi);
      }

      const rootRect = rectOf(root);
      const cs = getComputedStyle(root);
      // sticky может висеть на самом блоке или на его обёртке (scheme-wrap)
      const parentCs = root.parentElement ? getComputedStyle(root.parentElement) : null;
      return {
        found: true,
        rootPos: cs.position,
        parentPos: parentCs ? parentCs.position : null,
        rootBg: cs.backgroundColor,
        rect: rootRect,
        paddingTop: parseFloat(cs.paddingTop),
        paddingBottom: parseFloat(cs.paddingBottom),
        heading,
        headingPlate,
        grid,
        largestImg,
        mediaBox,
        mediaSel,
        contentBox,
        maxDescendantW,
        needleHit,
        buttons,
        images,
        bgUrls,
        viewportW: window.innerWidth,
      };
    },
    { blockId, opts },
  );
}

// Средняя яркость секции (скрин элемента → pngjs). «Затемнение» глазом.
export async function brightness(pg, blockId) {
  const el = pg.locator(`[data-puck-component-id="${blockId}"]`).first();
  const buf = await el.screenshot({ timeout: 15000, animations: 'disabled' });
  const png = PNG.sync.read(buf);
  let sum = 0;
  let n = 0;
  const stride = 8; // каждый 8-й пиксель — достаточно для средней яркости
  for (let y = 0; y < png.height; y += stride) {
    for (let x = 0; x < png.width; x += stride) {
      const i = (png.width * y + x) << 2;
      sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
      n++;
    }
  }
  return n ? sum / n : 0;
}
