#!/usr/bin/env node
// Раннер реестра поведения настроек секций.
//
//   node theme-registry/run.mjs --theme rose --block Hero [--field size] [--page home]
//
// Гоняет контракт sections/<Block>.mjs через НАСТОЯЩИЙ канал конструктора
// (браузер + update-block) и меряет обещанный эффект каждой настройки.
// Гейт истины: контракт принят только при 100% зелёном на Rose.
// Гард полноты: каждое ВИДИМОЕ поле puck-config обязано быть покрыто контрактом
// или явно перечислено в uncovered с причиной — молчаливых пропусков нет.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { openPreview, revisionContent, focusBlock, applyProps, snapshot, brightness } from './probe.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const THEME = args.theme;
const BLOCK = args.block;
const PAGE = args.page ?? 'home';
const ONLY_FIELD = args.field;
if (!THEME || !BLOCK) {
  console.error('usage: node theme-registry/run.mjs --theme <rose|flux|…> --block <Block> [--field <f>] [--page home]');
  process.exit(2);
}

const ROOT = import.meta.dirname;
const sites = JSON.parse(readFileSync(path.join(ROOT, 'sites.json'), 'utf-8'));
if (!sites[THEME]) {
  console.error(`sites.json: нет сайта для темы "${THEME}"`);
  process.exit(2);
}
const { siteId } = sites[THEME];

// Гард «тема реально скомпилирована» — иначе /preview/block молча рендерит
// generic theme-base вместо порта темы (ловушка из rose-parity-audit).
const manifest = path.join(ROOT, '..', 'dist', 'theme-sections', THEME, 'manifest.json');
if (!existsSync(manifest)) {
  console.error(`ОСТАНОВЛЕНО: ${manifest} не найден. Прогони: node scripts/compile-theme-sections.mjs ${THEME}`);
  process.exit(2);
}

const contract = (await import(path.join(ROOT, 'sections', `${BLOCK}.mjs`))).default;
if (contract.block !== BLOCK) {
  console.error(`контракт sections/${BLOCK}.mjs объявляет block="${contract.block}"`);
  process.exit(2);
}

// ---------- гард полноты ----------
const cfg = await (await fetch(`http://localhost:3110/api/themes/${THEME}/puck-config`)).json();
const fieldsCfg = cfg.components?.[BLOCK]?.fields;
if (!fieldsCfg) {
  console.error(`puck-config темы ${THEME} не содержит компонент ${BLOCK}`);
  process.exit(2);
}
const visiblePaths = [];
for (const [name, f] of Object.entries(fieldsCfg)) {
  if (!f || f.type === 'hidden') continue;
  if (f.type === 'section-header') continue; // UI-разделитель панели, не настройка
  if (f.type === 'disabledHint') continue; // информационная строка-подсказка, не настройка
  if (f.type === 'object' && f.objectFields) {
    for (const [sub, sf] of Object.entries(f.objectFields)) {
      if (sf && sf.type !== 'hidden') visiblePaths.push(`${name}.${sub}`);
    }
  } else {
    visiblePaths.push(name);
  }
}
const declared = [...Object.keys(contract.fields ?? {}), ...Object.keys(contract.uncovered ?? {})];
const covers = (v) => declared.some((k) => k === v || k.startsWith(v + '.') || v.startsWith(k + '.'));
const missing = visiblePaths.filter((v) => !covers(v));
if (missing.length) {
  console.error(`ГАРД ПОЛНОТЫ: контракт ${BLOCK} не учитывает видимые поля puck-config (${THEME}):`);
  missing.forEach((m) => console.error(`  - ${m}`));
  console.error('Покрой их в fields или перечисли в uncovered с причиной.');
  process.exit(2);
}

