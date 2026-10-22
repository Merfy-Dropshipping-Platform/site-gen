import type { Mode } from '../types';
import type { MotionPrefs } from './types';

// Настройки движения страницы (design.md блока 6, разделы 9 и 10): «уменьшить движение» и превью конструктора.
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const reducedOf = (win: Window): boolean => {
  const matchMedia = win.matchMedia?.bind(win);
  if (matchMedia === undefined) return false; // jsdom без matchMedia
  return matchMedia(REDUCED_QUERY).matches;
};

export function motionPrefs(win: Window, mode: Mode): MotionPrefs {
  return { reduced: reducedOf(win), preview: mode === 'preview' };
}
