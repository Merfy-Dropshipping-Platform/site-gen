import type { EventBus } from './events';
import type { EventDetail, EventName } from './types';

// Уведомление без секции «Уведомления» на странице (блок 9, п. 10 «Решил сам»; Р9а-20, часть 9б): ядро отправляет
// событие как всегда — секциям, потом копия на document, — и, если это имя не слушает ни одна секция, пишет текст
// уведомления в console.warn. Другие события консоль не трогают.

export const NOTICE_EVENT = 'merfy:notice:show';

const UNHEARD_PREFIX = 'Уведомление (секции «Уведомления» на странице нет): ';

// Строка консоли: префикс и текст уведомления.
export const unheardNoticeText = (message: string): string => `${UNHEARD_PREFIX}${message}`;

// Текст уведомления из detail события: только строка, иначе пустой текст.
const noticeMessageOf = (detail: unknown): string => {
  if (typeof detail !== 'object' || detail === null) return '';
  const message: unknown = Reflect.get(detail, 'message');
  return typeof message === 'string' ? message : '';
};

// CoreHandle.emit ядра: событие в шину (секциям, потом копия на document); merfy:notice:show без подписки секции
// (bus.listening) — ещё и console.warn с текстом уведомления.
export function emitCore<E extends EventName>(bus: EventBus, name: E, detail: EventDetail<E>): void {
  bus.emit(name, detail);
  if (name === NOTICE_EVENT && !bus.listening(NOTICE_EVENT)) console.warn(unheardNoticeText(noticeMessageOf(detail)));
}
