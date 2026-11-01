// Запрет прокрутки страницы (Р6-7; 01.11) — общий у окон поведения dialog и окон поверх страницы (parts/overlay.ts):
// счётчик открытых окон, прежнее overflow у <html> возвращается после последнего. Счётчик лежит на документе под
// Symbol.for, а не в модуле: ядро и поведения — разные файлы сборки, у каждого была бы своя копия счётчика, и окно
// поведения, закрывшись, отпирало бы страницу под открытым окном ядра.
// PURE — для сборки: модуль без окон на странице не тянет этот вызов в бандл ядра.
const LOCK = /* @__PURE__ */ Symbol.for('merfy.scroll-lock');

interface ScrollLock {
  count: number;
  previous: string;
}

const isScrollLock = (value: unknown): value is ScrollLock =>
  typeof value === 'object' && value !== null && 'count' in value && 'previous' in value;

function lockOf(doc: Document): ScrollLock {
  const found: unknown = Reflect.get(doc, LOCK);
  if (isScrollLock(found)) return found;
  const created: ScrollLock = { count: 0, previous: '' };
  Reflect.set(doc, LOCK, created);
  return created;
}

export function lockScroll(doc: Document): void {
  const lock = lockOf(doc);
  if (lock.count === 0) lock.previous = doc.documentElement.style.overflow;
  lock.count += 1;
  doc.documentElement.style.overflow = 'hidden';
}

export function unlockScroll(doc: Document): void {
  const lock = lockOf(doc);
  lock.count = Math.max(0, lock.count - 1);
  if (lock.count === 0) doc.documentElement.style.overflow = lock.previous;
}
