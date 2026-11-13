// @merfy/shell/behaviors — готовые поведения и анимации SDK (design.md блока 6, часть 6а). Бандл страницы (часть 6б)
// подключает часть behaviors с поведениями, которые есть в HTML страницы; превью — со всеми. Задачи Б6а-3…Б6а-8
// дописывают сюда свои поведения.
export { behaviors } from './part';
export { BEHAVIORS, EASINGS } from './catalog';
export { PRESETS, PRESET_PARAMS } from './presets';
export { MOTION_CSS, MOTION_FLAG, MOTION_HEAD_SCRIPT } from './motion-css';
export type {
  BehaviorName,
  BehaviorSpec,
  CommandArg,
  Library,
  ParamSpec,
  PresetName,
  PresetSpec,
} from './catalog';
export type { ParamValue, Params } from './params';
export type {
  AnimateProvider,
  Behavior,
  BehaviorCommand,
  BehaviorHost,
  BehaviorInstance,
  BehaviorsApi,
  BehaviorsOptions,
  BehaviorsPart,
  ControlProvider,
  MotionPrefs,
  Reveal,
  PointerProvider,
  RevealHost,
  SplitProvider,
} from './types';
export { animate, pointer, split } from './motion';
// 13.11: ctx.scroll, ctx.inView, каталог библиотек и ctx.lib.motion, переходы между страницами.
export { scroll } from './scroll';
export { inView } from './in-view';
export { motion as libMotion } from './lib-motion';
export { lenis as libLenis } from './lib-lenis';
export { LIBRARIES, LIBRARY_LICENSES, LIBRARY_NAMES, LIB_USE_PREFIX, isLibraryName } from './libraries';
export type { LibraryName, LibrarySpec } from './libraries';
export { PAGE_TRANSITIONS, PAGE_TRANSITION_SCRIPT, pageTransitionCss } from './page-transition';
export type { CtxMore, InViewProvider, LibAdapter, ScrollProvider, SectionHost } from './types';
export { accordion } from './accordion';
export { dialog } from './dialog';
export { carousel } from './carousel';
export { reveal } from './reveal';
export { tabs } from './tabs';
export { navMenu } from './nav-menu';
export { quantity } from './quantity';
export { cardPhotos } from './card-photos';
export { stickyHeader } from './sticky-header';
export { video } from './video';
// Блок 11 «Секций и SDK», часть 11б-2. Файл сборки — catalog.js и search.js, имя экспорта — имя поведения.
export { catalog } from './catalog-list';
export { search } from './search';
// Блок 15, часть 15в: увеличение фото товара.
export { zoom } from './zoom';
// Таймер до даты по времени сервера и стираемый слой.
export { countdown } from './countdown';
export { scratch } from './scratch';
