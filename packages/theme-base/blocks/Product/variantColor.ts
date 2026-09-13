/**
 * Имя варианта → цвет образца (свотча) секции «Товар».
 *
 * Баг тестировщика (2026-09-13, п.6): при «Вариации: Круг» восемь образцов из
 * девяти стали кружками 48×48, а «Светло-голубой» остался текст-кнопкой 145×48.
 * Распознавание цвета было ТОЧНЫМ совпадением со словарём
 * (`COLOR_HEX[value.toLowerCase()]`), поэтому мимо словаря пролетал целый класс
 * имён: составные и дефисные («светло-голубой», «тёмно-синий», «сине-зелёный»),
 * с лишними пробелами, с «ё», в другом падеже/роде («голубая»).
 *
 * Здесь чинится класс, а не одно значение:
 *   1) нормализация — регистр, ё→е, дефис/тире/подчёркивание → пробел,
 *      повторные пробелы схлопываются;
 *   2) точное попадание в словарь;
 *   3) разбор составного имени: базовый цвет ищется с КОНЦА (в русском главное
 *      слово последнее: «светло-голубой» = голубой), слова перед ним — либо
 *      модификатор светлоты («светло», «тёмно», light, dark), либо второй цвет
 *      («сине-зелёный» = смесь). Основа слова сравнивается без окончания
 *      прилагательного, поэтому «голубая»/«голубые» тоже находят «голубой».
 *
 * Не цвет (размеры, объёмы, материалы) обязан оставаться НЕ распознанным —
 * иначе текст-чипы «S/M/L» превратятся в пустые кружки. Поэтому основа короче
 * трёх букв никогда не матчится по префиксу.
 *
 * Тот же алгоритм живёт во втором порте секции —
 * `themes/flux/src/lib/storefront-hydrate.ts` (colorToHex), у flux собственная
 * палитра. За расхождение портов отвечает
 * `src/themes/__tests__/variant-swatch-color-names.spec.ts`.
 */

/** Базовая палитра имён. Значения — историческая палитра свотчей theme-base. */
const COLOR_HEX: Record<string, string> = {
  'чёрный': '#000', 'черный': '#000', black: '#000',
  'белый': '#fff', white: '#fff',
  'серебро': '#c0c0c0', 'серебряный': '#c0c0c0', 'серебристый': '#c0c0c0', silver: '#c0c0c0',
  'серый': '#888', gray: '#888', grey: '#888',
  'красный': '#e00', red: '#e00',
  'синий': '#33396d', blue: '#33396d',
  'зелёный': '#3eb489', 'зеленый': '#3eb489', green: '#3eb489',
  'жёлтый': '#f6dc58', 'желтый': '#f6dc58', yellow: '#f6dc58',
  'коричневый': '#8b4513', brown: '#8b4513',
  'оранжевый': '#ff7f0e', orange: '#ff7f0e',
  'розовый': '#ff69b4', pink: '#ff69b4',
  'фиолетовый': '#7b3fa0', purple: '#7b3fa0', violet: '#7b3fa0',
  'бежевый': '#f5f0e1', beige: '#f5f0e1',
  'голубой': '#5bc0de', cyan: '#5bc0de',
  'бирюзовый': '#2dbfb0', teal: '#2dbfb0',
  'бордовый': '#6e1423',
  'золотой': '#d4af37', gold: '#d4af37',
  'графит': '#3a3a3a', graphite: '#3a3a3a',
};

/** Модификаторы светлоты: основа слова → сдвиг (+ к белому, − к чёрному). */
const MODIFIER_SHIFT: Record<string, number> = {
  'светл': 0.35, 'бледн': 0.3, 'нежн': 0.3, 'пастельн': 0.3,
  light: 0.35, pale: 0.3, soft: 0.3,
  'темн': -0.35, 'глубок': -0.3, dark: -0.35, deep: -0.3,
  // Узнаём, но светлоту не двигаем: это про насыщенность/фактуру, не про тон.
  'ярк': 0, 'насыщенн': 0, 'матов': 0, 'глянцев': 0, 'металлик': 0,
  bright: 0, neon: 0, 'неон': 0,
};

