// Rose Footer — 3-column grid layout.
// Differs from base: wide 1920px container (2xl:px-[300px]), 3-column grid
// on desktop, FooterColumn titles with uppercase Bitter heading, FooterLink
// muted text hover-to-heading, SocialIcon circle stroked in muted color.
export const FooterClasses = {
  root: 'w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'w-full max-w-[1920px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-[300px]',
  newsletter: {
    wrapper: 'pb-10 sm:pb-12 md:pb-16 lg:pb-20 xl:pb-24',
    inner: 'max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-[809px] mx-auto',
    copy: 'flex flex-col items-center gap-3 sm:gap-4 lg:gap-[5px] mb-8 sm:mb-10 lg:mb-12',
    heading: 'text-2xl sm:text-3xl md:text-[32px] lg:text-[34px] xl:text-[36px] font-normal uppercase leading-[1.115] text-center font-[var(--font-heading)] text-[rgb(var(--color-heading))]',
    description: 'text-base sm:text-lg md:text-xl lg:text-[22px] xl:text-[24px] font-normal leading-[1.366] text-center px-4 sm:px-0 font-[var(--font-body)] text-[rgb(var(--color-text))] opacity-70',
    form: 'w-full max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-[600px] mx-auto h-auto sm:h-16 md:h-[70px] lg:h-[75px] xl:h-[80px] border border-[rgb(var(--color-text))] rounded-lg md:rounded-[10px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center px-4 sm:px-5 lg:px-[25px] py-3 sm:py-2 lg:py-[10px] gap-3 sm:gap-2 lg:gap-[10px] bg-[rgb(var(--color-bg))]',
    input: 'flex-1 bg-transparent text-lg sm:text-xl md:text-[22px] lg:text-2xl font-light leading-[1.366] outline-none font-[var(--font-body)] text-[rgb(var(--color-text))] opacity-70 placeholder:text-[rgb(var(--color-muted))]',
    submit: 'w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center self-end sm:self-center hover:scale-110 transition-transform text-[rgb(var(--color-text))]',
  },
  main: {
    section: 'pb-6 sm:pb-8 md:pb-10 lg:pb-12 xl:pb-16',
    grid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 md:gap-12 lg:gap-16 xl:gap-20',
    socialColumnWrap: 'sm:col-span-2 lg:col-span-1',
  },
  column: {
    root: 'flex flex-col gap-4 sm:gap-5 lg:gap-[25px]',
    title: 'text-lg sm:text-xl md:text-[22px] lg:text-[24px] font-normal text-[rgb(var(--color-heading))] uppercase leading-[1.115] font-[var(--font-heading)]',
    body: 'flex flex-col gap-4 sm:gap-5 lg:gap-[25px]',
    nav: 'flex flex-col gap-4 sm:gap-5 lg:gap-[25px]',
  },
  link: 'text-base sm:text-lg md:text-[18px] lg:text-[20px] font-normal text-[rgb(var(--color-muted))] leading-[1.366] hover:text-[rgb(var(--color-heading))] transition-colors font-[var(--font-body)]',
  email: 'text-base sm:text-lg md:text-[18px] lg:text-[20px] font-normal text-[rgb(var(--color-muted))] leading-[1.366] hover:text-[rgb(var(--color-heading))] transition-colors font-[var(--font-body)]',
  socialRow: 'flex gap-3 sm:gap-4 lg:gap-[15px]',
  socialLink: 'w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 flex items-center justify-center hover:opacity-70 transition-opacity text-[rgb(var(--color-muted))]',
  copyright: {
    bar: 'w-full h-auto sm:h-20 md:h-24 lg:h-[100px] flex items-center justify-center py-6 sm:py-0 bg-[rgb(var(--color-heading))] text-[rgb(var(--color-bg))]',
    text: 'text-sm sm:text-base md:text-lg lg:text-[20px] font-light leading-[1.21] text-center px-4 sm:px-6 font-[var(--font-body)]',
  },
} as const;
