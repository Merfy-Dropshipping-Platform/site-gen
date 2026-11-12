import type { Bezier, EasingName } from '../types';

// Каталог готовых поведений и пресетов анимаций SDK (design.md блока 6, разделы 1, 3–9). Поведение: какие библиотеки
// нужны в бандле страницы, части (data-part внутри корня), параметры (data-<имя> на корне) — вид, умолчание, границы.
// Пресет data-animate: что движется, когда и как — значения пяти тем «один в один» (таблица раздела 9, факт 22).
// По каталогу ядро читает параметры (params.ts), проверка секции при сохранении (часть 6б) находит ошибки в разметке,
// сборка (часть 6б) выбирает библиотеки, документация для ИИ (блок 14) строит список. Данные — договор: добавить можно,
// менять нельзя. search — блок 11 (функция поиска SDK), zoom — блок 15, часть 15в (увеличение фото товара).

export type BehaviorName =
  | 'accordion'
  | 'dialog'
  | 'carousel'
  | 'tabs'
  | 'nav-menu'
  | 'quantity'
  | 'card-photos'
  | 'sticky-header'
  | 'video'
  // Блок 11 «Секций и SDK», часть 11б-2: листание и фильтры списка, подсказки поиска.
  | 'catalog'
  | 'search'
  // Блок 15, часть 15в (Р15в-3): увеличение фото товара — лупа при наведении или окно по нажатию.
  | 'zoom'
  // Общие части для разработчика расширения: таймер до даты (время сервера, модуль page) и стираемый слой.
  | 'countdown'
  | 'scratch';

export type Library = 'embla' | 'motion';

export type ParamSpec =
  | { readonly kind: 'enum'; readonly values: readonly string[]; readonly default: string }
  | { readonly kind: 'int'; readonly min: number; readonly max: number; readonly default: number }
  | { readonly kind: 'bool'; readonly default: boolean }
  | { readonly kind: 'string'; readonly default: string | null }
  | { readonly kind: 'list'; readonly default: readonly string[] };

// Команды поведения для скрипта секции (03.11): ctx.behavior('<имя>').<команда>(аргумент). Что у поведения есть как
// действие — то и команда; аргумент проверяет часть behaviors до вызова поведения. none — без аргумента; item — номер
// (с 0) или id пункта; index — номер (с 0); value — строка; options — объект или ничего (поля проверяет само поведение).
// Описание команд для людей — в документации SDK (sdk-docs, behaviors.md): в бандл страницы идёт только вид аргумента.
export type CommandArg = 'none' | 'item' | 'index' | 'value' | 'options';

export interface BehaviorSpec {
  readonly libraries: readonly Library[];
  readonly parts: readonly string[];
  readonly params: Readonly<Record<string, ParamSpec>>;
  readonly onSection: boolean; // может стоять на самой <merfy-section> (sticky-header, блок 7)
  readonly commands?: Readonly<Record<string, CommandArg>>; // команда → её аргумент; нет — скрипт поведением не управляет
}

