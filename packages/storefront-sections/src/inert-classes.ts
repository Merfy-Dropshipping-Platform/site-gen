// Классы, которые есть в словаре и собираются в CSS, но на экране ничего не рисуют (Н1 «MCP-опыта», 30.10): точки
// градиента без направления, направление без точек, вырезка фона по буквам без фона. Tailwind такие классы принимает —
// словарь и проверка «класс известен» пропускают их, а снимок секции остаётся прежним. Правила читают классы одного
// элемента: пользовательские свойства градиента (--tw-gradient-*) у Tailwind не наследуются (@property, inherits: false),
// поэтому соседний или внешний элемент их не заменит. Вариант (md:, hover:) не различается: основа с любым вариантом
// считается основой — отказ только там, где её нет совсем, ложные отказы дороже пропуска.

export interface ElementClass {
  name: string; // класс как в шаблоне, с вариантами
  utility: string; // то же без вариантов: from-primary
  at: number;
}

export interface InertFinding {
  at: number;
  message: string;
}

const DIRECTION = /^bg-(?:linear|radial|conic)(?:-|$)|^bg-gradient-to-/;
const STOP = /^(?:from|via|to)-/;
const CLIP_TEXT = 'bg-clip-text';
const TEXT_CLEAR = 'text-transparent';
// Совет в тексте отказа: токены разных ролей. В схемах тем primary и foreground часто одного цвета — градиент между ними
// плоский, поэтому пара в совете другая.
const GRADIENT_EXAMPLE = 'bg-linear-to-r from-destructive to-foreground';

const TEXT = {
  noDirection: (name: string) =>
    `класс ${name} не даёт стилей: точки градиента (from-, via-, to-) рисуют только вместе с направлением, а на элементе его нет · добавь bg-linear-to-r (или bg-radial, bg-conic)`,
  noStops: (name: string) =>
    `класс ${name} не даёт стилей: градиенту не из чего строиться — на элементе нет точек from-*, via-*, to-* · добавь цвета токенов: ${GRADIENT_EXAMPLE}`,
  noFill: (name: string) =>
    `класс ${name} не даёт стилей, а прячет текст: bg-clip-text вырезает фон по буквам, фона на элементе нет · добавь градиент (${GRADIENT_EXAMPLE}) или цвет фона bg-*, либо убери bg-clip-text и ${name}`,
} as const;

// fills(utility) — класс задаёт цвет фона (у Tailwind со словарём в CSS есть background-color).
export function inertFindings(classes: readonly ElementClass[], fills: (utility: string) => boolean): InertFinding[] {
  const stops = classes.filter((item) => STOP.test(item.utility));
  const directions = classes.filter((item) => DIRECTION.test(item.utility));
  const found: InertFinding[] = [];
  const firstStop = stops[0];
  if (firstStop !== undefined && directions.length === 0) {
    found.push({ at: firstStop.at, message: TEXT.noDirection(firstStop.name) });
  }
  const firstDirection = directions[0];
  if (firstDirection !== undefined && stops.length === 0) {
    found.push({ at: firstDirection.at, message: TEXT.noStops(firstDirection.name) });
  }
  // Прозрачный текст на вырезке фона: без градиента и без цвета фона его не видно совсем. Только без варианта: с hover:
  // и подобными текст — задумка (показать при наведении), её не трогаем.
  const clear = classes.find((item) => item.name === TEXT_CLEAR);
  const clipped = classes.some((item) => item.utility === CLIP_TEXT);
  if (clear !== undefined && clipped && directions.length === 0 && !classes.some((item) => fills(item.utility))) {
    found.push({ at: clear.at, message: TEXT.noFill(clear.name) });
  }
  return found;
}