// ---------- пропы и блок ----------
const content = revisionContent(siteId, PAGE);
const entry = content.find((b) => b?.type === BLOCK);
if (!entry) {
  console.error(`в ревизии сайта ${siteId} на странице "${PAGE}" нет блока ${BLOCK}`);
  process.exit(2);
}
const blockId = entry.props?.id;
const realProps = entry.props;

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => {
  const c = structuredClone(o);
  const ks = p.split('.');
  let cur = c;
  for (const k of ks.slice(0, -1)) {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[ks.at(-1)] = v;
  return c;
};
// База поля: реальные пропы + сопутствующие значения контракта (field.also) —
// например, проверка «Позиция» требует существующего заголовка, а сид может
// его не задавать. also — часть контракта, применяется ВМЕСТЕ с пробным значением.
// Спец-токены значений (данные конкретного гейт-сайта из sites.json):
//   '@variantProduct' → variantProductId (товар с вариациями/многофото)
//   '@altProduct'     → altProductId (другой товар — для чека «выбор товара»)
const TOKENS = { '@variantProduct': sites[THEME].variantProductId, '@altProduct': sites[THEME].altProductId };
const resolveVal = (v) => (typeof v === 'string' && v in TOKENS ? TOKENS[v] : v);
const baseFor = (field) => {
  let b = realProps;
  for (const [p, v] of Object.entries(field.also ?? {})) b = setPath(b, p, resolveVal(v));
  return b;
};

// ---------- проверки ----------
const CHECKS = {
  // высота секции строго растёт по значениям
  async 'monotonic-height'({ pg, field }) {
    const hs = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found) return { pass: false, facts: 'блок пропал из DOM' };
      hs.push(Math.round(s.rect.h));
    }
    const pass = hs.every((h, i) => i === 0 || h > hs[i - 1] + 4);
    return { pass, facts: `высота ${hs.join(' → ')}px` };
  },

  // яркость секции реально падает (затемнение глазом)
  async 'brightness-drop'({ pg, field }) {
    const [a, b] = field.values;
    await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(a)));
    const la = await brightness(pg, blockId);
    await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(b)));
    const lb = await brightness(pg, blockId);
    const drop = la > 5 ? (la - lb) / la : 0;
    return { pass: drop >= 0.06, facts: `яркость ${la.toFixed(0)} → ${lb.toFixed(0)} (−${(drop * 100).toFixed(0)}%)` };
  },

  // центр ТЕКСТА заголовка попадает в обещанную зону полотна (трети)
  async corner({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found || !s.heading) return { pass: false, facts: 'заголовок не найден/невидим' };
      const r = s.rect;
      const c = { x: s.heading.textRect.x + s.heading.textRect.w / 2, y: s.heading.textRect.y + s.heading.textRect.h / 2 };
      const rx = (c.x - r.x) / r.w;
      const ry = (c.y - r.y) / r.h;
      const [vert, horiz] = v === 'center' ? ['center', 'center'] : v.split('-');
      const okX = horiz === 'left' ? rx < 0.38 : horiz === 'right' ? rx > 0.62 : rx > 0.3 && rx < 0.7;
      const okY = vert === 'top' ? ry < 0.38 : vert === 'bottom' ? ry > 0.62 : ry > 0.25 && ry < 0.75;
      if (!(okX && okY)) pass = false;
      facts.push(`${v}: (${(rx * 100).toFixed(0)}%, ${(ry * 100).toFixed(0)}%)${okX && okY ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // текст заголовка реально смещается по X (реальные text-rects, не bbox блока)
  async 'align-x'({ pg, field }) {
    const xs = {};
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found || !s.heading) return { pass: false, facts: 'заголовок не найден/невидим' };
      xs[v] = s.heading.textRect.x + s.heading.textRect.w / 2 - s.rect.x;
    }
    const [a, b] = field.values;
    const shifted = Math.abs(xs[a] - xs[b]) >= 30;
    const ordered = a === 'left' ? xs[a] < xs[b] : xs[a] > xs[b];
    return { pass: shifted && ordered, facts: `центр текста X: ${a}=${xs[a].toFixed(0)}px, ${b}=${xs[b].toFixed(0)}px` };
  },

  // ширина главного медиа растёт по значениям (small < medium < large)
  async 'media-width-monotonic'({ pg, field }) {
    const ws = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, field.mediaSelector ? { mediaSelector: field.mediaSelector } : {});
      const media = s.mediaSel ?? s.largestImg ?? s.mediaBox;
      if (!s.found || !media) return { pass: false, facts: 'главное медиа не найдено' };
      ws.push(Math.round(media.w));
    }
    const pass = ws.every((w, i) => i === 0 || w > ws[i - 1] + 8);
    return { pass, facts: `медиа ${ws.join(' < ')}px` };
  },

  // сторона главного медиа: left ↔ right относительно центра секции
  async 'media-side'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, field.mediaSelector ? { mediaSelector: field.mediaSelector } : {});
      const media = s.mediaSel ?? s.largestImg ?? s.mediaBox;
      if (!s.found || !media) return { pass: false, facts: 'главное медиа не найдено' };
      const c = media.x + media.w / 2 - s.rect.x;
      const ok = v === 'left' ? c < s.rect.w / 2 : c > s.rect.w / 2;
      if (!ok) pass = false;
      facts.push(`${v}: центр медиа ${((c / s.rect.w) * 100).toFixed(0)}%${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // раскладка: stacked = заголовок ПОД медиа; two-columns = сбоку от медиа
  async 'layout-flow'({ pg, field }) {
    const states = {};
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, field.mediaSelector ? { mediaSelector: field.mediaSelector } : {});
      const media = s.mediaSel ?? s.largestImg ?? s.mediaBox;
      if (!s.found || !media || !s.heading) return { pass: false, facts: 'медиа или заголовок не найдены' };
      const img = media;
      const h = s.heading.rect;
      states[v] = {
        below: h.y > img.y + img.h - 24,
        beside: h.y < img.y + img.h - 24 && (h.x > img.x + img.w - 24 || h.x + h.w < img.x + 24),
      };
    }
    const [stacked, cols] = field.values;
    const pass = states[stacked].below && states[cols].beside;
    const f = (st) => (st.below ? 'под медиа' : st.beside ? 'сбоку' : 'поверх/неясно');
    return { pass, facts: `${stacked}: ${f(states[stacked])} · ${cols}: ${f(states[cols])}` };
  },

  // пропорция главного медиа МЕНЯЕТСЯ по заданному порядку (шире → вытянутее)
  async 'media-aspect-order'({ pg, field }) {
    const ratios = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, field.mediaSelector ? { mediaSelector: field.mediaSelector } : {});
      const media = s.mediaSel ?? s.largestImg ?? s.mediaBox;
      if (!s.found || !media) return { pass: false, facts: 'главное медиа не найдено' };
      ratios.push(media.w / media.h);
    }
    const pass = ratios.every((r, i) => i === 0 || r < ratios[i - 1] * 0.95);
    return { pass, facts: `пропорции ${ratios.map((r) => r.toFixed(2)).join(' → ')} (шире → вытянутее)` };
  },

  // ширина контентного контейнера растёт по значениям (contentBox = наименьший
  // предок заголовка, содержащий медиа; full-bleed потомки его не маскируют)
  async 'width-monotonic'({ pg, field }) {
    const ws = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found) return { pass: false, facts: 'блок пропал из DOM' };
      const w = s.contentBox?.w ?? s.maxDescendantW;
      ws.push(Math.round(w));
    }
    const pass = ws.every((w, i) => i === 0 || w > ws[i - 1] + 20);
    return { pass, facts: `контейнер ${ws.join(' < ')}px` };
  },

  // — каталожные чеки (гидрация: сетка наполняется fetch'ем реальных товаров) —

  // число ГИДРИРОВАННЫХ карточек равно значению (ждём наполнения сетки до 10с)
  async 'hydrated-grid-count'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      let n = -1;
      const t0 = Date.now();
      while (Date.now() - t0 < 10000) {
        n = await pg.evaluate((id) => {
          const root = document.querySelector(`[data-puck-component-id="${id}"]`);
          return [...(root?.querySelectorAll('li[data-product-id]') ?? [])].filter((li) => li.getBoundingClientRect().height > 20 && !li.closest('template')).length;
        }, blockId);
        if (n === v) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      const ok = n === v;
      if (!ok) pass = false;
      facts.push(`${v} → ${n} карточек${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // «Вид фильтра»: side → сайдбар слева от сетки; top → строка фильтров над сеткой
  async 'filter-position'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      await pg.waitForTimeout(600);
      const m = await pg.evaluate((id) => {
        const root = document.querySelector(`[data-puck-component-id="${id}"]`);
        const rect = (el) => (el && el.getBoundingClientRect().width > 1 ? el.getBoundingClientRect() : null);
        const aside = rect(root?.querySelector('aside[data-nt="filter-sidebar"]'));
        const row = rect(root?.querySelector('[data-nt="catalog-filters"]'));
        // раскладки top/side ОБЕ в DOM (CSS-переключение) — берём ВИДИМУЮ сетку
        const visLi = [...(root?.querySelectorAll('li[data-product-id]') ?? [])].find((li) => li.getBoundingClientRect().width > 1);
        const grid = rect(visLi?.parentElement);
        return { aside: aside && { x: aside.x, y: aside.y }, row: row && { y: row.y, b: row.y + row.height }, grid: grid && { x: grid.x, y: grid.y }, layoutAttr: root?.getAttribute('data-catalog-layout') };
      }, blockId);
      let ok;
      if (v === 'side') ok = !!m.aside && !!m.grid && m.aside.x < m.grid.x - 40;
      else ok = !m.aside && !!m.row && !!m.grid && m.row.b <= m.grid.y + 60;
      if (!ok) pass = false;
      facts.push(`${v}: attr=${m.layoutAttr}, aside=${m.aside ? 'слева' : 'нет'}, строка=${m.row ? 'есть' : 'нет'}${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // выбор коллекции реально меняет НАБОР товаров (первые названия различаются)
  async 'grid-content-differs'({ pg, field }) {
    const sets = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      let names = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 10000) {
        names = await pg.evaluate((id) => {
          const root = document.querySelector(`[data-puck-component-id="${id}"]`);
          return [...(root?.querySelectorAll('li[data-product-id]') ?? [])].filter((li) => !li.closest('template')).slice(0, 6).map((li) => li.getAttribute('data-product-id'));
        }, blockId);
        if (names.length) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      sets.push(names.join(' | '));
    }
    const pass = sets.length === 2 && !!sets[0] && !!sets[1] && sets[0] !== sets[1];
    return { pass, facts: pass ? `наборы различаются: «${sets[0].slice(0, 36)}…» ↔ «${sets[1].slice(0, 36)}…»` : `наборы НЕ различаются (${(sets[0] || '∅').slice(0, 50)})` };
  },

  // элемент по селектору попадает в обещанную X-зону (map: значение → left/center/right)
  async 'selector-x'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, { mediaSelector: field.mediaSelector });
      if (!s.found || !s.mediaSel) return { pass: false, facts: `элемент ${field.mediaSelector} не найден` };
      const rx = (s.mediaSel.x + s.mediaSel.w / 2 - s.rect.x) / s.rect.w;
      const zone = field.map[v];
      const ok = zone === 'left' ? rx < 0.38 : zone === 'right' ? rx > 0.62 : rx > 0.35 && rx < 0.65;
      if (!ok) pass = false;
      facts.push(`${v}: X ${(rx * 100).toFixed(0)}% (ждали ${zone})${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // липкость: computed position sticky на блоке/обёртке по map значений
  async 'position-sticky'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found) return { pass: false, facts: 'блок пропал из DOM' };
      const sticky = s.rootPos === 'sticky' || s.parentPos === 'sticky';
      const want = !!field.map[v];
      const ok = sticky === want;
      if (!ok) pass = false;
      facts.push(`${v}: position ${s.rootPos}/${s.parentPos}${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // цветовая схема реально перекрашивает (фон ИЛИ цвет текста хоть одного из
  // якорей меняется — темы красят разное: rose текст лого, flux фон шапки)
  async 'scheme-change'({ pg, field }) {
    const selectors = [].concat(field.mediaSelector ?? []);
    const looks = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const parts = [];
      if (!selectors.length) {
        const s = await snapshot(pg, blockId);
        if (!s.found) return { pass: false, facts: 'блок пропал из DOM' };
        parts.push(`${s.rootBg}`);
      }
      for (const sel of selectors) {
        const s = await snapshot(pg, blockId, { mediaSelector: sel });
        if (!s.found) return { pass: false, facts: 'блок пропал из DOM' };
        parts.push(s.mediaSel ? `${s.mediaSel.bg}|${s.mediaSel.color}` : '∅');
      }
      looks.push(parts.join(' ; '));
    }
    // ≥2 уникальных вида среди значений: карты схем у тем разные, конкретная
    // пара может совпадать по цвету (у flux scheme-1 и scheme-4 текст одинаков)
    const pass = new Set(looks).size >= 2;
    return { pass, facts: pass ? `вид меняется: ${[...new Set(looks)].map((l) => l.slice(0, 34)).join(' ↔ ')}` : `вид НЕ меняется (${looks[0].slice(0, 70)})` };
  },

  // видимость элемента по селектору переключается значениями (map: значение → видим?)
  async 'selector-visibility'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, { mediaSelector: field.mediaSelector });
      const visible = !!s.mediaSel;
      const want = !!field.map[v];
      const ok = visible === want;
      if (!ok) pass = false;
      facts.push(`${v}: ${visible ? 'видим' : 'скрыт'} (ждали ${want ? 'видим' : 'скрыт'})${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // видимость маркера-текста переключается значениями (map: значение → видим?)
  async 'needle-visibility'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, { needle: field.needle });
      const visible = !!s.needleHit;
      const want = !!field.map[v];
      const ok = visible === want;
      if (!ok) pass = false;
      facts.push(`${v}: «${field.needle.slice(0, 16)}» ${visible ? 'видим' : 'скрыт'} (ждали ${want ? 'видим' : 'скрыт'})${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // массив пунктов: каждый label из применённого значения видим
  async 'nav-labels'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      let allOk = true;
      for (const item of v) {
        const s = await snapshot(pg, blockId, { needle: item.label });
        if (!s.needleHit) allOk = false;
      }
      if (!allOk) pass = false;
      facts.push(`${v.length} пунктов: ${allOk ? 'все видимы' : 'НЕ все видимы ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // «Карточки» N: число плиток в сетке равно значению слайдера
  async 'grid-count'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found || !s.grid) return { pass: false, facts: 'сетка плиток не найдена' };
      const ok = s.grid.count === v;
      if (!ok) pass = false;
      facts.push(`${v} → ${s.grid.count} плиток${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // массив элементов: число ВИДИМЫХ картинок секции равно длине массива
  // (для неоднородных раскладок вроде Галереи, где grid-детект не применим)
  async 'image-count-length'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found) return { pass: false, facts: 'блок пропал из DOM' };
      const n = (s.images ?? []).length;
      const ok = n === v.length;
      if (!ok) pass = false;
      facts.push(`${v.length} элем. → ${n} изображений${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // «Колонки» N: плитки сетки реально сужаются пропорционально числу колонок
  // (работает и на плейсхолдерах, и когда плиток меньше, чем колонок)
  async 'tile-density'({ pg, field }) {
    const [a, b] = field.values; // a < b
    const states = {};
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found || !s.grid) return { pass: false, facts: 'сетка плиток не найдена' };
      states[v] = s.grid;
    }
    const ratio = states[a].tileW / states[b].tileW;
    const expected = b / a;
    const pass = ratio >= expected * 0.7 && ratio <= expected * 1.4;
    return {
      pass,
      facts: `плитка ${states[a].tileW.toFixed(0)}px (${a} кол., в ряду ${states[a].firstRowCount}) → ${states[b].tileW.toFixed(0)}px (${b} кол., в ряду ${states[b].firstRowCount})`,
    };
  },

  // выкл/вкл: у текстового блока появляется непрозрачная подложка-плашка
  // (фон + паддинги); сам вид плашки — дело темы, меряем механизм
  async 'content-plate'({ pg, field }) {
    const [a, b] = field.values;
    await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(a)));
    const sa = await snapshot(pg, blockId);
    await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(b)));
    const sb = await snapshot(pg, blockId);
    if (!sa.found || !sb.found) return { pass: false, facts: 'блок пропал из DOM' };
    if (!sa.heading || !sb.heading) return { pass: false, facts: 'заголовок не найден/невидим' };
    const offOk = !sa.headingPlate;
    const onOk = !!sb.headingPlate && sb.headingPlate.paddingSum >= 16;
    return {
      pass: offOk && onOk,
      facts: `выкл: ${sa.headingPlate ? `плашка есть (${sa.headingPlate.bg}) ✗` : 'плашки нет'} · вкл: ${sb.headingPlate ? `плашка ${sb.headingPlate.bg}, паддинги ${sb.headingPlate.paddingSum.toFixed(0)}px` : 'плашки НЕТ'}`,
    };
  },

  // full-bleed ↔ boxed: максимальная ширина содержимого падает
  async 'width-toggle'({ pg, field }) {
    const ws = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId);
      if (!s.found) return { pass: false, facts: 'блок пропал из DOM' };
      ws.push(Math.round(s.maxDescendantW));
    }
    return { pass: ws[0] > ws[1] + 40, facts: `ширина контента ${ws[0]}px → ${ws[1]}px` };
  },

  // высота секции растёт примерно на сумму отступов
  async 'padding-delta'({ pg, field }) {
    const [a, b] = field.values;
    const sum = (b.top ?? 0) + (b.bottom ?? 0) - (a.top ?? 0) - (a.bottom ?? 0);
    await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(a)));
    const sa = await snapshot(pg, blockId);
    await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(b)));
    const sb = await snapshot(pg, blockId);
    if (!sa.found || !sb.found) return { pass: false, facts: 'блок пропал из DOM' };
    const d = sb.rect.h - sa.rect.h;
    return {
      pass: d >= sum * 0.6 && d <= sum * 2.5,
      facts: `высота +${d.toFixed(0)}px при +${sum}px отступов`,
    };
  },

  // введённый текст ВИДИМ в секции (не «есть в DOM», а видим глазом)
  async 'text-lands'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, { needle: v });
      const ok = !!s.needleHit;
      if (!ok) pass = false;
      facts.push(`«${String(v).slice(0, 24)}»${ok ? ' видим' : ' НЕ ВИДИМ'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // кнопка с текстом из пропов реально ведёт по заданному href
  async 'href-lands'({ pg, field }) {
    const label = getPath(baseFor(field), field.buttonTextPath);
    if (!label) return { pass: false, facts: `нет текста кнопки в пропах (${field.buttonTextPath})` };
    const v = field.values[0];
    await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
    const s = await snapshot(pg, blockId, { buttonTexts: [label] });
    const btn = s.buttons?.[label];
    if (!btn) return { pass: false, facts: `кнопка «${label}» не найдена/невидима` };
    const want = typeof v === 'string' ? v : v?.href;
    const ok = btn.href === want || (btn.href ?? '').endsWith(want);
    return { pass: ok, facts: `href="${btn.href}" (ждали ${want})` };
  },

  // solid/outlined: заливка пары кнопок зеркально флипается
  async 'button-pair-flip'({ pg, field }) {
    const p = getPath(baseFor(field), field.primaryTextPath ?? 'primaryButton.text');
    const s2 = getPath(baseFor(field), field.secondaryTextPath ?? 'secondaryButton.text');
    if (!p || !s2) return { pass: false, facts: `в пропах нет текстов пары кнопок (${p ?? '∅'} / ${s2 ?? '∅'})` };
    const states = {};
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const s = await snapshot(pg, blockId, { buttonTexts: [p, s2] });
      const bp = s.buttons?.[p];
      const bs = s.buttons?.[s2];
      if (!bp || !bs) return { pass: false, facts: `пара кнопок не найдена (${p}:${!!bp} ${s2}:${!!bs})` };
      states[v] = { p: bp.bgAlpha > 0.15, s: bs.bgAlpha > 0.15, pa: bp.bgAlpha, sa: bs.bgAlpha };
    }
    const [a, b] = field.values;
    const pass =
      states[a].p !== states[b].p &&
      states[a].s !== states[b].s &&
      states[a].p !== states[a].s &&
      states[b].p !== states[b].s;
    const f = (x) => (x ? 'залита' : 'контур');
    return {
      pass,
      facts: `${a}: primary ${f(states[a].p)}/secondary ${f(states[a].s)} · ${b}: primary ${f(states[b].p)}/secondary ${f(states[b].s)}`,
    };
  },

  // кегль реально растёт по значениям (small<medium<large): target 'heading' —
  // первый видимый h1-h3; target 'needle' — элемент с текстом из needlePath
  async 'monotonic-font'({ pg, field }) {
    const sizes = [];
    for (const v of field.values) {
      const base = baseFor(field);
      await applyProps(pg, PAGE, blockId, setPath(base, field.path, v));
      const needle = field.target === 'needle' ? getPath(base, field.needlePath) : undefined;
      const s = await snapshot(pg, blockId, needle ? { needle } : {});
      const fs = field.target === 'needle' ? s.needleHit?.fontSize : s.heading?.fontSize;
      if (!fs) return { pass: false, facts: field.target === 'needle' ? `текст «${needle}» не найден/невидим` : 'заголовок не найден/невидим' };
      sizes.push(fs);
    }
    const pass = sizes.every((x, i) => i === 0 || x > sizes[i - 1] + 0.5);
    return { pass, facts: `кегль ${sizes.map((x) => x.toFixed(0)).join(' < ')}px` };
  },

  // src/фон картинки реально сменился на заданный и загрузился.
  // Загрузку ЖДЁМ (до 4с): холодный кэш тяжёлого фото — не провал настройки.
  async 'image-swaps'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      let state = 'НЕ НАЙДЕНА';
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        const s = await snapshot(pg, blockId);
        const img = s.images?.find((im) => im.src.includes(v));
        const inBg = s.bgUrls?.some((u) => u.includes(v));
        if (img?.loaded) { state = 'img✓'; break; }
        if (inBg) { state = 'bg✓'; break; }
        state = img ? 'src есть, НЕ ЗАГРУЗИЛАСЬ' : 'НЕ НАЙДЕНА';
        await new Promise((r) => setTimeout(r, 300));
      }
      if (state !== 'img✓' && state !== 'bg✓') pass = false;
      facts.push(`${(v.startsWith('data:') ? 'data-uri#' + v.length : path.basename(v).slice(0, 28))}: ${state}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // раскладка ГАЛЕРЕИ фото: профиль (кол-во крупных фото + высота медиа-контейнера)
  // различается между значениями; атрибут data-gallery-layout (если порт несёт) сверяется
  async 'gallery-layout'({ pg, field }) {
    const profiles = [];
    const facts = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const m = await pg.evaluate(({ bid, mediaSel }) => {
        const root = document.querySelector(`[data-puck-component-id="${bid}"]`);
        if (!root) return null;
        const vis = (e) => e.getBoundingClientRect().width > 1 && e.getBoundingClientRect().height > 1;
        const bigs = [...root.querySelectorAll('img')].filter((i) => vis(i) && i.getBoundingClientRect().width > 260).length;
        const media = root.querySelector(mediaSel) ?? root;
        const g = root.querySelector('[data-gallery-layout]');
        return { bigs, h: Math.round(media.getBoundingClientRect().height), attr: g?.getAttribute('data-gallery-layout') ?? null };
      }, { bid: blockId, mediaSel: field.mediaSelector ?? '[data-product-images]' });
      if (!m) return { pass: false, facts: 'блок пропал из DOM' };
      profiles.push(m);
      const attrOkStr = m.attr === null ? '' : m.attr === v ? ', attr✓' : ` , attr=${m.attr} ✗`;
      facts.push(`${v}: крупных=${m.bigs}, h=${m.h}px${attrOkStr}`);
    }
    const differs = (a, b) => a.bigs !== b.bigs || Math.abs(a.h - b.h) > 32;
    const anyPairDiffers = profiles.some((p1, i) => profiles.some((p2, j) => j > i && differs(p1, p2)));
    const attrsOk = profiles.every((p1, i) => p1.attr === null || p1.attr === field.values[i]);
    return { pass: anyPairDiffers && attrsOk, facts: facts.join(' · ') };
  },

  // форма вариантов: none → текст-чипы с именем опции; circle/square → свотчи,
  // различающиеся скруглением (круг ≥45% высоты, квадрат <45%)
  async 'swatch-shape'({ pg, field }) {
    const facts = [];
    let pass = true;
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const m = await pg.evaluate(({ bid, needle }) => {
        const root = document.querySelector(`[data-puck-component-id="${bid}"]`);
        if (!root) return null;
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
        const textChip = [...root.querySelectorAll('button, label, li, span')].find((e) => vis(e) && e.textContent.trim() === needle);
        const swatch = [...root.querySelectorAll('button, span, div')].find((e) => {
          if (!vis(e)) return false;
          const r = e.getBoundingClientRect();
          if (r.width < 10 || r.width > 56 || r.height < 10 || r.height > 56) return false;
          const cs = getComputedStyle(e);
          return /rgb\(0,\s*0,\s*0\)/.test(cs.backgroundColor) && e.textContent.trim() === '';
        });
        if (!swatch) return { textChip: !!textChip, swatch: null };
        const r = swatch.getBoundingClientRect();
        const br = parseFloat(getComputedStyle(swatch).borderRadius) || 0;
        return { textChip: !!textChip, swatch: { ratio: br / r.height } };
      }, { bid: blockId, needle: field.needle ?? 'Чёрный' });
      if (!m) return { pass: false, facts: 'блок пропал из DOM' };
      let ok;
      if (v === 'none') ok = m.textChip;
      else if (v === 'circle') ok = !!m.swatch && m.swatch.ratio >= 0.45;
      else ok = !!m.swatch && m.swatch.ratio < 0.45; // square
      if (!ok) pass = false;
      facts.push(`${v}: ${m.swatch ? `свотч r=${(m.swatch.ratio * 100).toFixed(0)}%` : m.textChip ? 'текст-чип' : 'ни свотча, ни чипа'}${ok ? '' : ' ✗'}`);
    }
    return { pass, facts: facts.join(' · ') };
  },

  // смена значения меняет ЗАГОЛОВОК блока (выбор товара): A ≠ B, оба непусты
  async 'heading-differs'({ pg, field }) {
    const texts = [];
    for (const v of field.values) {
      await applyProps(pg, PAGE, blockId, setPath(baseFor(field), field.path, resolveVal(v)));
      const t = await pg.evaluate((bid) => {
        const root = document.querySelector(`[data-puck-component-id="${bid}"]`);
        const h = root && [...root.querySelectorAll('h1, h2, h3')].find((e) => e.getBoundingClientRect().width > 1);
        return h ? h.textContent.trim().slice(0, 40) : '';
      }, blockId);
      texts.push(t);
    }
    const pass = texts.every(Boolean) && new Set(texts).size === texts.length;
    return { pass, facts: texts.map((t) => `«${t}»`).join(' → ') };
  },
};

// ---------- прогон ----------
const fieldEntries = Object.entries(contract.fields ?? {}).filter(([k]) => !ONLY_FIELD || k === ONLY_FIELD);
if (!fieldEntries.length) {
  console.error(ONLY_FIELD ? `в контракте нет поля "${ONLY_FIELD}"` : 'контракт пуст');
  process.exit(2);
}

console.log(`реестр: ${BLOCK} @ ${THEME} (site ${siteId}, page ${PAGE}, blockId ${blockId})`);
const { browser, pg } = await openPreview({ siteId, themeId: THEME, page: PAGE });
const domOk = await pg.evaluate((id) => !!document.querySelector(`[data-puck-component-id="${id}"]`), blockId);
if (!domOk) {
  console.error(`блок ${blockId} не найден в DOM превью`);
  await browser.close();
  process.exit(2);
}
await focusBlock(pg, blockId);

const results = [];
for (const [pathKey, fieldRaw] of fieldEntries) {
  const field = { path: pathKey, ...fieldRaw };
  const impl = CHECKS[field.check?.type];
  let r;
  if (!impl) {
    r = { pass: false, facts: `неизвестный тип проверки: ${field.check?.type}` };
  } else {
    try {
      r = await impl({ pg, field: { ...field, ...field.check } });
    } catch (e) {
      r = { pass: false, facts: `ОШИБКА: ${String(e).slice(0, 140)}` };
    }
  }
  results.push({ path: pathKey, label: field.label ?? pathKey, meaning: field.meaning ?? '', ...r });
  // восстановить реальные пропы после каждого поля — изоляция полей друг от друга
  await applyProps(pg, PAGE, blockId, realProps);
  process.stdout.write(r.pass ? '✓' : '✗');
}
console.log('\n');
await browser.close();

// ---------- отчёт ----------
const pad = (s, n) => String(s).padEnd(n);
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? '✓' : '✗'} ${pad(r.label, 26)} ${r.facts}`);
}
const unc = Object.entries(contract.uncovered ?? {});
for (const [k, why] of unc) console.log(`◌ ${pad(k, 26)} не покрыто: ${why}`);
console.log(`\nитог: ${results.length - failed}/${results.length} ✓${unc.length ? `, не покрыто: ${unc.length}` : ''}`);

const repDir = path.join(ROOT, 'reports', THEME);
mkdirSync(repDir, { recursive: true });
const md = [
  `# ${BLOCK} @ ${THEME} — прогон реестра`,
  ``,
  `Дата: ${new Date().toISOString()} · site ${siteId} · page ${PAGE} · blockId ${blockId}`,
  ``,
  `| поле | вердикт | измерено | смысл (по Rose) |`,
  `|---|---|---|---|`,
  ...results.map((r) => `| ${r.label} (\`${r.path}\`) | ${r.pass ? '✓' : '✗'} | ${r.facts} | ${r.meaning} |`),
  ...(unc.length ? ['', '## Не покрыто', '', ...unc.map(([k, why]) => `- \`${k}\` — ${why}`)] : []),
  '',
].join('\n');
writeFileSync(path.join(repDir, `${BLOCK}.md`), md);
console.log(`отчёт: theme-registry/reports/${THEME}/${BLOCK}.md`);
process.exit(failed ? 1 : 0);
