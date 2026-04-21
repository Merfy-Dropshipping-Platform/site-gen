// Satin Footer — 2-part top grid + powered-by black bar at bottom.
// Differs from base: 1320px container, flat (0px) radii, uppercase newsletter
// heading + submit with 0.05em tracking, Manrope button font.
export const FooterClasses = {
  root: 'w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'w-full max-w-[1320px] mx-auto px-5 pt-[80px] pb-[80px]',
  newsletter: {
    wrapper: 'pb-[48px] mb-[48px] border-b border-[rgb(var(--color-muted))]/30',
    inner: 'max-w-[600px] mx-auto text-center',
    copy: 'flex flex-col items-center gap-2 mb-6',
    // Satin signature: uppercase + 0.05em tracking on newsletter heading.
    heading: 'text-[24px] md:text-[28px] font-normal uppercase tracking-[0.05em] leading-[1.2] mb-[8px] font-[var(--font-heading)] text-[rgb(var(--color-heading))]',
    description: 'text-[16px] font-normal leading-[1.5] mb-[24px] font-[var(--font-body)] text-[rgb(var(--color-text))] opacity-70',
    form: 'flex flex-col sm:flex-row gap-[12px] max-w-[480px] mx-auto',
    input: 'flex-1 h-[48px] px-[16px] text-[16px] outline-none font-[var(--font-body)] bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-muted))]/50 text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))]',
    // Satin signature: uppercase submit with Manrope font + 0.05em tracking.
    submit: 'h-[48px] px-[24px] text-[16px] font-normal uppercase tracking-[0.05em] hover:opacity-90 transition-opacity font-[var(--font-button,Manrope)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))]',
  },
  main: {
    section: 'flex flex-col md:flex-row justify-between gap-10 md:gap-20',
    leftCol: 'flex flex-col gap-6',
    rightCol: 'flex flex-col gap-[64px] md:items-end',
  },
  brand: 'text-[20px] font-normal uppercase tracking-[0.05em] leading-[1.2] font-[var(--font-heading)] text-[rgb(var(--color-heading))]',
  navColumn: {
    root: 'flex flex-col gap-[8px]',
    link: 'text-[16px] font-normal hover:opacity-80 transition-opacity font-[var(--font-body)] text-[rgb(var(--color-text))]',
  },
  infoColumn: {
    wrap: 'flex flex-col gap-[8px] md:items-end',
    label: 'text-[16px] font-normal font-[var(--font-body)] text-[rgb(var(--color-text))]',
    emailLink: 'text-[16px] font-normal hover:opacity-80 transition-opacity font-[var(--font-body)] text-[rgb(var(--color-text))]',
  },
  socialRow: 'flex gap-[8px]',
  socialLink: 'w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-text))]',
  paymentRow: 'flex gap-[8px] md:items-end',
  paymentBadge: 'h-[24px] px-1 flex items-center justify-center border border-[rgb(var(--color-muted))]/30 bg-[rgb(var(--color-bg))]',
  paymentBadgeText: 'text-[10px] font-bold font-[var(--font-body)] text-[rgb(var(--color-heading))]',
  copyrightBar: {
    root: 'flex flex-col md:flex-row justify-between gap-4 mt-[32px]',
    text: 'text-[16px] font-normal font-[var(--font-body)] text-[rgb(var(--color-text))]',
    links: 'flex flex-wrap gap-[24px]',
    link: 'text-[16px] font-normal hover:opacity-80 transition-opacity font-[var(--font-body)] text-[rgb(var(--color-text))]',
  },
  poweredBy: {
    bar: 'w-full h-[64px] flex items-center justify-center bg-[rgb(var(--color-heading))]',
    text: 'text-[16px] font-light leading-[1.2] text-center px-4 font-[var(--font-body)] text-[rgb(var(--color-bg))]',
  },
} as const;
