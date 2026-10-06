import type { Passport } from '../../src/types';

// Чистый стенд из живого образца (storefront-stand.html, cleanPage) — в типах раздела 6.
export function cleanPassport(): Passport {
  return {
    version: 1,
    page: '/theme-stand',
    target: 'local',
    scripts: [
      { src: '/_astro/shell.*.js', kind: 'module', bytes: 9216, hash: '3f9a2c1e' },
      { src: '#merfy-config', kind: 'json', bytes: 418 },
    ],
    globals: {},
    storage: ['local:merfy:cartId'],
    cookies: [],
    requests: [
      { url: '/_astro/shell.*.js', status: 200 },
      { url: '/fonts/manrope-400.woff2', status: 200 },
      { url: '/fonts/manrope-700.woff2', status: 200 },
    ],
    errors: [],
    tokens: {
      '--background': '#ffffff',
      '--foreground': '#111111',
      '--primary': '#111111',
      '--primary-foreground': '#ffffff',
      '--radius-button': '0.5rem',
    },
    fonts: ['Manrope 400 normal', 'Manrope 700 normal'],
  };
}

// Что можно поменять ко второму прогону — поломки живого образца (CHANGES). Цвет из панели — не поломка.
export const BREAKAGES = {
  script: (passport: Passport): void => {
    passport.scripts.push({ src: 'https://widget.example/chat.js', kind: 'external', bytes: 48211 });
    passport.requests.push({ url: 'https://widget.example/chat.js', status: 200 });
  },
  global: (passport: Passport): void => {
    passport.globals.__MERFY_SITE_ID__ = '"demo-site"';
  },
  cart: (passport: Passport): void => {
    passport.storage = [...passport.storage.filter((key) => key !== 'local:merfy:cartId'), 'local:cart:v2'];
  },
  error: (passport: Passport): void => {
    passport.errors.push('TypeError: cart.add is not a function');
  },
  font: (passport: Passport): void => {
    passport.fonts = passport.fonts.filter((font) => font !== 'Manrope 700 normal');
    passport.requests = passport.requests.map((request) =>
      request.url === '/fonts/manrope-700.woff2' ? { url: request.url, status: 404 } : request,
    );
  },
  panel: (passport: Passport): void => {
    passport.tokens['--primary'] = '#e91e8c';
    passport.tokens['--primary-foreground'] = '#000000';
  },
};

export type BreakageName = keyof typeof BREAKAGES;

export function broken(...names: BreakageName[]): Passport {
  const passport = cleanPassport();
  names.forEach((name) => BREAKAGES[name](passport));
  return passport;
}
