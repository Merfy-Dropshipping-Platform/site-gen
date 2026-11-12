import type {
  AnimateOptions,
  Animation,
  BehaviorHandleName,
  BehaviorHandles,
  CoreHandle,
  El,
  Json,
  Keyframes,
  Mode,
  NoData,
  PointerPoint,
  Result,
  SdkPart,
  SplitBy,
} from '../types';
import type { ElScope } from '../el';
import type { BehaviorName } from './catalog';
import type { Params } from './params';

// Договор части behaviors (design.md блока 6, раздел 2): готовые поведения подключаются к экземпляру секции до mount
// (SdkPart.attach блока 5) и снимаются его сигналом. Состав части на странице выбирает сборка (часть 6б): поведения —
// по data-behavior в HTML страницы, появления — если есть data-animate, провайдер ctx.animate — если его вызывает скрипт
// секции; бандл превью — всё.

export interface MotionPrefs {
  readonly reduced: boolean; // prefers-reduced-motion: reduce — переходы поведений сразу, появлений и автопрокрутки нет
  readonly preview: boolean; // превью конструктора — появлений нет; переходы поведений и автопрокрутка работают
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

export interface BehaviorsOptions {
  readonly list: readonly Behavior[];
  readonly reveal?: Reveal;
  readonly animate?: AnimateProvider;
  readonly split?: SplitProvider;
  readonly pointer?: PointerProvider;
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
  save(sectionId: string): Json | null; // превью (часть 5б): состояние поведений экземпляра перед заменой
  restore(sectionId: string, state: Json): void; // превью: после запуска нового экземпляра с тем же id
}

export type BehaviorsPart = SdkPart<'behaviors', BehaviorsApi>;
