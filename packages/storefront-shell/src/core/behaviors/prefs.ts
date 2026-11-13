import type { Mode } from '../types';
import type { MotionPrefs } from './types';

// Имя метки — PREVIEW_STILL_ATTRIBUTE протокола превью; здесь строкой: импорт протокола тянет в animate.js и part.js
// лишние ~100 Б (их бюджеты тесны), а одинаковость имён сторожит тест (behaviors-part.test.ts).
const STILL_ATTRIBUTE = 'data-merfy-still';

// Настройки движения страницы (design.md блока 6, разделы 9 и 10): «уменьшить движение» и превью конструктора.
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const reducedOf = (win: Window): boolean => {
  const matchMedia = win.matchMedia?.bind(win);
  if (matchMedia === undefined) return false; // jsdom без matchMedia
  return matchMedia(REDUCED_QUERY).matches;
};

// Превью играет анимации, когда экземпляр секции запускается впервые: открыли превью, добавили секцию, сменился код
// секции или нажато «Проиграть анимации». Правка настроек или текста перезапускает экземпляр сразу в последнем кадре —
// иначе секция «выезжала» бы на каждую букву. Такой запуск помечен на узле секции атрибутом PREVIEW_STILL_ATTRIBUTE:
// его ставит скрипт секций превью (свежий узел на месте прежнего) или замена экземпляра (replace.ts), пока экземпляр
// не закончил mount.
export function motionPrefs(win: Window, mode: Mode, section?: Element | null): MotionPrefs {
  const preview = mode === 'preview';
  return { reduced: reducedOf(win), preview, still: preview && section?.hasAttribute(STILL_ATTRIBUTE) === true };
}
