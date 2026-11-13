import type {
  AnimateOptions,
  Animation,
  BaseCtx,
  BehaviorHandleName,
  BehaviorHandles,
  CoreHandle,
  El,
  InViewOptions,
  Json,
  Keyframes,
  LibModules,
  Mode,
  NoData,
  PointerPoint,
  Result,
  ScrollOptions,
  SdkPart,
  SplitBy,
  Stop,
} from '../types';
import type { ElScope } from '../el';
import type { Guard } from '../guard';
import type { BehaviorName } from './catalog';
import type { LibraryName } from './libraries';
import type { Params } from './params';

// Договор части behaviors (design.md блока 6, раздел 2): готовые поведения подключаются к экземпляру секции до mount
// (SdkPart.attach блока 5) и снимаются его сигналом. Состав части на странице выбирает сборка (часть 6б): поведения —
// по data-behavior в HTML страницы, появления — если есть data-animate, провайдер ctx.animate — если его вызывает скрипт
// секции; бандл превью — всё.

export interface MotionPrefs {
  readonly reduced: boolean; // prefers-reduced-motion: reduce — переходы поведений сразу, появлений и автопрокрутки нет
  readonly preview: boolean; // превью конструктора: переходы поведений и автопрокрутка работают, список каталога — из превью
  readonly still: boolean; // экземпляр в превью запущен после правки настроек или текста: ctx.animate сразу в последнем кадре, появлений нет
}

export interface BehaviorHost {
  readonly root: HTMLElement; // элемент с data-behavior; у sticky-header — сама <merfy-section>
  readonly section: HTMLElement; // <merfy-section> экземпляра
  readonly params: Params; // readParams(root, BEHAVIORS[name].params)
  readonly motion: MotionPrefs;
  readonly signal: AbortSignal; // сигнал экземпляра: слушатели — с ним, Embla и анимации снимаются по нему
  // Блок 11 (Р11б-13): ядро страницы — события, уведомления, модули SDK (core.part). Поведения блока 6 его не читают.
  readonly core?: CoreHandle;
}

// Команда поведения для скрипта секции (ctx.behavior): аргумент уже проверен частью по виду из каталога (CommandSpec.arg).
export type BehaviorCommand = (arg: unknown) => Result<NoData>;

export interface BehaviorInstance {
  save?(): Json; // состояние для замены экземпляра в превью: номер слайда, открытые пункты, вкладка, окно
  restore?(state: Json): void;
  // Команды из скрипта секции: имена — commands поведения в каталоге. Поведение без команд скрипту не подчиняется.
  readonly commands?: Readonly<Record<string, BehaviorCommand>>;
}

export interface Behavior<N extends BehaviorName = BehaviorName> {
  readonly name: N;
  attach(host: BehaviorHost): BehaviorInstance;
}

// Появления data-animate (раздел 9): один модуль на все пресеты.
export interface RevealHost {
  readonly section: HTMLElement;
  readonly elements: readonly HTMLElement[]; // элементы с data-animate этой секции, в порядке документа
  readonly motion: MotionPrefs;
  readonly signal: AbortSignal;
}

export interface Reveal {
  attach(host: RevealHost): void;
}

// Провайдер ctx.animate: узлы уже проверены ядром (ElScope.nodeOf — все из своей секции), кадры проверяет провайдер
// (checkKeyframes, 12.11 — ради веса ядра); signal и mode — экземпляра.
export type AnimateProvider = (
  nodes: readonly Element[],
  keyframes: Keyframes,
  options: AnimateOptions | undefined,
  signal: AbortSignal,
  mode: Mode,
) => Animation;

// Провайдер ctx.split (12.11): узел проверен ядром; chars и words — сразу, lines — после загрузки шрифтов.
export type SplitProvider = (
  node: Element,
  by: SplitBy,
  signal: AbortSignal,
) => readonly HTMLElement[] | Promise<readonly HTMLElement[]>;

