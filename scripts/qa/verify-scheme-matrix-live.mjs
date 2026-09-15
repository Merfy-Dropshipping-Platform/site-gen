#!/usr/bin/env node
/**
 * СВЕРКА МАТРИЦЫ С ЖИВОЙ ВИТРИНОЙ.
 *
 * Матрица (`src/themes/__tests__/scheme-matrix.mjs`) считает цвет по собранным
 * артефактам. Этого мало: собранное могло не доехать до прода, а прод — нести
 * другой CSS. Здесь её приговор подтверждается ЗАМЕРОМ НА ЖИВОМ САЙТЕ.
 *
 * Как. У каждой секции живой страницы есть обёртка
 * `<div class="color-scheme-N" data-block-scheme="N">` — ровно её значение
 * меняет мерчант в конструкторе. Скрипт перебирает все схемы магазина, подменяя
 * класс обёртки КЛИЕНТСКИ (на сайт ничего не пишется, только DOM своей
 * вкладки), и на каждой схеме снимает `getComputedStyle` со всех узлов внутри.
 *
 * КОНТРОЛЬ обязателен. Рядом с каждой мишенью печатается значение
 * `--color-bg` самой обёртки: если оно не изменилось, значит подмена схемы не
 * сработала и «цвет не поехал» ничего не доказывает.
 *
 * Считаются две группы узлов:
 *   • ПОДОЗРЕВАЕМЫЕ — те, чей класс матрица назвала красным (`bg-white`,
 *     `text-black`, `text-white`, `bg-black`, литерал `bg-[#…]`, алиасы
 *     `--vanilla-*`/`--satin-*`). Они ОБЯЗАНЫ стоять на месте;
 *   • ЭТАЛОННЫЕ — узлы на `var(--color-bg|heading|text|button-*)`. Они
 *     ОБЯЗАНЫ ехать. Если эталонные тоже стоят — виновата подмена, а не тема.
 *
 * Использование: node scripts/qa/verify-scheme-matrix-live.mjs [тема]
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = createRequire(import.meta.url)(resolve(ROOT, 'node_modules/playwright/index.js'));

const STANDS = {
  rose: 'https://7b64b7a527d2.merfy.ru',
  vanilla: 'https://5c178ceecc1d.merfy.ru',
  bloom: 'https://f7593c5f8f8f.merfy.ru',
  satin: 'https://8afc7b1ed6ee.merfy.ru',
  flux: 'https://u9fpo33bkmsd.merfy.ru',
};
const PAGES = ['/', '/cart'];

const SWEEP = `() => {
  const schemes = new Set();
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) { const m = r.selectorText && /^\\.color-scheme-(\\d+)$/.exec(r.selectorText.trim()); if (m) schemes.add(m[1]); } } catch {}
  }
  const ids = [...schemes];
  const wraps = [...document.querySelectorAll('[data-block-scheme]')];
  const rows = [];
  for (const wrap of wraps) {
    const root = wrap.querySelector('section, header, footer') || wrap.firstElementChild;
    if (!root) continue;
    const name = (root.getAttribute('data-block') || root.id || root.tagName.toLowerCase());
    const nodes = [root, ...root.querySelectorAll('*')].filter((el) => el.className && typeof el.className === 'string');
    // Подозреваемый — узел, чей ЛИТЕРАЛ реально победил в браузере. Просто
    // «в классе есть bg-white» мало: у vanilla шапки форму перекрашивает
    // правило темы, и класс проигрывает. Поэтому вычисленный цвет сверяется с
    // тем, который литерал обещает; совпал — значит красит именно он.
    const LITERALS = [
      { re: /(^|\\s)bg-white(\\s|$)/, prop: 'backgroundColor', want: 'rgb(255, 255, 255)' },
      { re: /(^|\\s)text-white(\\s|$)/, prop: 'color', want: 'rgb(255, 255, 255)' },
      { re: /(^|\\s)bg-black(\\s|$)/, prop: 'backgroundColor', want: 'rgb(0, 0, 0)' },
      { re: /(^|\\s)text-black(\\s|$)/, prop: 'color', want: 'rgb(0, 0, 0)' },
    ];
    const hexOf = (h) => {
      const v = h.length === 4 ? h.slice(1).split('').map((x) => x + x).join('') : h.slice(1);
      return 'rgb(' + [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).join(', ') + ')';
    };
    const goldRe = /var\\(--color-(bg|heading|text|button-bg|button-text|surface)/;
    const picked = [];
    for (const el of nodes) {
      const c = el.className;
      const st = getComputedStyle(el);
      let hit = null;
      for (const L of LITERALS) if (L.re.test(c) && st[L.prop] === L.want) { hit = { prop: L.prop, lit: L.want }; break; }
      if (!hit) {
        const m = /(^|\\s)(bg|text)-\\[(#[0-9a-fA-F]{3,8})\\]/.exec(c);
        if (m) {
          const prop = m[2] === 'bg' ? 'backgroundColor' : 'color';
          if (st[prop] === hexOf(m[3])) hit = { prop, lit: hexOf(m[3]) };
        }
      }
      if (hit) picked.push({ el, kind: 'подозреваемый', prop: hit.prop, lit: hit.lit });
      else if (goldRe.test(c)) picked.push({ el, kind: 'эталонный', prop: null });
      if (picked.length > 14) break;
    }
    if (!picked.length) continue;
    const was = wrap.className;
    const inner = [...wrap.querySelectorAll('[class*="color-scheme-"]')];
    const innerWas = inner.map((e) => e.className);
    const seen = picked.map(() => []);
    const control = [];
    for (const n of ids) {
      wrap.className = was.replace(/color-scheme-\\d+/g, 'color-scheme-' + n);
      inner.forEach((e, i) => { e.className = innerWas[i].replace(/color-scheme-\\d+/g, 'color-scheme-' + n); });
      control.push(getComputedStyle(wrap).getPropertyValue('--color-bg').trim());
      picked.forEach((p, i) => {
        const st = getComputedStyle(p.el);
        seen[i].push(p.prop ? st[p.prop] : st.backgroundColor + ' | ' + st.color);
      });
    }
    wrap.className = was;
    inner.forEach((e, i) => { e.className = innerWas[i]; });
    rows.push({
      section: name,
      controlMoves: new Set(control).size > 1,
      control,
      probes: picked.map((p, i) => ({
        kind: p.kind,
        tag: p.el.tagName,
        cls: p.el.className.split(/\\s+/).filter((c) => /bg-|text-/.test(c)).slice(0, 3).join(' ').slice(0, 70),
        lit: p.lit ?? null,
        values: seen[i],
        moves: new Set(seen[i]).size > 1,
      })),
    });
  }
  return { schemes: ids, rows };
}`;

const only = process.argv[2];
const br = await pw.chromium.launch();
const page = await br.newPage({ viewport: { width: 1440, height: 1400 } });
let suspectStill = 0, suspectMoved = 0, goldMoved = 0, goldStill = 0, noControl = 0;
const proofs = [];
for (const [theme, base] of Object.entries(STANDS)) {
  if (only && only !== theme) continue;
  for (const path of PAGES) {
    let ok = true;
    try { await page.goto(base + path, { waitUntil: 'networkidle', timeout: 90000 }); } catch { ok = false; }
    if (!ok) { console.log(`${theme}${path}: страница не открылась`); continue; }
    const r = await page.evaluate(new Function('return ' + SWEEP)()).catch((e) => ({ err: String(e).slice(0, 200) }));
    if (r.err) { console.log(`${theme}${path}: ${r.err}`); continue; }
    for (const row of r.rows) {
      if (!row.controlMoves) { noControl += row.probes.length; continue; }
      for (const p of row.probes) {
        if (p.kind === 'подозреваемый') {
          if (p.moves) { suspectMoved++; proofs.push({ bad: true, theme, path, row, p }); }
          else { suspectStill++; proofs.push({ bad: false, theme, path, row, p }); }
        } else if (p.moves) goldMoved++;
        else goldStill++;
      }
    }
  }
}
await br.close();

console.log('══ ЗАМЕР НА ЖИВЫХ ВИТРИНАХ ══');
console.log(`подозреваемых узлов (матрица: «мимо схемы»): ${suspectStill + suspectMoved}`);
console.log(`  стоят на месте — матрица ПОДТВЕРЖДЕНА: ${suspectStill}`);
console.log(`  поехали — матрица ОПРОВЕРГНУТА:        ${suspectMoved}`);
console.log(`эталонных узлов (матрица: «едет за схемой»): ${goldMoved + goldStill}`);
console.log(`  поехали: ${goldMoved} · стоят: ${goldStill}`);
console.log(`пропущено (подмена схемы не сработала, контроль неподвижен): ${noControl}`);
console.log('');
// Показываем ВСЕ опровержения и по два РАЗНЫХ подтверждения на тему —
// иначе список забивают четыре одинаковых значка корзины подряд.
const seenKey = new Set();
const sample = [];
for (const x of proofs.filter((v) => !v.bad)) {
  const k = `${x.theme}|${x.row.section}|${x.p.cls}`;
  if (seenKey.has(k)) continue;
  seenKey.add(k);
  if (sample.filter((y) => y.theme === x.theme).length >= 3) continue;
  sample.push(x);
}
const show = [...proofs.filter((x) => x.bad), ...sample];
for (const { bad, theme, path, row, p } of show) {
  console.log(`${bad ? 'ОПРОВЕРГНУТО' : 'ПОДТВЕРЖДЕНО'} — ${theme} · ${row.section} · <${p.tag}> ${p.cls}`);
  console.log(`  ${STANDS[theme]}${path}`);
  row.control.forEach((c, i) => console.log(`    схема ${i + 1}: мишень ${p.values[i].padEnd(34)} | контроль --color-bg = ${c}`));
}
process.exit(suspectMoved ? 1 : 0);
