import { EASINGS, PRESETS, type PresetSpec } from '@merfy/shell/behaviors/catalog';
import { ANIMATABLE } from '@merfy/shell/keyframes';

// motion.md (этап 1 спеки «Анимации»): таблицы страницы «Анимации» из кода SDK — пресеты data-animate (PRESETS),
// свойства ctx.animate (ANIMATABLE) и кривые (EASINGS). Проза и рецепты — в guide/motion.md, метки data: вставляют сюда.
const TARGET_TEXT: Readonly<Record<PresetSpec['target'], string>> = {
  self: 'сам элемент',
  children: 'каждый прямой потомок элемента',
  letters: 'каждая буква текста элемента',
  section: 'вся секция (ближайшая `merfy-section`)',
};

const ANIMATABLE_TEXT: Readonly<Record<string, string>> = {
  opacity: 'прозрачность, число от 0 до 1',
  transform:
    'вся трансформация строкой: `translateY(24px) scale(0.9)`; для одного вида движения лучше отдельные свойства ниже',
  translate: 'сдвиг: `0 24px` (по x и по y); отдельно от `scale` и `rotate`, их можно анимировать одновременно',
  scale: 'масштаб: число `0.9` или `1.1 1.1`',
  rotate: 'поворот: `15deg`',
  color: 'цвет текста: `#c9a227`, `rgb(…)`',
  backgroundColor: 'цвет фона',
  borderColor: 'цвет рамки',
  width: 'ширина: число (px) или строка с единицей `50%`',
  height: 'высота',
  maxHeight: 'предельная высота; так раскрывают блок: `[0, 240]`',
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
  const parts = [`прозрачность ${num(spec.opacity)} → 1`];
  if (spec.x !== 0) {
    const side = spec.target === 'section' ? 'слева у чётной секции `main`, справа у нечётной' : 'сбоку';
    parts.push(`${move(spec.x, spec.unit)} ${side}`);
  }
  if (spec.y !== 0) parts.push(`${move(spec.y, spec.unit)} ${spec.y > 0 ? 'снизу' : 'сверху'}`);
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

function animatableTable(): string {
  const rows = [...ANIMATABLE].map((name) => `| \`${name}\` | ${ANIMATABLE_TEXT[name] ?? '—'} |`);
  return ['| Свойство | Значение |', '|---|---|', ...rows].join('\n');
}

function easingsTable(): string {
  const rows = Object.entries(EASINGS).map(
    ([name, bezier]) => `| \`'${name}'\` | \`[${bezier.join(', ')}]\` | ${EASING_TEXT[name] ?? '—'} |`,
  );
  return ['| Имя | Кривая Безье | Где |', '|---|---|---|', ...rows].join('\n');
}

const MOTION_DATA: Readonly<Record<string, () => string>> = {
  'motion-presets': presetsTable,
  'motion-animatable': animatableTable,
  'motion-easings': easingsTable,
};

// Метка `<!-- data: motion-presets -->` в guide/motion.md.
export function motionData(name: string): string | undefined {
  return MOTION_DATA[name]?.();
}
