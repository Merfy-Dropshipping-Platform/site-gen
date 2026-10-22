// @merfy/shell/behaviors — готовые поведения и анимации SDK (design.md блока 6, часть 6а). Бандл страницы (часть 6б)
// подключает часть behaviors с поведениями, которые есть в HTML страницы; превью — со всеми. Задачи Б6а-3…Б6а-8
// дописывают сюда свои поведения.
export { behaviors } from './part';
export { BEHAVIORS, EASINGS, PRESETS, PRESET_PARAMS } from './catalog';
export { MOTION_CSS, MOTION_FLAG, MOTION_HEAD_SCRIPT } from './motion-css';
export type { BehaviorName, BehaviorSpec, Library, ParamSpec, PresetName, PresetSpec } from './catalog';
export type { ParamValue, Params } from './params';
export type {
  AnimateProvider,
  Behavior,
  BehaviorHost,
  BehaviorInstance,
  BehaviorsApi,
  BehaviorsOptions,
  BehaviorsPart,
  MotionPrefs,
  Reveal,
  RevealHost,
} from './types';
export { animate } from './motion';
