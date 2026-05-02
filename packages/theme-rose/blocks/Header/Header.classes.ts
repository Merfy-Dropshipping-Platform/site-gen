// Rose-specific Tailwind classes.
// Differs from base: wider max-width (1920px), large responsive breakpoints
// up to 2xl:px-[300px], bigger nav gaps (up to 80px at 2xl), and rose-specific
// sticky wrapper with translateY scroll-up transform.
export const HeaderClasses = {
  wrapper: 'w-full shadow-sm bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  sticky: {
    'scroll-up': 'sticky top-0 z-50 transition-transform duration-300',
    always: 'sticky top-0 z-50',
    none: 'relative z-50',
  },
  header: 'w-full flex items-center border-b border-[rgb(var(--color-text))]/15',
  nav: 'w-full max-w-[1920px] mx-auto px-4 sm:px-6 md:px-8 lg:px-16 xl:px-24 2xl:px-[300px] flex items-center relative',
  navJustified: 'justify-between',
  hamburger: 'md:hidden w-10 h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-heading))]',
  logoWrap: {
    'top-left': 'absolute left-1/2 -translate-x-1/2 md:relative md:left-auto md:transform-none',
    'top-center': 'absolute left-1/2 -translate-x-1/2',
    'top-right': 'hidden md:flex',
    'center-left': '',
  },
  logoLink: 'flex items-center hover:opacity-80 transition-opacity',
  logoImg: 'h-5 sm:h-6 md:h-[26px] w-auto max-w-[var(--size-logo-width)]',
  logoText: 'text-lg sm:text-xl md:text-2xl font-bold tracking-wide [font-family:var(--font-body)] text-[rgb(var(--color-heading))]',
  navMenu: 'hidden md:flex items-center gap-4 lg:gap-8 xl:gap-12 2xl:gap-[80px]',
  navMenuCentered: 'hidden md:flex items-center justify-center gap-4 lg:gap-8 xl:gap-12 2xl:gap-[80px] mt-2',
  navLink: 'text-sm md:text-base lg:text-lg xl:text-[20px] font-normal hover:opacity-70 transition-opacity [font-family:var(--font-heading)] text-[length:var(--size-nav-link)] text-[rgb(var(--color-text))]',
  actions: 'flex items-center gap-3 sm:gap-3 md:gap-4 lg:gap-5 xl:gap-[25px]',
  actionSearch: 'hidden md:flex w-8 h-8 lg:w-10 lg:h-10 items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  actionCart: 'relative w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  actionProfile: 'auth-nav-btn w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  cartBadge: 'hidden absolute -top-1 -right-1 bg-[rgb(var(--color-primary))] text-[rgb(var(--color-button-text))] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center leading-none px-1',
  mobileMenu: {
    root: 'hidden md:hidden absolute top-full left-0 right-0 border-b border-[rgb(var(--color-text))]/15 shadow-lg z-50 bg-[rgb(var(--color-bg))]',
    nav: 'flex flex-col',
    search: 'px-4 pt-6 pb-4',
    searchInput: 'block w-full h-12 pl-5 pr-12 border border-[rgb(var(--color-text))]/30 rounded-lg text-sm font-normal outline-none [font-family:var(--font-body)] bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))]',
    link: 'px-4 py-4 text-base font-normal hover:opacity-80 transition-colors border-t border-[rgb(var(--color-text))]/15 [font-family:var(--font-body)] text-[rgb(var(--color-text))]',
    submenuToggle: 'mobile-submenu-toggle w-full px-4 py-4 text-base font-normal hover:opacity-80 transition-colors flex items-center justify-between [font-family:var(--font-body)] text-[rgb(var(--color-text))] border-t border-[rgb(var(--color-text))]/15',
    submenuWrap: 'hidden mobile-submenu bg-[rgb(var(--color-text))]/5',
    submenuLink: 'block px-8 py-3 text-sm font-normal hover:opacity-70 transition-colors [font-family:var(--font-body)] border-t border-[rgb(var(--color-text))]/15 text-[rgb(var(--color-muted))]',
  },
} as const;
