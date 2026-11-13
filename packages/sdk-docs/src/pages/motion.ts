import { EASINGS, type PresetSpec } from '@merfy/shell/behaviors/catalog';
import { PRESETS } from '@merfy/shell/behaviors/presets';
import { FORBIDDEN_IN_VALUE } from '@merfy/shell/keyframes';
import { LIBRARIES, LIB_USE_PREFIX, LIBRARY_NAMES } from '@merfy/shell/libraries';

// motion.md (спека «Анимации»): таблицы страницы «Анимации» из кода SDK — пресеты data-animate (PRESETS), что нельзя в
// значении ctx.animate (FORBIDDEN_IN_VALUE; с 13.11 свойство любое), кривые (EASINGS) и библиотеки SDK (LIBRARIES).
// Проза и рецепты — в guide/motion.md, метки data: вставляют сюда.
const TARGET_TEXT: Readonly<Record<PresetSpec['target'], string>> = {
  self: 'сам элемент',
  children: 'каждый прямой потомок элемента',
  letters: 'каждая буква текста элемента',
  words: 'каждое слово текста элемента, из-под маски',
  lines: 'каждая строка текста элемента, из-под маски',
  shapes: 'каждая линия SVG внутри элемента (`path`, `line`, `polyline`, `polygon`, `circle`, `ellipse`, `rect`)',
  section: 'вся секция (ближайшая `merfy-section`)',
};

const EASING_TEXT: Readonly<Record<string, string>> = {
  linear: 'без ускорения',
  'ease-out': 'слово CSS `ease-out`; умолчание `ctx.animate`',
  decelerate: 'выезд панелей, класс Tailwind `ease-out`',
  material: 'стандартная кривая «материал»: `fade-up`, `slide-down`, `load-*`',
  'power2.out': 'мягкое замедление в конце: `appear`, `appear-group`, `letters`',
  'power3.out': 'резче замедление: `appear-side`',
  'power2.in': 'мягкий разгон: уход элемента',
  'power3.in': 'резкий разгон',
  'power2.inOut': 'разгон и торможение',
  'back.out': 'небольшой перелёт и возврат: «пружинка»',
  'expo.out': 'быстрый старт и долгое торможение, как у сайтов с Awwwards: `words`, `lines`, `mask-up`',
};

const num = (value: number): string => String(value).replace('.', ',');

// '0px 0px -15% 0px' → «за 15 % до нижнего края окна»; нижний отступ — третье значение.
function marginText(margin: string): string {
  const bottom = margin.split(' ')[2] ?? '0px';
  const match = bottom.match(/^-?(\d+(?:\.\d+)?)(px|%)$/);
  if (match === null || match[1] === undefined || Number(match[1]) === 0)
    return 'как только элемент показался у нижнего края окна';
  return `когда элемент поднялся над нижним краем окна на ${num(Number(match[1]))} ${match[2] === '%' ? '% высоты окна' : 'px'}`;
}

const move = (value: number, unit: PresetSpec['unit']): string => `${num(Math.abs(value))} ${unit}`;

// «Откуда»: прозрачность 0 и сдвиг; знак y: больше нуля — снизу вверх, меньше — сверху вниз.
function fromText(spec: PresetSpec): string {
  const parts = spec.opacity === 1 ? [] : [`прозрачность ${num(spec.opacity)} → 1`];
  if (spec.x !== 0) {
    const side = spec.target === 'section' ? 'слева у чётной секции `main`, справа у нечётной' : 'сбоку';
    parts.push(`${move(spec.x, spec.unit)} ${side}`);
  }
  if (spec.y !== 0) parts.push(`${move(spec.y, spec.unit)} ${spec.y > 0 ? 'снизу' : 'сверху'}`);
  Object.entries(spec.extra ?? {})
    .filter(([, [from, to]]) => from !== to)
    .forEach(([name, [from, to]]) => parts.push(`\`${name}\` ${from} → ${to}`));
  return parts.join(', ');
}

function whenText(spec: PresetSpec): string {
  if (spec.trigger === 'load') return `при загрузке страницы, через ${spec.delay} мс`;
  const base = `${marginText(spec.margin)}, один раз`;
  return spec.visibleAtStart === 'show'
    ? `${base}; уже видимый при загрузке не анимируется`
    : `${base}; уже видимый при загрузке играет сразу`;
}

function presetsTable(): string {
  const rows = Object.entries(PRESETS).map(([name, spec]) => {
    const between = spec.stagger === 0 ? '—' : String(spec.stagger);
    return `| \`${name}\` | ${TARGET_TEXT[spec.target]} | ${fromText(spec)} | ${spec.duration} | \`${spec.easing}\` | ${between} | ${whenText(spec)} |`;
  });
  return [
    '| Пресет | Что движется | Откуда | Время, мс | Кривая | Между элементами, мс | Когда играет |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

// Часть значения в ячейке кода; «|» разорвал бы строку таблицы markdown, поэтому экранируется.
const codeCell = (part: string): string => `\`${part.replaceAll('|', '\\|')}\``;

function forbiddenTable(): string {
  const rows = FORBIDDEN_IN_VALUE.map(([part, why]) => `| ${codeCell(part)} | ${why} |`);
  return ['| Нельзя в значении | Почему |', '|---|---|', ...rows].join('\n');
}

function librariesTable(): string {
  const rows = LIBRARY_NAMES.map((name) => {
    const spec = LIBRARIES[name];
    const api = spec.api.map((method) => `\`ctx.lib.${name}.${method}\``).join(', ');
    return `| \`"${LIB_USE_PREFIX}${name}"\` | ${spec.title} | ${api} | \`${spec.package}\` ${spec.version}, ${spec.license} | ${spec.budget} |`;
  });
  return [
    '| В `uses` | Что даёт | Методы | Пакет, лицензия | Вес на странице, до Б (brotli) |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function easingsTable(): string {
  const rows = Object.entries(EASINGS).map(
    ([name, bezier]) => `| \`'${name}'\` | \`[${bezier.join(', ')}]\` | ${EASING_TEXT[name] ?? '—'} |`,
  );
  return ['| Имя | Кривая Безье | Где |', '|---|---|---|', ...rows].join('\n');
}

const MOTION_DATA: Readonly<Record<string, () => string>> = {
  'motion-presets': presetsTable,
  'motion-forbidden': forbiddenTable,
  'motion-easings': easingsTable,
  'motion-libraries': librariesTable,
};

// Метка `<!-- data: motion-presets -->` в guide/motion.md.
export function motionData(name: string): string | undefined {
  return MOTION_DATA[name]?.();
}
