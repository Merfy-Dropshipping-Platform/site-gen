import type { ShellKit } from '../src/shell';

// Поведения для тестов: файлы с теми же именами и связями, что у dist/behaviors, но маленькие; в каждом — метка kit-…,
// по ней тест видит, попал файл в бандл или нет. Общий кусок chunk-AAA111.js нужен accordion и carousel.
export const KIT_FILES: ReadonlyMap<string, string> = new Map([
  [
    'part.js',
    'export const behaviors = (options) => ({ name: "behaviors", marker: "kit-part", list: options.list, reveal: options.reveal, animate: options.animate });',
  ],
  [
    'accordion.js',
    'import { shared } from "./chunk-AAA111.js"; export const accordion = { name: "accordion", marker: "kit-accordion", shared };',
  ],
  [
    'carousel.js',
    'import { shared } from "./chunk-AAA111.js"; export const carousel = { name: "carousel", marker: "kit-carousel", shared };',
  ],
  ['nav-menu.js', 'export const navMenu = { name: "nav-menu", marker: "kit-nav-menu" };'],
  ['reveal.js', 'export const reveal = { marker: "kit-reveal" };'],
  ['animate.js', 'export const animate = () => "kit-animate";'],
  ['chunk-AAA111.js', 'export const shared = "kit-chunk";'],
]);

export const KIT: ShellKit = { files: KIT_FILES, behaviors: ['accordion', 'carousel', 'nav-menu'] };
