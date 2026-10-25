import type { NoticeLevel } from '@merfy/shell';

export const NOTICES_MAX = 3;
export const HIDE_AFTER_MS = 8000;

export interface Notice {
  readonly level: NoticeLevel;
  readonly message: string;
}

// Показать: такой текст уже есть — остаётся на своём месте с уровнем нового; иначе — в конец; больше трёх — самое старое
// уходит.
export function shownNotices(list: readonly Notice[], next: Notice): Notice[] {
  const inPlace = list.map((notice) => (notice.message === next.message ? next : notice));
  if (inPlace.some((notice) => notice.message === next.message)) return inPlace;
  const kept = list.slice(Math.max(0, list.length - (NOTICES_MAX - 1)));
  return [...kept, next];
}

// Закрыть: убрать по тексту; чужой текст — тот же список.
export const closedNotices = (list: readonly Notice[], message: string): Notice[] =>
  list.filter((notice) => notice.message !== message);

// error — 'alert', warning — 'status'.
export const roleOf = (level: NoticeLevel): 'alert' | 'status' => (level === 'error' ? 'alert' : 'status');