export const BEHAVIORS: Readonly<Record<BehaviorName, BehaviorSpec>> = {
  accordion: {
    libraries: ['motion'],
    parts: ['content'],
    params: {},
    onSection: false,
    commands: { open: 'item', close: 'item', toggle: 'item' },
  },
  dialog: {
    libraries: ['motion'],
    parts: ['open', 'content', 'close'],
    params: {
      transition: { kind: 'enum', values: ['fade', 'drawer', 'drawer-back', 'drop'], default: 'fade' },
      side: { kind: 'enum', values: ['right', 'left'], default: 'right' },
      modal: { kind: 'bool', default: true },
      // Запрет прокрутки страницы, пока окно открыто; не зависит от модальности. "false" — страницу за окном можно листать
      // (панель поиска шапки, как на проде).
      'lock-scroll': { kind: 'bool', default: true },
      // Блок 10 (Р10а-6): открыть по событию SDK — cart-open: merfy:cart:open, cart-add: merfy:cart:add,
      // search-open: merfy:search:open (панель поиска, действие search.open).
      'open-on': { kind: 'enum', values: ['none', 'cart-open', 'cart-add', 'search-open'], default: 'none' },
      // Место немодального окна: section — под низом своей секции, header — под шапкой страницы (секции перед <main>),
      // cart — под значком корзины страницы (cart.open), середина окна под серединой значка; значка нет — как header.
      anchor: { kind: 'enum', values: ['section', 'header', 'cart'], default: 'section' },
      // Окно поверх экрана (03.11), где бы секция ни стояла — в шапке, теме или подвале. none — как раньше: место задают
      // классы окна и anchor. center и sheet — модальные (затемнение, фокус внутри, Esc, запрет прокрутки), модальное
      // окно на странице одно; corner — немодальное в углу (на телефоне шторкой снизу), страница под ним работает.
      // С position параметры transition, modal и anchor не читаются: переход и модальность — от места окна.
      position: { kind: 'enum', values: ['none', 'center', 'corner', 'sheet'], default: 'none' },
      // Затемнение страницы под модальным окном с position; у corner его нет.
      backdrop: { kind: 'bool', default: true },
    },
    onSection: false,
    commands: { open: 'options', close: 'none', toggle: 'none' },
  },
  carousel: {
    libraries: ['embla', 'motion'],
    parts: ['viewport', 'container', 'slide', 'prev', 'next', 'dot', 'thumb', 'counter', 'copy', 'play'],
    params: {
      effect: { kind: 'enum', values: ['slide', 'fade'], default: 'slide' },
      change: { kind: 'enum', values: ['500', '700'], default: '700' },
      autoplay: { kind: 'int', min: 0, max: 60, default: 0 },
      loop: { kind: 'bool', default: true },
      drag: { kind: 'bool', default: true },
      // Какой край окна занимает текущий слайд: у карточек, которых в окне несколько, — start, у слайдов во всю ширину
      // разницы нет, center ставит текущий слайд посередине.
      align: { kind: 'enum', values: ['start', 'center'], default: 'start' },
    },
    onSection: false,
    commands: { next: 'none', prev: 'none', goTo: 'index', play: 'none', pause: 'none' },
  },
  tabs: {
    libraries: [],
    parts: ['list', 'trigger', 'content'],
    params: {
      value: { kind: 'string', default: null },
      orientation: { kind: 'enum', values: ['horizontal', 'vertical'], default: 'horizontal' },
    },
    onSection: false,
    commands: { select: 'value' },
  },
  'nav-menu': {
    libraries: [],
    parts: ['list', 'item', 'trigger', 'content', 'link'],
    params: { 'open-on': { kind: 'enum', values: ['click', 'hover'], default: 'click' } },
    onSection: false,
  },
  quantity: { libraries: [], parts: ['input', 'minus', 'plus'], params: {}, onSection: false },
  'card-photos': {
    libraries: [],
    parts: ['image'],
    params: { photos: { kind: 'list', default: [] }, 'hover-next': { kind: 'bool', default: true } },
    onSection: false,
  },
  'sticky-header': {
    libraries: [],
    parts: [],
    params: { mode: { kind: 'enum', values: ['scroll-up', 'always', 'none'], default: 'scroll-up' } },
    onSection: true,
  },
  video: {
    libraries: [],
    parts: ['video', 'play'],
    params: {},
    onSection: false,
    commands: { play: 'none', pause: 'none' },
  },
  // Блок 11 (design.md 11.3, 11.5): paging — поле секции «Как листать»; limit — сколько подсказок.
  catalog: {
    libraries: [],
    parts: ['list', 'next', 'prev', 'pages', 'count', 'filters', 'empty', 'status'],
    params: { paging: { kind: 'enum', values: ['pages', 'more', 'scroll'], default: 'more' } },
    onSection: false,
  },
  search: {
    libraries: [],
    parts: ['input', 'results', 'item', 'link', 'image', 'title', 'price', 'compare', 'empty', 'all'],
    params: { limit: { kind: 'int', min: 1, max: 20, default: 8 } },
    onSection: false,
  },
  // Блок 15, часть 15в (Р15в-3): mode — поле «Увеличение» (на проде zoomMode, по умолчанию hover); photos — фото окна.
  zoom: {
    libraries: [],
    parts: ['image'],
    params: {
      mode: { kind: 'enum', values: ['hover', 'click'], default: 'hover' },
      photos: { kind: 'list', default: [] },
    },
    onSection: false,
  },
  // until — дата окончания, ISO 8601 с поясом; идёт по времени сервера ($now модуля page, uses: ["page"]).
  countdown: {
    libraries: [],
    parts: ['days', 'hours', 'minutes', 'seconds'],
    params: { until: { kind: 'string', default: null } },
    onSection: false,
  },
  // color — цвет слоя (любой цвет CSS, в том числе var(--токен)); reveal — кнопка «Показать» для клавиатуры.
  scratch: {
    libraries: [],
    parts: ['reveal'],
    params: { color: { kind: 'string', default: 'var(--muted-foreground)' } },
    onSection: false,
  },
};