// Провайдер ctx.on(…, 'pointermove') (12.11): слушает target, не чаще раза в кадр зовёт deliver с последним событием и
// положением курсора; возвращает отписку. Ядро делает из события SectionEvent и зовёт код секции под предохранителем.
export interface PointerExtra {
  readonly pointer: PointerPoint;
  at(el: El): PointerPoint | null;
}
export type PointerProvider = (
  target: EventTarget,
  scope: ElScope,
  deliver: (event: Event, extra: PointerExtra) => void,
  signal: AbortSignal,
) => () => void;

// Экземпляр секции для ctx.animate, ctx.split, ctx.scroll, ctx.inView и ctx.lib (13.11): область элементов,
// предохранитель для кода секции, сигнал снятия и режим. Эти члены ctx ставит часть behaviors (BehaviorsApi.more), а не
// ядро: ядро — в бюджете веса.
export interface SectionHost {
  readonly name: string;
  readonly scope: ElScope;
  readonly run: Guard;
  readonly signal: AbortSignal;
  readonly mode: Mode;
}
export type CtxMore = Pick<BaseCtx<object>, 'animate' | 'split' | 'scroll' | 'inView' | 'lib'>;
// Экземпляр для ctx.scroll и ctx.lib: still() — «уменьшить движение» или запуск в превью после правки настроек или
// текста (prefs.ts) на момент вызова; считает часть behaviors, чтобы prefs.ts не ложился в scroll.js (бюджет 4096 Б).
export interface MotionHost extends SectionHost {
  still(): boolean;
}

// Провайдеры ctx.scroll и ctx.inView (файл scroll.js): узлы проверяют сами — по host.scope.
export type ScrollProvider = (
  host: MotionHost,
  target: El,
  run: Animation | ((progress: number) => void),
  options: ScrollOptions | undefined,
) => Stop;
export type InViewProvider = (
  host: SectionHost,
  el: El | readonly El[],
  fn: (el: El) => void | (() => void),
  options: InViewOptions | undefined,
) => Stop;
// Адаптер библиотеки каталога (libraries.ts): ctx.lib.<имя> одного экземпляра.
export type LibAdapter<N extends LibraryName = LibraryName> = (host: MotionHost) => LibModules[N];

export interface BehaviorsOptions {
  readonly list: readonly Behavior[];
  readonly reveal?: Reveal;
  readonly animate?: AnimateProvider;
  readonly split?: SplitProvider;
  readonly pointer?: PointerProvider;
  readonly scroll?: ScrollProvider;
  readonly inView?: InViewProvider;
  readonly libs?: { readonly motion?: LibAdapter<'motion'> };
  // Библиотеки секций страницы: имя секции → имена из её uses "lib:<имя>" (сборка, bundle.ts).
  readonly libUses?: Readonly<Record<string, readonly LibraryName[]>>;
}

// Поведения секции для ctx.behavior: section — экземпляр (узел, id, сигнал), within — узел этой секции, внутри которого
// искать поведение (undefined — единственное с таким именем; null — узел не из этой секции, ядро не нашло его в области).
// Ответ — команды каталога; нельзя управлять — Error с текстом для автора (его ловит предохранитель секции). Это обычный
// Error, а не ShellError: ядро секций стоит в бюджете веса, а файл поведений не тянет лишний код.
export type ControlProvider = <N extends BehaviorHandleName>(
  section: { readonly element: HTMLElement; readonly id: string; readonly signal: AbortSignal },
  name: N,
  within: Element | null | undefined,
) => BehaviorHandles[N];

export interface BehaviorsApi {
  readonly animate: AnimateProvider | null; // null — скрипт секции, который вызывает ctx.animate, сборка не учла
  readonly split: SplitProvider | null; // null — то же для ctx.split
  readonly pointer: PointerProvider | null; // null — то же для ctx.on(…, 'pointermove')
  readonly control: ControlProvider; // ctx.behavior скрипта секции
  more(host: SectionHost): CtxMore; // 13.11: ctx.animate, ctx.split, ctx.scroll, ctx.inView и ctx.lib экземпляра
  save(sectionId: string): Json | null; // превью (часть 5б): состояние поведений экземпляра перед заменой
  restore(sectionId: string, state: Json): void; // превью: после запуска нового экземпляра с тем же id
}

export type BehaviorsPart = SdkPart<'behaviors', BehaviorsApi>;
