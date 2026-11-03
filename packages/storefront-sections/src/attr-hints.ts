// Чем заменить запрещённую запись (script-attrs.ts). Отказ — из ядра витрины (@merfy/shell/attributes), а подсказки живут
// здесь: в бандл страницы они не нужны, это вес витрины.
// Цвет, размер и положение из данных — переменная CSS: El.cssVar(имя, значение) и var(--имя) в шаблоне (у SVG —
// fill="var(--имя)": классы с var() запрещены, SVG-слой — путь); видимость — show, hide, toggle.
const CSS_VAR =
  'цвет, размер и положение из данных — cssVar("имя", значение) и var(--имя) в шаблоне (у SVG: fill="var(--имя)")';
const GENERAL =
  'можно aria-*, свои data-*, hidden, disabled, title, alt, open, tabindex, role, placeholder, min, max, step, href и src; вид — классы словаря, цвет и размер из данных — cssVar';
const ADDRESS = 'адрес — от корня сайта (/…), #якорь, https:, mailto: или tel:; у картинки — / или https:';
const VAR_NAME = 'имя без «--»: cssVar("pick-bg", цвет) пишет --pick-bg';
const VAR_VALUE = 'в переменную идут цвет, число или длина; картинка — поле изображения и тег img в шаблоне';
const ADDRESS_NAMES: ReadonlySet<string> = new Set(['href', 'src']);
const PRESENTATION: ReadonlySet<string> = new Set(
  `style fill fill-opacity stroke stroke-width stroke-opacity stop-color color bgcolor background opacity width height
   size transform d points x y cx cy r rx ry viewbox`.split(/\s+/),
);
const VISIBILITY: ReadonlySet<string> = new Set(['display', 'visibility']);

// Подсказка к отказу attr; name — в нижнем регистре. href и src отказывают только по адресу: тег при сохранении — img.
export function attrHint(name: string): string {
  if (ADDRESS_NAMES.has(name)) return ADDRESS;
  if (PRESENTATION.has(name)) return CSS_VAR;
  if (VISIBILITY.has(name)) return 'видимость — show(), hide(), toggle(on) или атрибут hidden';
  if (name === 'class') return 'класс словаря — toggleClass(имя, on); вид задают классы шаблона';
  if (name === 'id') return 'элемент находят по data-ref, id ставит шаблон';
  if (name.startsWith('on')) return 'событие — ctx.listen(…) или data-action в шаблоне и actions секции';
  if (name.startsWith('data-'))
    return 'служебные data-* платформы пишет шаблон; свои data-* — любые, кроме data-merfy-*';
  return GENERAL;
}

// Подсказка к отказу cssVar: неверное имя или неверное значение.
export const cssVarHint = (badName: boolean): string => (badName ? VAR_NAME : VAR_VALUE);