// Кривые: GSAP пяти тем — массивом Безье (факт 22, расхождение с формулами GSAP не больше 0,01); ease-out — слово CSS
// (окно увеличения фото: `0.15s ease-out`, факт 12); decelerate — класс Tailwind `ease-out` (выезжающие панели четырёх
// тем, факт 12; на неё же ложится смена Embla Fade, замер 22.10); material — cubic-bezier(0.4, 0, 0.2, 1) rose, vanilla,
// bloom и переход Tailwind по умолчанию.
export const EASINGS: Readonly<Record<EasingName, Bezier>> = {
  linear: [0, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  decelerate: [0, 0, 0.2, 1],
  material: [0.4, 0, 0.2, 1],
  'power2.out': [0.33, 1, 0.68, 1],
  'power3.out': [0.25, 1, 0.5, 1],
  'power2.in': [0.32, 0, 0.67, 0],
  'power3.in': [0.5, 0, 0.75, 0],
  'power2.inOut': [0.65, 0, 0.35, 1],
  'back.out': [0.33, 1.36, 0.66, 1],
  // 12.11: долгое торможение, как у сайтов с Awwwards (easeOutExpo) — для масок, строк и размытия.
  'expo.out': [0.16, 1, 0.3, 1],
};

export type PresetName =
  | 'appear'
  | 'appear-group'
  | 'appear-side'
  | 'fade-up'
  | 'slide-down'
  | 'load-1'
  | 'load-2'
  | 'load-3'
  | 'letters'
  | 'words'
  | 'lines'
  | 'mask-up'
  | 'blur-in'
  | 'draw';

export interface PresetSpec {
  // что движется; section — ближайшая <merfy-section>; words и lines — слова и строки текста (каждая в обёртке-маске),
  // shapes — линии SVG (path, line, polyline, polygon, circle, ellipse, rect) с pathLength="1"
  readonly target: 'self' | 'children' | 'letters' | 'words' | 'lines' | 'shapes' | 'section';
  readonly trigger: 'view' | 'load'; // при попадании в экран или при загрузке страницы
  readonly margin: string; // отступ области наблюдения, как rootMargin
  readonly amount: number; // доля элемента в области наблюдения
  readonly opacity: number; // начальная прозрачность, конечная — 1
  readonly x: number; // начальный сдвиг по горизонтали; у appear-side знак — по чётности секции
  readonly y: number; // начальный сдвиг по вертикали
  readonly unit: 'px' | 'em' | '%';
  readonly duration: number; // мс
  readonly easing: EasingName;
  readonly stagger: number; // мс между элементами одной пачки (дети, буквы, элементы одного кадра)
  readonly delay: number; // мс; data-delay на элементе прибавляется
  readonly visibleAtStart: 'animate' | 'show'; // видимые при старте: анимировать сразу или показать без анимации
  // 12.11: кадры сверх прозрачности и сдвига — свойство → [начало, конец]. Начало ставится инлайном до появления, после
  // него инлайн снимается. Свойства — из списка ctx.animate (keyframes.ts).
  readonly extra?: Readonly<Record<string, readonly [string | number, string | number]>>;
}

// Данные пресетов (PRESETS, PRESET_PARAMS) — в presets.ts (12.11): в общий кусок всех поведений они не попадают.
