// Классификация Tailwind-утилит — определяет CSS-свойство, состояние,
// брейкпоинт и значение для каждой утилиты.
//
// Правила (см. документ проектирования v2 §5):
//   - `text-[10px]` / `text-xs` → font-size
//   - `text-[rgb(...)]` / `text-[#hex]` / `text-white` → color
//   - `text-center` → text-align
//   - `bg-[#hex]` / `bg-[rgb(...)]` → background-color
//   - `bg-gradient-...` → background-image
//   - `border-2` → border-width
//   - `border-solid` → border-style
//   - `border-[#hex]` / `border-[rgb(...)]` → border-color

const BREAKPOINTS = new Set(['sm', 'md', 'lg', 'xl', '2xl']);
const STATE_PREFIXES = new Set([
  'hover', 'focus', 'active', 'disabled', 'visited',
  'focus-within', 'focus-visible', 'group-hover', 'group-focus',
  'placeholder', 'first', 'last',
]);

const TEXT_SIZE_NAMED = new Set([
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl',
  'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl',
  'text-7xl', 'text-8xl', 'text-9xl',
]);

const TEXT_ALIGN_NAMED = new Set([
  'text-left', 'text-center', 'text-right', 'text-justify', 'text-start', 'text-end',
]);

const TEXT_DECO_NAMED = new Set([
  'underline', 'overline', 'line-through', 'no-underline',
]);

const NAMED_COLOR_PREFIXES = new Set([
  'white', 'black', 'transparent', 'current', 'inherit',
]);

const TAILWIND_COLOR_FAMILIES = new Set([
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]);

const FONT_WEIGHT_NAMED = new Set([
  'font-thin', 'font-extralight', 'font-light', 'font-normal',
  'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black',
]);

/**
 * Разобрать одну Tailwind-утилиту на префиксы и базу.
 * Пример: `2xl:hover:text-[#fff]` → { breakpoint: '2xl', state: 'hover', base: 'text-[#fff]' }
 */
export function splitPrefixes(token) {
  if (!token) return { breakpoint: null, state: null, base: '' };
  const parts = token.split(':');
  let breakpoint = null;
  let state = null;
  let i = 0;
  while (i < parts.length - 1) {
    const p = parts[i];
    if (BREAKPOINTS.has(p)) {
      breakpoint = p;
    } else if (STATE_PREFIXES.has(p)) {
      state = p;
    } else if (p.startsWith('data-') || p.startsWith('group-') || p.startsWith('peer-') || p === 'dark') {
      // Игнорируем data-/group-/peer-/dark — они либо для конструктора либо для тем
      state = p;
    } else {
      break;
    }
    i++;
  }
  return {
    breakpoint,
    state,
    base: parts.slice(i).join(':'),
  };
}

/**
 * Извлечь значение arbitrary-варианта Tailwind: `text-[10px]` → `10px`.
 * Возвращает null если значение не arbitrary.
 */
export function arbitraryValue(base) {
  const m = base.match(/^[a-z-]+-\[(.+)\]$/);
  return m ? m[1] : null;
}

/**
 * Классифицировать утилиту → { property, value } или null если
 * это структурная утилита которую не токенизируем.
 */
