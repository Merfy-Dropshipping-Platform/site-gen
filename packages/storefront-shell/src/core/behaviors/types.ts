import type {
  AnimateOptions,
  Animation,
  BehaviorHandleName,
  BehaviorHandles,
  CoreHandle,
  Json,
  Keyframes,
  Mode,
  NoData,
  Result,
  SdkPart,
} from '../types';
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

// Провайдер ctx.animate: узел и кадры уже проверены ядром (ElScope.nodeOf, checkKeyframes); signal и mode — экземпляра.
export type AnimateProvider = (
  node: Element,
  keyframes: Keyframes,
  options: AnimateOptions | undefined,
  signal: AbortSignal,
  mode: Mode,
) => Animation;

export interface BehaviorsOptions {
  readonly list: readonly Behavior[];
  readonly reveal?: Reveal;
  readonly animate?: AnimateProvider;
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
  readonly control: ControlProvider; // ctx.behavior скрипта секции
  save(sectionId: string): Json | null; // превью (часть 5б): состояние поведений экземпляра перед заменой
  restore(sectionId: string, state: Json): void; // превью: после запуска нового экземпляра с тем же id
}

export type BehaviorsPart = SdkPart<'behaviors', BehaviorsApi>;
