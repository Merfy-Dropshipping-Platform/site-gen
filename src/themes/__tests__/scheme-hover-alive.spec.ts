/**
 * Наведение на кнопку обязано отличаться от покоя — и обязано быть ТЕМ цветом,
 * который объявлен в `theme.json`, а не вычисленным по дороге.
 *
 * ЧТО БЫЛО (замер 17.09, до правки). Ни одна из 21 схемы пяти тем не объявляла
 * ни одного hover-токена. На уровне `.color-scheme-N` их не было ВОВСЕ, поэтому
 * кнопка наследовала наведение из `:root` — то есть цвет кнопки схемы ПО
 * УМОЛЧАНИЮ. У 72 пар из 104 это давало наведение, равное покою (мертво), а у
 * остальных — прыжок в цвет чужой схемы: у bloom кнопка схемы 3 (розовая
 * 207 122 139) при наведении становилась БЕЛОЙ, потому что белая кнопка у
 * схемы 1. Разрыв цепочки был в `themeSchemeToMerchantShape`: конвертер схемы
 * темы в merchant-shape переносил у кнопок только background/text/border, и
 * поля «При наведении» в редакторе схем конструктора стояли пустыми — их и
 * удалил коммит `9b1f685` вместо того, чтобы наполнить.
 *
 * ЧТО СТОРОЖИМ.
 *  G1 — в `theme.json` каждой темы у каждой схемы объявлены цвета наведения, и
 *       фон наведения НЕ равен обычному фону.
 *  G2 — объявленное значение доезжает до собранного CSS дословно. Проверяем
 *       НАРОЧНО «диким» цветом, который вывод из фона никогда бы не дал:
 *       иначе тест прошёл бы и на выведенном значении, не заметив, что
 *       перенос из theme.json оторвался.
 *  G3 — в собранном `tokens.css` у каждой схемы фон наведения отличается от
 *       покоя, а контраст надписи при наведении не падает ниже 4.5 там, где в
 *       покое он был не ниже 4.5.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildTokensCss,
  themeSchemeToMerchantShape,
  contrastRatio,
} from '../tokens-css';

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;
/** Семейства токенов кнопок. `-secondary-` объявляют не все темы. */
const FAMILIES = ['--color-button', '--color-button-secondary', '--color-button-2'] as const;

interface ThemeScheme {
  id: string;
  name: string;
  tokens: Record<string, string>;
}

function manifest(theme: string): { colorSchemes?: ThemeScheme[] } {
  return JSON.parse(
    readFileSync(resolve(__dirname, `../../../packages/theme-${theme}/theme.json`), 'utf8'),
  );
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of block.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name.startsWith('--') && value) out[name] = value;
  }
  return out;
}

/** Все `:root`-блоки слитно: при равной специфичности выигрывает последний. */
function rootTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /:root\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) Object.assign(out, declarations(m[1]));
  return out;
}