export function classifyUtility(token) {
  const { breakpoint, state, base } = splitPrefixes(token);
  if (!base) return null;

  // ── Алиасы из rgb()/hex/var() — в свойство нужно смотреть на префикс утилиты
  const arbitrary = arbitraryValue(base);

  // text-* — самая хитрая категория
  if (base.startsWith('text-')) {
    if (TEXT_ALIGN_NAMED.has(base)) {
      return { property: 'text-align', value: base.replace('text-', ''), state, breakpoint };
    }
    if (TEXT_SIZE_NAMED.has(base)) {
      return { property: 'font-size', value: base.replace('text-', ''), state, breakpoint };
    }
    if (arbitrary !== null) {
      // text-[длина] vs text-[цвет]
      if (looksLikeLength(arbitrary)) {
        return { property: 'font-size', value: arbitrary, state, breakpoint };
      }
      if (looksLikeColor(arbitrary)) {
        return { property: 'color', value: arbitrary, state, breakpoint };
      }
      // text-[length:var(--size-nav-link)] и т.п. — кастомный data type
      const dt = arbitrary.match(/^([a-z-]+):(.+)$/);
      if (dt) {
        if (dt[1] === 'length') return { property: 'font-size', value: dt[2], state, breakpoint };
        if (dt[1] === 'color')  return { property: 'color',     value: dt[2], state, breakpoint };
      }
      // По умолчанию trust на цвет (font-family ловится отдельно)
      return { property: 'color', value: arbitrary, state, breakpoint };
    }
    // text-white / text-red-500 / text-current → color
    const rest = base.replace('text-', '');
    if (NAMED_COLOR_PREFIXES.has(rest)) {
      return { property: 'color', value: rest, state, breakpoint };
    }
    const [family, shade] = rest.split('-');
    if (family && TAILWIND_COLOR_FAMILIES.has(family) && shade) {
      return { property: 'color', value: rest, state, breakpoint };
    }
    return null;
  }

  // bg-* — фон
  if (base.startsWith('bg-')) {
    if (arbitrary !== null) {
      if (looksLikeColor(arbitrary)) {
        return { property: 'background-color', value: arbitrary, state, breakpoint };
      }
      const dt = arbitrary.match(/^([a-z-]+):(.+)$/);
      if (dt) {
        if (dt[1] === 'color')  return { property: 'background-color', value: dt[2], state, breakpoint };
        if (dt[1] === 'image')  return { property: 'background-image', value: dt[2], state, breakpoint };
      }
      return { property: 'background-color', value: arbitrary, state, breakpoint };
    }
    if (base.startsWith('bg-gradient')) {
      return { property: 'background-image', value: base.replace('bg-', ''), state, breakpoint };
    }
    const rest = base.replace('bg-', '');
    if (NAMED_COLOR_PREFIXES.has(rest)) {
      return { property: 'background-color', value: rest, state, breakpoint };
    }
    const [family, shade] = rest.split('-');
    if (family && TAILWIND_COLOR_FAMILIES.has(family) && shade) {
      return { property: 'background-color', value: rest, state, breakpoint };
    }
    return null;
  }

  // border-*
  if (base.startsWith('border-')) {
    if (arbitrary !== null) {
      if (looksLikeColor(arbitrary)) {
        return { property: 'border-color', value: arbitrary, state, breakpoint };
      }
      if (looksLikeLength(arbitrary)) {
        return { property: 'border-width', value: arbitrary, state, breakpoint };
      }
      return { property: 'border-color', value: arbitrary, state, breakpoint };
    }
    const rest = base.replace('border-', '');
    const borderStyles = new Set(['solid', 'dashed', 'dotted', 'double', 'none']);
    if (borderStyles.has(rest)) {
      return { property: 'border-style', value: rest, state, breakpoint };
    }
    if (/^\d+$/.test(rest)) {
      return { property: 'border-width', value: `${rest}px`, state, breakpoint };
    }
    // border-t / border-b / border-l / border-r
    const side = rest.match(/^([tlbr]|[xy])(?:-(.+))?$/);
    if (side) {
      const val = side[2];
      if (!val) return { property: `border-${side[1]}-width`, value: '1px', state, breakpoint };
      if (/^\d+$/.test(val)) return { property: `border-${side[1]}-width`, value: `${val}px`, state, breakpoint };
    }
    if (NAMED_COLOR_PREFIXES.has(rest)) {
      return { property: 'border-color', value: rest, state, breakpoint };
    }
    const [family, shade] = rest.split('-');
    if (family && TAILWIND_COLOR_FAMILIES.has(family) && shade) {
      return { property: 'border-color', value: rest, state, breakpoint };
    }
    return null;
  }

  // padding / margin / gap
  for (const [prefix, prop] of [
    ['p-',   'padding'],
    ['px-',  'padding-x'],
    ['py-',  'padding-y'],
    ['pt-',  'padding-top'],
    ['pr-',  'padding-right'],
    ['pb-',  'padding-bottom'],
    ['pl-',  'padding-left'],
    ['m-',   'margin'],
    ['mx-',  'margin-x'],
    ['my-',  'margin-y'],
    ['mt-',  'margin-top'],
    ['mr-',  'margin-right'],
    ['mb-',  'margin-bottom'],
    ['ml-',  'margin-left'],
    ['gap-', 'gap'],
    ['gap-x-', 'gap-x'],
    ['gap-y-', 'gap-y'],
  ]) {
    if (base.startsWith(prefix)) {
      const rest = base.slice(prefix.length);
      if (rest.startsWith('[') && rest.endsWith(']')) {
        return { property: prop, value: rest.slice(1, -1), state, breakpoint };
      }
      if (/^\d+$/.test(rest)) {
        // Tailwind spacing scale → 4px на шаг (упрощённо)
        return { property: prop, value: `${parseInt(rest, 10) * 4}px`, state, breakpoint };
      }
      if (rest === 'auto') {
        return { property: prop, value: 'auto', state, breakpoint };
      }
      return null;
    }
  }

  // width / height
  for (const [prefix, prop] of [
    ['w-',     'width'],
    ['h-',     'height'],
    ['min-w-', 'min-width'],
    ['min-h-', 'min-height'],
    ['max-w-', 'max-width'],
    ['max-h-', 'max-height'],
  ]) {
    if (base.startsWith(prefix)) {
      const rest = base.slice(prefix.length);
      if (rest.startsWith('[') && rest.endsWith(']')) {
        return { property: prop, value: rest.slice(1, -1), state, breakpoint };
      }
      if (/^\d+$/.test(rest)) {
        return { property: prop, value: `${parseInt(rest, 10) * 4}px`, state, breakpoint };
      }
      if (rest === 'full' || rest === 'auto' || rest === 'screen') {
        return { property: prop, value: rest, state, breakpoint };
      }
      return null;
    }
  }

  // rounded-*
  if (base.startsWith('rounded')) {
    const rest = base === 'rounded' ? '' : base.slice('rounded-'.length);
    if (rest.startsWith('[') && rest.endsWith(']')) {
      return { property: 'border-radius', value: rest.slice(1, -1), state, breakpoint };
    }
    const map = { '': '4px', sm: '2px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px', '3xl': '24px', full: '9999px', none: '0' };
    if (rest in map) {
      return { property: 'border-radius', value: map[rest], state, breakpoint };
    }
    return null;
  }

  // font-weight
  if (FONT_WEIGHT_NAMED.has(base)) {
    return { property: 'font-weight', value: base.replace('font-', ''), state, breakpoint };
  }

  // font-family arbitrary `[font-family:var(--font-X)]`
  if (base.startsWith('[font-family:') && base.endsWith(']')) {
    const v = base.slice('[font-family:'.length, -1);
    return { property: 'font-family', value: v, state, breakpoint };
  }

  // tracking-*
  if (base.startsWith('tracking-')) {
    const rest = base.slice('tracking-'.length);
    if (rest.startsWith('[') && rest.endsWith(']')) {
      return { property: 'letter-spacing', value: rest.slice(1, -1), state, breakpoint };
    }
    return { property: 'letter-spacing', value: rest, state, breakpoint };
  }

  // leading-*
  if (base.startsWith('leading-')) {
    const rest = base.slice('leading-'.length);
    if (rest.startsWith('[') && rest.endsWith(']')) {
      return { property: 'line-height', value: rest.slice(1, -1), state, breakpoint };
    }
    return { property: 'line-height', value: rest, state, breakpoint };
  }

  // opacity-*
  if (base.startsWith('opacity-')) {
    const rest = base.slice('opacity-'.length);
    if (rest.startsWith('[') && rest.endsWith(']')) {
      return { property: 'opacity', value: rest.slice(1, -1), state, breakpoint };
    }
    if (/^\d+$/.test(rest)) {
      return { property: 'opacity', value: `${parseInt(rest, 10) / 100}`, state, breakpoint };
    }
    return null;
  }

  // text-decoration utilities
  if (TEXT_DECO_NAMED.has(base)) {
    return { property: 'text-decoration-line', value: base, state, breakpoint };
  }

  // shadow-*
  if (base === 'shadow' || base.startsWith('shadow-')) {
    const rest = base === 'shadow' ? '' : base.slice('shadow-'.length);
    return { property: 'box-shadow', value: rest || 'default', state, breakpoint };
  }

  return null;
}