/** Окончания прилагательных — снимаются при сравнении основ. Длинные раньше. */
const ADJECTIVE_ENDINGS = [
  'ыми', 'ими', 'ого', 'его', 'ому', 'ему',
  'ый', 'ий', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие',
  'ым', 'им', 'ых', 'их', 'ую', 'юю',
  'о', 'е',
];

/** Регистр, ё/е, дефисы и тире, повторные пробелы — к одному виду. */
export function normalizeColorName(raw?: string | null): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е') // ё → е
    .replace(/[-_/\\‐-―−]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Основа слова: снимаем окончание прилагательного, если остаётся ≥3 букв. */
function stem(word: string): string {
  if (word.length < 4) return word;
  for (const end of ADJECTIVE_ENDINGS) {
    if (word.length - end.length >= 3 && word.endsWith(end)) {
      return word.slice(0, word.length - end.length);
    }
  }
  return word;
}

/** Основа → цвет. Строится один раз из словаря. */
const STEM_HEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [name, hex] of Object.entries(COLOR_HEX)) {
    const s = stem(normalizeColorName(name));
    if (!m.has(s)) m.set(s, hex);
  }
  return m;
})();

const NORMALIZED_HEX: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(COLOR_HEX)) out[normalizeColorName(name)] = hex;
  return out;
})();

/** Слово → цвет: точное имя, затем основа, затем общий префикс основ (≥4). */
function lookupBase(word: string): string | null {
  if (!word) return null;
  const direct = NORMALIZED_HEX[word];
  if (direct) return direct;
  const s = stem(word);
  const byStem = STEM_HEX.get(s);
  if (byStem) return byStem;
  if (s.length >= 4) {
    for (const [key, hex] of STEM_HEX) {
      if (key.length >= 4 && (key.startsWith(s) || s.startsWith(key))) return hex;
    }
  }
  return null;
}

function lookupModifier(word: string): number | undefined {
  const s = stem(word);
  if (Object.prototype.hasOwnProperty.call(MODIFIER_SHIFT, s)) return MODIFIER_SHIFT[s];
  return Object.prototype.hasOwnProperty.call(MODIFIER_SHIFT, word)
    ? MODIFIER_SHIFT[word]
    : undefined;
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  // eslint-disable-next-line no-bitwise
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Смешение двух цветов: t=0 — первый, t=1 — второй. */
function mixHex(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_RE = /^(rgb|rgba|hsl|hsla)\(/i;

/**
 * Значение опции (+ подсказка платформы `swatchHex`) → CSS-цвет свотча.
 * Не распознали — null: опция останется текст-чипом, как и было для размеров.
 */
export function resolveVariantColor(
  value?: string | null,
  hint?: string | null,
): string | null {
  const h = (hint ?? '').trim();
  if (HEX_RE.test(h) || FUNC_RE.test(h)) return h;

  const raw = (value ?? '').trim();
  if (!raw) return null;
  if (HEX_RE.test(raw) || FUNC_RE.test(raw)) return raw;

  const normalized = normalizeColorName(raw);
  if (!normalized) return null;
  const exact = NORMALIZED_HEX[normalized];
  if (exact) return exact;

  const words = normalized.split(' ');
  let baseIdx = -1;
  let color: string | null = null;
  for (let i = words.length - 1; i >= 0; i--) {
    const hit = lookupBase(words[i]);
    if (hit) {
      color = hit;
      baseIdx = i;
      break;
    }
  }
  if (!color) return null;

  let shift = 0;
  for (let i = 0; i < baseIdx; i++) {
    const mod = lookupModifier(words[i]);
    if (mod !== undefined) {
      shift += mod;
      continue;
    }
    const second = lookupBase(words[i]);
    if (second) color = mixHex(color, second, 0.5);
  }
  if (shift > 0) color = mixHex(color, '#ffffff', Math.min(shift, 0.75));
  if (shift < 0) color = mixHex(color, '#000000', Math.min(-shift, 0.75));
  return color;
}