function schemeBlocks(css: string): Array<[string, Record<string, string>]> {
  const out: Array<[string, Record<string, string>]> = [];
  const re = /\.color-scheme-([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push([m[1], declarations(m[2])]);
  return out;
}

describe('G1 — theme.json объявляет живое наведение у каждой схемы', () => {
  for (const theme of THEMES) {
    const schemes = manifest(theme).colorSchemes ?? [];

    it(`${theme}: схемы вообще есть`, () => {
      expect(schemes.length).toBeGreaterThan(0);
    });

    for (const scheme of schemes) {
      for (const family of FAMILIES) {
        const bg = scheme.tokens[`${family}-bg`];
        // Тема объявляет это семейство? Нет — с неё и спроса нет.
        if (!bg) continue;

        it(`${theme}/${scheme.id}/${family}: наведение объявлено и не равно покою`, () => {
          const bgHover = scheme.tokens[`${family}-bg-hover`];
          expect(bgHover).toBeDefined();
          // Ровно та беда, ради которой сторож и написан: наведение,
          // неотличимое от покоя, — кнопка «не реагирует».
          expect(bgHover).not.toBe(bg);
          expect(scheme.tokens[`${family}-text-hover`]).toBeDefined();
        });
      }
    }
  }
});

describe('G2 — объявленное в theme.json значение доезжает до CSS дословно', () => {
  /**
   * «Дикие» цвета: вывод из фона (осветлить/затемнить на 12 %) не способен
   * дать ни один из них. Если перенос оторвётся, в CSS окажется выведенное
   * значение — и сверка упадёт, вместо того чтобы молча сойтись.
   */
  const WILD_BG = '17 211 88';
  const WILD_TEXT = '240 12 199';
  const WILD_BG_2 = '9 44 233';
  const WILD_TEXT_2 = '255 214 0';

  const source: ThemeScheme = {
    id: 'scheme-1',
    name: 'Схема 1',
    tokens: {
      '--color-bg': '255 255 255',
      '--color-text': '0 0 0',
      '--color-button-bg': '0 0 0',
      '--color-button-text': '255 255 255',
      '--color-button-bg-hover': WILD_BG,
      '--color-button-text-hover': WILD_TEXT,
      '--color-button-2-bg': '255 255 255',
      '--color-button-2-text': '0 0 0',
      '--color-button-2-bg-hover': WILD_BG_2,
      '--color-button-2-text-hover': WILD_TEXT_2,
    },
  };

  it('themeSchemeToMerchantShape переносит наведение в backgroundHover/textHover', () => {
    const shape = themeSchemeToMerchantShape(source) as {
      primaryButton: Record<string, string>;
      secondaryButton: Record<string, string>;
    };
    // hex-представление тех же троек.
    expect(shape.primaryButton.backgroundHover).toBe('#11d358');
    expect(shape.primaryButton.textHover).toBe('#f00cc7');
    expect(shape.secondaryButton.backgroundHover).toBe('#092ce9');
    expect(shape.secondaryButton.textHover).toBe('#ffd600');
  });

  it('значение мерчанта доезжает до .color-scheme-N и :root', () => {
    const merchant = themeSchemeToMerchantShape(source);
    const css = buildTokensCss({ colorSchemes: [merchant] }, 'rose');
    for (const wild of [WILD_BG, WILD_TEXT, WILD_BG_2, WILD_TEXT_2]) {
      expect(css).toContain(wild);
    }
    const one = schemeBlocks(css).find(([id]) => id === '1');
    expect(one).toBeDefined();
    expect(one![1]['--color-button-bg-hover']).toBe(WILD_BG);
    expect(one![1]['--color-button-text-hover']).toBe(WILD_TEXT);
    // Алиасы secondary ≡ button-2 обязаны нести то же значение.
    expect(one![1]['--color-button-secondary-bg-hover']).toBe(WILD_BG_2);
    expect(one![1]['--color-button-2-bg-hover']).toBe(WILD_BG_2);
  });

  it('значение из манифеста темы доезжает до .color-scheme-N', () => {
    // Схема темы, которую мерчант НЕ переопределял, — вторая ветка генератора
    // (`buildThemeSchemeRule`). У неё свой путь, и он тоже обязан быть дословным.
    for (const theme of THEMES) {
      const css = buildTokensCss({}, theme);
      const blocks = new Map(schemeBlocks(css));
      for (const scheme of manifest(theme).colorSchemes ?? []) {
        const built = blocks.get(scheme.id.replace('scheme-', ''));
        expect(built).toBeDefined();
        for (const family of FAMILIES) {
          const declared = scheme.tokens[`${family}-bg-hover`];
          if (!declared) continue;
          expect(`${theme}/${scheme.id}/${family}=${built![`${family}-bg-hover`]}`).toBe(
            `${theme}/${scheme.id}/${family}=${declared}`,
          );
        }
      }
    }
  });
});

describe('G3 — в собранном tokens.css наведение живое и читаемое', () => {
  for (const theme of THEMES) {
    it(`${theme}: фон при наведении отличается от покоя у каждой схемы`, () => {
      const css = buildTokensCss({}, theme);
      const root = rootTokens(css);
      const dead: string[] = [];
      for (const [id, own] of schemeBlocks(css)) {
        for (const family of ['--color-button', '--color-button-2']) {
          const bg = own[`${family}-bg`] ?? root[`${family}-bg`];
          const hover = own[`${family}-bg-hover`] ?? root[`${family}-bg-hover`];
          if (!bg) continue;
          if (!hover || hover === bg) dead.push(`scheme-${id}${family} покой=${bg} навед=${hover}`);
        }
      }
      expect(dead).toEqual([]);
    });

    it(`${theme}: контраст надписи при наведении не падает ниже 4.5, если в покое был выше`, () => {
      const css = buildTokensCss({}, theme);
      const root = rootTokens(css);
      const broken: string[] = [];
      for (const [id, own] of schemeBlocks(css)) {
        for (const family of ['--color-button', '--color-button-2']) {
          const pick = (k: string) => own[k] ?? root[k];
          const bg = pick(`${family}-bg`);
          const text = pick(`${family}-text`);
          const bgH = pick(`${family}-bg-hover`);
          const textH = pick(`${family}-text-hover`);
          if (!bg || !text || !bgH || !textH) continue;
          const rest = contrastRatio(text, bg);
          const hover = contrastRatio(textH, bgH);
          if (rest === null || hover === null) continue;
          // Порог требуем только там, где он держался в покое. У bloom
          // (розовый текст на белом) контраст ниже 4.5 — это палитра темы,
          // менять её в покое не наше дело; там сторожим «не хуже покоя».
          const floor = Math.min(4.5, rest);
          if (hover < floor - 0.001) {
            broken.push(
              `scheme-${id}${family}: покой=${rest.toFixed(2)} наведение=${hover.toFixed(2)}`,
            );
          }
        }
      }
      expect(broken).toEqual([]);
    });
  }
});
