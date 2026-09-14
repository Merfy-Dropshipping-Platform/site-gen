/**
 * Крошечный разрешатель каскада для таблицы стилей split-чекаута.
 *
 * Геометрию колонок чекаута задаёт ОДНА таблица — `CHECKOUT_SPLIT_CSS`
 * (packages/theme-base/blocks/CheckoutLayout/checkout-split.ts), общая для пяти
 * тем и для превью конструктора. Браузера в CI нет, поэтому гарды стоят не на
 * «строка есть в файле», а на ПОБЕДИВШЕМ значении свойства: правило можно
 * добавить и не заметить, что его перекрывает соседнее с большей
 * специфичностью (так уже ловили `padding` шапки — правило `--brand` проигрывало
 * сокращённой записи внутри медиазапроса).
 *
 * Модуль вынесен из гарда `checkout-form-fills-column.spec.ts`, когда второму
 * гарду (`checkout-sections-round4.spec.ts`) понадобился тот же разрешатель:
 * вторая копия разъехалась бы с первой молча. В `__tests__` его положить
 * нельзя — jest считает тестом любой `.ts` в этой папке.
 *
 * Понимает ровно то, что встречается в этой таблице: плоские правила, один
 * медиазапрос `min-width: 1024px`, шорткаты `padding`/`margin`, комментарии.
 */

export interface Rule {
  selector: string;
  decls: Record<string, string>;
  /** 0 — вне медиазапроса, 1 — внутри `@media (min-width: 1024px)`. */
  media: 0 | 1;
  order: number;
}

/** Раскрытие шорткатов, которые реально встречаются в этой таблице стилей. */
function expand(prop: string, value: string): Record<string, string> {
  if (prop !== 'padding' && prop !== 'margin') return { [prop]: value };
  const p = value.trim().split(/\s+/);
  const [top, right, bottom, left] =
    p.length === 1
      ? [p[0], p[0], p[0], p[0]]
      : p.length === 2
        ? [p[0], p[1], p[0], p[1]]
        : p.length === 3
          ? [p[0], p[1], p[2], p[1]]
          : [p[0], p[1], p[2], p[3]];
  return {
    [`${prop}-top`]: top,
    [`${prop}-right`]: right,
    [`${prop}-bottom`]: bottom,
    [`${prop}-left`]: left,
  };
}

export function parse(css: string): Rule[] {
  const rules: Rule[] = [];
  let order = 0;
  let media: 0 | 1 = 0;
  // Комментарии выкусываем: внутри них встречаются и `{`, и селекторы.
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let mediaEnd = -1;
  const mediaOpen = src.indexOf('@media (min-width: 1024px)');
  if (mediaOpen !== -1) mediaEnd = src.length;
  while ((m = re.exec(src))) {
    const rawSel = m[1].trim();
    if (rawSel.startsWith('@media')) {
      media = 1;
      continue;
    }
    if (mediaOpen !== -1 && m.index > mediaOpen && m.index < mediaEnd) media = 1;
    const decls: Record<string, string> = {};
    for (const chunk of m[2].split(';')) {
      const i = chunk.indexOf(':');
      if (i === -1) continue;
      Object.assign(
        decls,
        expand(chunk.slice(0, i).trim(), chunk.slice(i + 1).trim()),
      );
    }
    for (const selector of rawSel.split(',').map((s) => s.trim())) {
      if (selector) rules.push({ selector, decls, media, order: order++ });
    }
  }
  return rules;
}

/** Специфичность (a,b,c) достаточно грубая: id / класс-атрибут-псевдо / тип. */
export function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length;
  const types = (selector.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10000 + classes * 100 + types;
}

/**
 * Разрешённое значение свойства для «элемента», описанного списком селекторов,
 * которые на него попадают. Порядок: сначала специфичность, при равной —
 * позиция в файле; правила из медиазапроса применяются только на десктопе.
 */
export function resolve(
  rules: Rule[],
  matching: string[],
  prop: string,
  viewport: 'mobile' | 'desktop',
): string | undefined {
  const hits = rules
    .filter((r) => matching.includes(r.selector))
    .filter((r) => (viewport === 'desktop' ? true : r.media === 0))
    .filter((r) => r.decls[prop] !== undefined)
    .sort((a, b) => {
      if (a.media !== b.media) return a.media - b.media;
      const s = specificity(a.selector) - specificity(b.selector);
      return s !== 0 ? s : a.order - b.order;
    });
  return hits.length ? hits[hits.length - 1].decls[prop] : undefined;
}
