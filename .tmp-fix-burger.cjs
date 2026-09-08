// Bug1: бургер «Боковое» — перенести из правого кластера в дальний левый край (3 раскладки).
const fs = require('fs');
const F = 'themes/rose/src/components/Header.astro';
let s = fs.readFileSync(F, 'utf8');
fs.writeFileSync(F + '.bak', s);

const BURGER = `{isSidebar && (
									<button type="button" data-burger-toggle class="flex size-8 items-center justify-center transition-opacity hover:opacity-80" aria-label="Меню" aria-expanded="false" aria-controls="rose-burger">
										<span class="burger-icon" data-icon="open"><RoseNtIcon name="menu-burger" sizeClass="size-6" /></span>
										<span class="burger-icon hidden" data-icon="close"><RoseNtIcon name="menu-close" sizeClass="size-6" /></span>
									</button>
								)}`;

// 1) Убрать 3 правых бургера (любая глубина отступа)
const reRight = /[ \t]*\{isSidebar && \(\s*<button[\s\S]*?data-burger-toggle[\s\S]*?<\/button>\s*\)\}\n?/g;
const removed = (s.match(reRight) || []).length;
s = s.replace(reRight, '');
if (removed !== 3) { console.error(`ABORT: ожидалось 3 правых бургера, найдено ${removed}`); process.exit(1); }

// 2A) top-left: обернуть лого слева [бургер + лого]
let a = 0;
s = s.replace(/(<a\s+href="\/"\s+class="shrink-0 font-comfortaa[\s\S]*?<\/a>)/, (m) => {
  a++;
  return `<div class="flex items-center gap-3 lg:gap-4">\n\t\t\t\t\t\t\t\t\t\t${BURGER}\n\t\t\t\t\t\t\t\t\t\t${m}\n\t\t\t\t\t\t\t\t\t</div>`;
});

// 2B) top-center: бургер в ЛЕВУЮ ячейку перед поиском
let b = 0;
s = s.replace(/(<div class="flex items-center">\s*)(<button\s+type="button"\s+data-action="toggle-search")/, (m, p1, p2) => {
  b++;
  return `${p1}${BURGER}\n\t\t\t\t\t\t\t\t${p2}`;
});

// 2C) single-row: бургер перед лого внутри desktopRowCls
let c = 0;
s = s.replace(/(<div class=\{desktopRowCls\} style=\{headerPadStyle\}>\s*)(<a href="\/" class:list=\{\[desktopLogoCls)/, (m, p1, p2) => {
  c++;
  return `${p1}${BURGER}\n\t\t\t\t\t\t\t\t${p2}`;
});

if (a !== 1 || b !== 1 || c !== 1) { console.error(`ABORT: вставки A=${a} B=${b} C=${c} (ожидалось 1/1/1)`); process.exit(1); }

fs.writeFileSync(F, s);
console.log(`OK: убрано правых=${removed}, вставлено слева A=${a} B=${b} C=${c}`);