function looksLikeColor(value) {
  if (!value) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  if (/^rgb\(/i.test(value) || /^rgba\(/i.test(value)) return true;
  if (/^hsl\(/i.test(value) || /^hsla\(/i.test(value)) return true;
  if (value.startsWith('var(--color-')) return true;
  if (NAMED_COLOR_PREFIXES.has(value)) return true;
  return false;
}

function looksLikeLength(value) {
  if (!value) return false;
  if (/^[\d.]+(px|rem|em|vh|vw|vmin|vmax|%|ch|ex)$/.test(value)) return true;
  if (value.startsWith('var(--size-') || value.startsWith('var(--spacing-')) return true;
  if (value.startsWith('var(--container-')) return true;
  return false;
}

// ── Чёрный список структурных значений (никогда не токенизируем)
export const STRUCTURAL_VALUES = new Set([
  'auto', 'inherit', 'initial', 'unset', 'normal',
  'none', 'transparent', 'currentColor',
  '0', '0px', '0%', '100%',
  'flex', 'block', 'inline', 'inline-block', 'inline-flex', 'grid', 'hidden',
  'static', 'absolute', 'relative', 'fixed', 'sticky',
  'items-center', 'items-start', 'items-end', 'items-stretch', 'items-baseline',
  'justify-center', 'justify-start', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly',
  'flex-col', 'flex-row', 'flex-wrap', 'flex-nowrap',
]);

export function isStructural(value) {
  if (!value) return true;
  return STRUCTURAL_VALUES.has(value);
}

export function isGlobalToken(value) {
  if (!value) return false;
  // rgb(var(--color-*)) — глобальные цветовые переменные. Не дублируем.
  if (/^rgb\(var\(--color-/.test(value)) return true;
  if (/^var\(--color-/.test(value)) return true;
  if (/^var\(--font-/.test(value)) return true;
  if (/^var\(--weight-/.test(value)) return true;
  if (/^var\(--container-/.test(value)) return true;
  if (/^\[?length:var\(--size-/.test(value)) return true;
  return false;
}

// ── Доработка D: цвет в источнике vs scheme-переменная в базе ──
//
// Когда база использует `rgb(var(--color-text))` (или другую scheme-переменную),
// а источник темы — литерал (#000, rgb(0,0,0), white и т.д.) — мы НЕ создаём
// токен. База остаётся scheme-driven, темы переопределяют цвет через
// `colorSchemes`. Иначе захардкоженный токен сломает реакцию на смену схемы.
//
// Список свойств цветовой природы (точно по требованию пользователя):

export const COLOR_NATURE_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-color',
  'text-decoration-color',
  'caret-color',
  'fill',
  'stroke',
]);

/**
 * Свойство цветовой природы? (см. COLOR_NATURE_PROPERTIES).
 */
export function isColorNatureProperty(property) {
  if (!property) return false;
  return COLOR_NATURE_PROPERTIES.has(property);
}

/**
 * База использует CSS-переменную через цветовую схему?
 * Шаблоны: rgb(var(--color-*)), var(--color-*), var(--color-*, fallback).
 */
export function isSchemeDrivenColor(value) {
  if (!value || typeof value !== 'string') return false;
  // rgb(var(--color-*)) — основной шаблон scheme-цветов Merfy
  if (/^rgb\s*\(\s*var\(--color-/.test(value)) return true;
  if (/^rgba\s*\(\s*var\(--color-/.test(value)) return true;
  // var(--color-*) — голая scheme-переменная
  if (/^var\(--color-/.test(value)) return true;
  return false;
}

/**
 * Значение в источнике — литерал цвета?
 * Шаблоны: #hex, rgb(...), rgba(...), hsl(...), hsla(...), named-color (white, black, ...)
 */
export function isLiteralColor(value) {
  if (!value || typeof value !== 'string') return false;
  // #hex
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  // rgb(...) / rgba(...) с числами (не var())
  if (/^rgba?\s*\(\s*\d/.test(value)) return true;
  // hsl(...) / hsla(...)
  if (/^hsla?\s*\(/.test(value)) return true;
  // Named colors (white/black/red/transparent — без шкалы Tailwind)
  if (NAMED_COLOR_PREFIXES.has(value) && value !== 'inherit' && value !== 'current') return true;
  // Tailwind названия цветов: white, black, red-500, slate-100, etc.
  // Берём white/black отдельно (выше), а tailwind-color-shade (red-500) тоже считаем литералом.
  const m = value.match(/^([a-z]+)-(\d+)$/);
  if (m && TAILWIND_COLOR_FAMILIES.has(m[1])) return true;
  return false;
}

/**
 * Главный фильтр D — должен ли скрипт пропустить (НЕ создавать токен) этот
 * аспект потому что у базы scheme-driven цвет, а у источника — литерал?
 *
 * Принцип: если архитектурно правильное место для расхождения — colorSchemes
 * (а не token override), не создавать токен.
 *
 * @param {string} property — свойство (`color`, `background-color`, ...)
 * @param {string} baseValue — значение из базы
 * @param {string} sourceValue — значение из источника
 * @returns {boolean} true если фильтр должен сработать
 */
export function shouldFilterAsSchemeColor(property, baseValue, sourceValue) {
  if (!isColorNatureProperty(property)) return false;
  if (!isSchemeDrivenColor(baseValue)) return false;
  if (!isLiteralColor(sourceValue)) return false;
  return true;
}
