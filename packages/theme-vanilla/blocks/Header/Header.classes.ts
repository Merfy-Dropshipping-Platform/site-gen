// Vanilla-specific Tailwind classes.
// Differs from base: 1320px max-width container, 40px nav gap (constant across
// breakpoints), flat (zero-radius) borders everywhere, Exo 2 font on cart badge,
// letter-spaced uppercase site-title type.
export const HeaderClasses = {
  wrapper: 'w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  sticky: {
    'scroll-up': 'sticky top-0 z-50 transition-transform duration-300',
    always: 'sticky top-0 z-50',
    none: 'relative z-50',
  },
  header: 'w-full flex items-center',
  nav: 'w-full max-w-[1320px] mx-auto px-4 md:px-6 flex items-center relative',
  navJustified: 'justify-between',
  hamburger: 'md:hidden w-10 h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  logoWrap: {
    'top-left': 'absolute left-1/2 -translate-x-1/2 md:relative md:left-auto md:transform-none',
    'top-center': 'absolute left-1/2 -translate-x-1/2',
    'top-right': 'hidden md:flex',
    'center-left': '',
  },
  logoLink: 'flex items-center hover:opacity-80 transition-opacity',
  logoImg: 'h-5 sm:h-6 md:h-[26px] w-auto max-w-[var(--size-logo-width)]',
  logoText: 'text-base sm:text-lg md:text-[26px] font-semibold tracking-[0.2em] uppercase leading-none font-[var(--font-body)] text-[rgb(var(--color-text))]',
  navMenu: 'hidden md:flex items-center gap-[40px]',
  navMenuCentered: 'hidden md:flex items-center justify-center gap-[40px] mt-2',
  navLink: 'text-[length:var(--size-nav-link)] font-normal hover:opacity-70 transition-opacity leading-[1.4] font-[var(--font-body)] text-[rgb(var(--color-text))]',
  actions: 'flex items-center gap-[24px]',
  actionSearch: 'hidden md:flex w-8 h-8 items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  actionCart: 'relative w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  actionProfile: 'auth-nav-btn w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  // Vanilla-specific: Exo 2 font on cart badge, accent-colored background.
  cartBadge: 'hidden absolute -top-1 -right-1 text-white text-[12px] font-bold min-w-[18px] h-[18px] flex items-center justify-center leading-none px-0.5 bg-[rgb(var(--color-accent))] font-[var(--font-badge,Exo_2)]',
  mobileMenu: {
    root: 'hidden md:hidden absolute top-full left-0 right-0 border-b border-[rgb(var(--color-text))]/15 shadow-lg z-50 bg-[rgb(var(--color-bg))]',
    nav: 'flex flex-col',
    search: 'px-4 pt-6 pb-4',
    searchInput: 'block w-full h-12 pl-5 pr-12 border border-[rgb(var(--color-text))]/30 text-sm font-normal outline-none font-[var(--font-body)] bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))]',
    link: 'px-4 py-4 text-base font-normal hover:opacity-80 transition-colors border-t border-[rgb(var(--color-text))]/15 font-[var(--font-body)] text-[rgb(var(--color-text))]',
    submenuToggle: 'mobile-submenu-toggle w-full px-4 py-4 text-base font-normal hover:opacity-80 transition-colors flex items-center justify-between font-[var(--font-body)] text-[rgb(var(--color-text))] border-t border-[rgb(var(--color-text))]/15',
    submenuWrap: 'hidden mobile-submenu bg-[rgb(var(--color-text))]/5',
    submenuLink: 'block px-8 py-3 text-sm font-normal hover:opacity-70 transition-colors font-[var(--font-body)] border-t border-[rgb(var(--color-text))]/15 text-[rgb(var(--color-muted))]',
  },
} as const;
