/**
 * Catalog block layout classes — Tailwind-driven, all colors/fonts/spacing
 * via CSS vars from Catalog.tokens.ts. No hex/rgb literals.
 *
 * Per-theme adaptation flows through tokens.json (color/font/radius/spacing
 * tokens). The class shape is identical across themes.
 */
export const CatalogClasses = {
  // Section chrome
  root: 'relative w-full bg-[rgb(var(--color-background))] text-[rgb(var(--color-foreground))]',
  container: 'w-full max-w-[1320px] mx-auto px-6 lg:px-10',

  // Toolbar (sort dropdown + product count)
  toolbarTop: 'flex items-center justify-between mb-[30px] flex-wrap gap-3',
  productCount: 'font-[family-name:var(--font-body)] text-[20px] leading-[27px] text-[rgb(var(--color-muted))] hidden sm:inline',

  // Sort pills
  sortBar: 'flex flex-wrap gap-2 mb-6',
  sortPill: 'px-4 py-2 rounded-full text-sm border border-[rgb(var(--color-accent))] bg-[rgb(var(--color-background))] text-[rgb(var(--color-foreground))] cursor-pointer transition-colors',
  sortPillActive: 'px-4 py-2 rounded-full text-sm border border-[rgb(var(--color-foreground))] bg-[rgb(var(--color-foreground))] text-[rgb(var(--color-background))] cursor-pointer',

  // Layout
  layoutGrid: 'flex gap-[50px] items-start',
  layoutGridNoSidebar: 'block',

  // Sidebar
  sidebar: 'hidden lg:block shrink-0 w-[285px]',
  sidebarSticky: 'sticky top-[100px]',
  sidebarHeader: 'font-[family-name:var(--font-body)] text-[20px] leading-[27px] text-[rgb(var(--color-muted))] mb-[25px]',
  sidebarSections: 'flex flex-col gap-[50px]',

  // Filter sections
  filterSectionTitle: 'font-[family-name:var(--font-heading)] text-[20px] leading-[27px] text-[rgb(var(--color-foreground))] mb-[15px]',
  filterRadioRow: 'flex items-center gap-[10px] cursor-pointer py-1',
  filterRadioInput: 'accent-current',
  filterRadioLabel: 'font-[family-name:var(--font-body)] text-[18px] leading-[24px] text-[rgb(var(--color-foreground))]',

  // Price input
  filterPriceInput: 'w-full px-2 py-1.5 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-background))] text-[rgb(var(--color-foreground))]',
  filterPriceMb: 'mb-1.5',

  // Color dropdown
  filterColorDropdown: 'relative',
  filterColorTrigger: 'flex items-center justify-between w-full px-3 py-2 border border-[rgb(var(--color-border))] cursor-pointer bg-[rgb(var(--color-background))]',
  filterColorOptions: 'absolute top-full left-0 right-0 mt-1 bg-[rgb(var(--color-background))] border border-[rgb(var(--color-border))] z-10 max-h-60 overflow-y-auto',

  // Product grid
  productGrid: 'flex-1',
  productGridCols: 'grid grid-cols-1 sm:grid-cols-2 gap-5',
  productCard: 'flex flex-col gap-2 cursor-pointer',
  productCardImage: 'aspect-[315/515] overflow-hidden rounded-[10px] bg-[rgb(var(--color-muted)/0.1)]',
  productCardImageImg: 'w-full h-full object-cover block',
  productCardTitle: 'text-[14px] text-[rgb(var(--color-foreground))]',
  productCardPriceRow: 'text-[14px] text-[rgb(var(--color-foreground))] flex gap-2 items-baseline',
  productCardPriceCompare: 'line-through text-[rgb(var(--color-muted))]',

  // Pagination bar
  paginationBar: 'flex items-center justify-between mt-10 font-[family-name:var(--font-body)]',
  pageButtons: 'flex items-center gap-0.5',
  pageNumber: 'flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px] text-base sm:text-2xl text-[rgb(var(--color-muted))] cursor-pointer leading-[33px]',
  pageNumberActive: 'flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px] text-base sm:text-2xl text-[rgb(var(--color-foreground))] cursor-pointer leading-[33px]',
  pageEllipsis: 'flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px] text-base sm:text-2xl leading-[33px] text-[rgb(var(--color-muted))]',
  pageArrow: 'flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px] text-[rgb(var(--color-foreground))] cursor-pointer',
  pageArrowDisabled: 'flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px] text-[rgb(var(--color-muted))] opacity-40 cursor-not-allowed',
  paginationCount: 'hidden sm:inline text-[20px] leading-[27px] text-[rgb(var(--color-muted))] ml-5',

  // Mobile filter trigger
  mobileTrigger: 'lg:hidden flex items-center font-[family-name:var(--font-body)] text-[18px] leading-[24px] text-[rgb(var(--color-foreground))] gap-2 py-2.5 mb-5',
  mobileTriggerDot: 'w-2 h-2 rounded-full bg-[rgb(var(--color-foreground))]',
  mobileDrawer: 'lg:hidden flex flex-col gap-[30px] py-[15px] mb-5',

  // Reset link
  resetLink: 'font-[family-name:var(--font-body)] underline text-[18px] text-[rgb(var(--color-muted))]',

  // Empty / error states
  emptyState: 'flex-1 py-12 text-center font-[family-name:var(--font-body)]',
  emptyStateText: 'text-[20px] text-[rgb(var(--color-muted))] mb-4',
  emptyStateButton: 'px-6 py-3 bg-[rgb(var(--color-foreground))] text-[rgb(var(--color-background))] rounded-[10px] text-base',
} as const;
