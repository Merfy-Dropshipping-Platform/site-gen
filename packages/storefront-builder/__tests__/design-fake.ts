import type { Captured, Session } from '../src/design/design-capture';
import type { DomBlock } from '../src/design/design-dom';

// Захват без браузера для тестов «Дизайна по ссылке»: страница уже «открыта», скрипты отвечают заданным.
export function fakeCaptured(fields: Partial<Captured> = {}): Captured {
  return {
    url: 'https://shop.example/',
    finalUrl: 'https://shop.example/home',
    title: 'Магазин',
    status: 200,
    cdp: 'http://127.0.0.1:9222',
    ws: 'ws://127.0.0.1:9222/devtools/browser/x',
    proxy: 'http://127.0.0.1:3128',
    height: 2000,
    dom: [],
    google: [],
    evaluate: () => Promise.resolve(null),
    shot: () => Promise.resolve({ screen: Buffer.from('s'), full: Buffer.from('f') }),
    ...fields,
  };
}

export function fakeSession(captured: Captured = fakeCaptured()): Session & { closed: number } {
  const session = {
    captured,
    closed: 0,
    close: () => {
      session.closed += 1;
      return Promise.resolve();
    },
  };
  return session;
}

export const domBlock = (fields: Partial<DomBlock> = {}): DomBlock => ({
  tag: 'section',
  hint: '',
  id: '',
  box: { x: 0, y: 0, w: 1366, h: 400 },
  heading: null,
  cards: 0,
  images: 0,
  form: false,
  email: false,
  fields: 0,
  textarea: false,
  video: false,
  slides: 0,
  fixed: false,
  prices: 0,
  links: 0,
  details: 0,
  text: '',
  layout: 'unknown',
  columns: 1,
  iframeMap: false,
  ...fields,
});
