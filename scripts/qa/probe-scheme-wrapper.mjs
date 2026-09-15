#!/usr/bin/env node
/**
 * Самый широкий механизм: БЕЗ пропа `colorScheme` секция не получает обёртку
 * `.color-scheme-N` вообще и схему не принимает НИКОГДА.
 *
 * Цепочка (прочитана построчно):
 *   v2-page-composer.ts:62  — `return s ? '<div class="color-scheme-…">…</div>' : h`,
 *                             то есть при `s === null` обёртки НЕТ;
 *   preview.service.ts:436  — `resolveBlockScheme` = props.colorScheme →
 *                             theme.json blockDefaults[block].colorScheme → null.
 *                             Отката на `defaults` из puckConfig блока НЕТ;
 *   ни одна из пяти тем не объявляет `blockDefaults.Page` (проверено).
 *
 * ЗАМЕР 15.09 (Chromium 1440, схемы магазина тестировщика, 4 темы × 4 блока =
 * 32 клетки, ни одного исключения):
 *   проп есть → 209,77,77 → 245,240,235 (следует схеме);
 *   пропа нет → 209,77,77 → 209,77,77   (замёрз на схеме из :root).
 *
 * И это не редкий случай: в сидах страниц пяти тем БЕЗ `colorScheme` идут
 * 126 блоков из 273 (46 %) — rose 40/59, vanilla 37/45, flux 24/61,
 * satin 14/46, bloom 11/62.
 *
 * Использование: node scripts/qa/probe-scheme-wrapper.mjs [Блок,Блок,…]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { dirname, resolve as res } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = res(dirname(fileURLToPath(import.meta.url)), '..', '..');
const r_=createRequire(import.meta.url);
const {buildTokensCss}=r_(resolve(ROOT,'dist/src/themes/tokens-css.js'));
const {schemeIdFromProp}=r_(resolve(ROOT,'dist/src/themes/v2-page-composer.js'));
const pw=r_(resolve(ROOT,'node_modules/playwright/index.js'));
const SCHEMES=JSON.parse(readFileSync(resolve(ROOT,'scripts/qa/tester-schemes.json'),'utf8'));
const b=await pw.chromium.launch();
console.log('тема      случай                              схема-1        схема-4        вердикт');
const BLOCKS=(process.argv[2]||'Page').split(',');
for (const t of ['rose','bloom','satin','flux']) {
 for (const BL of BLOCKS) {
  const css=readFileSync(resolve(ROOT,'dist/theme-css',`${t}.css`),'utf8');
  const tok=buildTokensCss({colorSchemes:SCHEMES},t);
  for (const [label, withScheme] of [['проп ЕСТЬ', true], ['пропа НЕТ', false]]) {
    const got=[];
    for (const sc of ['1','4']) {
      const props={id:BL+'-1', heading:'Заголовок', content:'<p>Текст</p>'};
      if (withScheme) props.colorScheme = `scheme-${sc}`;
      const html=JSON.parse(execFileSync('node',[resolve(ROOT,'src/themes/__tests__/render-theme-sections.mjs'),t,JSON.stringify([{block:BL,cascade:true,live:true,props}])],{cwd:ROOT,encoding:'utf-8',maxBuffer:1<<28}))[0].html||'';
      // обёртка ровно как в composeV2Page: есть схема в пропах → div, нет → без обёртки
      const s = schemeIdFromProp(props.colorScheme);
      const body = s ? `<div class="color-scheme-${s}">${html}</div>` : html;
      const p=await b.newPage({viewport:{width:1440,height:900}});
      await p.route('**/*',(q)=>{const u=q.request().url();return (u.startsWith('data:')||u.startsWith('about:'))?q.continue():q.abort();});
      await p.setContent(`<!doctype html><html><head><style>${css}</style><style>${tok}</style><style>html,body{margin:0;background:rgb(1,2,3)}</style></head><body><div id="probe">${body}</div></body></html>`);
      await p.waitForTimeout(100);
      got.push(await p.evaluate(()=>{const T='rgba(0, 0, 0, 0)';
        // Поверхность блока: самый большой закрашенный узел во всю ширину.
        // Селектор 'div' ловил ОБЁРТКУ СХЕМЫ (она прозрачная) и давал ложный
        // «ЗАМЁРЗ» в случае «проп есть» — поймано на первом же прогоне.
        let best=-1,bg='—';
        const probe=document.getElementById('probe');
        const w=probe.getBoundingClientRect().width;
        for (const el of probe.querySelectorAll('*')) {
          const c=getComputedStyle(el).backgroundColor;
          if(!c||c===T) continue;
          const b=el.getBoundingClientRect();
          if(b.width < w-1) continue;
          const a=b.width*b.height;
          if(a>best){best=a;bg=c;}
        }
        return bg;}));
      await p.close();
    }
    const sh=(c)=>String(c).replace('rgb(','').replace(')','').replace(/, /g,',');
    console.log(`${t.padEnd(8)}${BL.padEnd(16)}${label.padEnd(14)}${sh(got[0]).padEnd(15)}${sh(got[1]).padEnd(15)}${got[0]!==got[1]?'следует схеме':'ЗАМЁРЗ'}`);
  }
 }
}
await b.close();
