// Base Header classes — full field-set required by Header.astro. Themes may
// overlay a `packages/theme-<name>/blocks/Header/Header.classes.ts` to change
// specific values (nav gaps, typography, responsive breakpoints, etc.), but
// all field names must remain present or Header.astro will crash with
// "Cannot read properties of undefined (reading '<field>')" at render time.
export const HeaderClasses = {
  // 084 vanilla pilot — Header background pulls from `--color-header-bg`
  // when the theme defines it (vanilla = `58 69 48` per Figma 1:18957),
  // otherwise falls back to the active scheme's `--color-bg`. Pre-084
  // themes don't set the override token so behaviour is unchanged.
  root: 'relative w-full z-40 bg-[rgb(var(--color-header-bg,var(--color-bg)))]',
  wrapper: 'w-full bg-[rgb(var(--color-header-bg,var(--color-bg)))] text-[rgb(var(--color-text))]',
  sticky: {
    'scroll-up': 'sticky top-0 z-50 transition-transform duration-300',
    always: 'sticky top-0 z-50',
    none: 'relative z-50',
  },
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 flex items-center',
  // 084 vanilla pilot — when theme defines `--size-header-h` (vanilla =
  // 80px per Figma 1:18957) the inner header gets a hard height clamp.
  // Pre-084 themes default `--size-header-h:auto`.
  // НЕТ `min-h-[N]` здесь — иначе slider «Отступы» в sidebar визуально
  // не работает при small padding (юзер 2026-05-11). Default min-height
  // только когда padding undefined — в Astro `class:list`.
  header: 'w-full flex items-center border-b border-[rgb(var(--color-text))]/15 h-[var(--size-header-h,auto)] bg-[var(--header-header-background-color)] pb-[var(--header-header-padding-bottom)] text-[var(--header-header-color)]',
  nav: 'w-full max-w-[var(--container-max-width,1320px)] mx-auto px-4 sm:px-5 md:px-10 lg:px-16 xl:px-20 2xl:px-[var(--header-container-px-2xl,280px)] flex items-center relative gap-[var(--header-nav-gap)] lg:gap-[var(--header-nav-gap-lg)]',
  navJustified: 'justify-between',
  hamburger:
    'md:hidden w-10 h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-heading))]',
  logoBox: {
    'top-left': 'justify-start',
    'top-center': 'justify-center',
    'top-right': 'justify-end',
    'center-left': 'justify-start',
    /** 084 vanilla pilot — additive `center-absolute`. */
    'center-absolute': 'justify-center',
  },
  logoWrap: {
    'top-left':
      'absolute left-1/2 -translate-x-1/2 md:relative md:left-auto md:translate-x-0',
    'top-center': 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
    'top-right': 'hidden md:flex',
    'center-left': '',
    /**
     * 084 vanilla pilot — additive `center-absolute` value. Pins the
     * logo absolutely at the horizontal centre of the header on all
     * breakpoints so the surrounding nav and actions can hug the edges.
     */
    'center-absolute':
      'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
  },
  /**
   * 084 vanilla pilot — additive `activeLinkIndicator` variant. Pre-084
   * default = no indicator. `underline` adds a 1px line under the link
   * via a positioned `<span>` within a `relative` wrapper.
   */
  activeIndicator: {
    none: { wrapper: '', span: '' },
    underline: {
      wrapper: 'relative',
      span:
        'absolute left-0 -bottom-2 h-px w-[59px] bg-[rgb(var(--color-text))]',
    },
  },
  logoLink: 'flex items-center hover:opacity-80 transition-opacity text-[var(--header-logo-link-color)]',
  // Высота лого = значение --size-logo-width (slider в Theme Settings —
  // "Размер" задаёт высоту); fallback 24px если token не задан.
  // Ширина auto до 160px max — preserve aspect-ratio для широких логотипов.
  // pointer-events:none — не ловит hover-overlay конструктора, клик
  // проходит на родительский <a class={logoLink}>.
  logoImg: 'pointer-events-none h-[var(--size-logo-width,24px)] w-auto max-w-[var(--size-logo-max-width,160px)] object-contain',
  logo:
    'max-w-[var(--size-logo-width)] h-auto [font-family:var(--font-heading)] text-xl text-[rgb(var(--color-heading))]',
  navMenu: 'hidden md:flex items-center gap-4 lg:gap-8 xl:gap-12',
  navMenuCentered:
    'hidden md:flex items-center justify-center gap-4 lg:gap-8 xl:gap-12 mt-2',
  navLink:
    '[font-family:var(--font-body)] text-[length:var(--header-nav-link-font-size,14px)] font-normal hover:opacity-70 transition-opacity text-[rgb(var(--color-text))] pb-[var(--header-nav-link-padding-bottom,0px)] lg:text-[length:var(--header-nav-link-font-size-lg,16px)]',
  actions:
    'flex items-center gap-3 sm:gap-3 md:gap-4 lg:gap-5 xl:gap-6',
  actionButton:
    'p-2 text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-primary))] transition-colors',
  actionSearch:
    'hidden md:flex w-8 h-8 lg:w-10 lg:h-10 items-center justify-center hover:opacity-[var(--header-action-search-opacity-hover)] transition-opacity text-[rgb(var(--color-text))]',
  actionCart:
    'relative w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  actionProfile:
    'auth-nav-btn w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center hover:opacity-[var(--header-action-profile-opacity-hover)] transition-opacity text-[rgb(var(--color-text))]',
  // Icon classes: CSS-mask вместо inline SVG. SVG-файлы лежат в
  // packages/theme-<name>/public/icons/ и build pipeline копирует
  // их в /icons/ live site. bg-current → currentColor наследуется
  // от parent text color → корректная адаптация к color scheme.
  iconBase:
    'inline-block bg-current pointer-events-none [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat] [-webkit-mask-size:contain] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat]',
  // Mask URL — через CSS-var с fallback на relative path. На live
  // fallback грузится из site origin (/icons/cart.svg → OK). В iframe
  // preview конструктора preview.service устанавливает CSS-var в `<style>`
  // блоке с absolute URL (customize.merfy.ru НЕ имеет /icons/*).
  iconCart:
    'w-6 h-6 lg:w-7 lg:h-7 [mask-image:var(--header-icon-cart,url(/icons/cart.svg))] [-webkit-mask-image:var(--header-icon-cart,url(/icons/cart.svg))]',
  iconUser:
    'w-5 h-5 lg:w-6 lg:h-6 [mask-image:var(--header-icon-user,url(/icons/user.svg))] [-webkit-mask-image:var(--header-icon-user,url(/icons/user.svg))]',
  iconSearch:
    'w-5 h-5 lg:w-6 lg:h-6 [mask-image:var(--header-icon-search,url(/icons/search-lg.svg))] [-webkit-mask-image:var(--header-icon-search,url(/icons/search-lg.svg))]',
  iconBurger:
    'w-5 h-5 [mask-image:var(--header-icon-burger,url(/icons/menu-burger.svg))] [-webkit-mask-image:var(--header-icon-burger,url(/icons/menu-burger.svg))]',
  cartBadge:
    'hidden absolute -top-1 -right-1 bg-[rgb(var(--color-primary))] text-[var(--header-cart-badge-color)] text-[10px] font-bold rounded-full min-w-[var(--header-cart-badge-min-width)] h-[var(--header-cart-badge-height)] flex items-center justify-center leading-none px-1',
  mobileMenu: {
    root: 'hidden md:hidden absolute top-full left-0 right-0 border-b border-[rgb(var(--color-text))]/15 shadow-lg z-50 bg-[rgb(var(--color-bg))]',
    nav: 'flex flex-col',
    search: 'px-4 pt-6 pb-4',
    searchInput:
      'block w-full h-12 pl-5 pr-12 border border-[rgb(var(--color-text))]/30 rounded-lg text-sm font-normal outline-none [font-family:var(--font-body)] bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))]',
    link:
      'px-4 py-4 text-base font-normal hover:opacity-80 transition-colors border-t border-[rgb(var(--color-text))]/15 [font-family:var(--font-body)] text-[rgb(var(--color-text))]',
    submenuToggle:
      'mobile-submenu-toggle w-full px-4 py-4 text-base font-normal hover:opacity-80 transition-colors flex items-center justify-between [font-family:var(--font-body)] text-[rgb(var(--color-text))] border-t border-[rgb(var(--color-text))]/15',
    submenuWrap: 'hidden mobile-submenu bg-[rgb(var(--color-text))]/5',
    submenuLink:
      'block px-8 py-3 text-sm font-normal hover:opacity-70 transition-colors [font-family:var(--font-body)] border-t border-[rgb(var(--color-text))]/15 text-[rgb(var(--color-muted))]',
  },
} as const;
