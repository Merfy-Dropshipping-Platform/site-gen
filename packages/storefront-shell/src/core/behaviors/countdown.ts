import { watchSource } from '../stores';
import type { PageModule } from '../types';
import { sectionRefOf } from './section-ref';
import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Таймер до даты (модуль page): data-until — дата окончания, ISO 8601 с поясом; части days, hours, minutes и seconds —
// дочерние элементы, в них пишется остаток. Идёт по $now модуля page — времени сервера магазина, а не часов устройства,
// поэтому разница в часах у посетителей таймер не сдвигает. Нет какой-то части — самая крупная из оставшихся берёт её
// время (без days часы считают и сутки). В ноль — событие merfy:countdown:end и остановка. Цифры не анимируются:
// «уменьшить движение» таймер не меняет. Модуль page секция объявляет в uses.

const NO_MODULE_TEXT =
  'Поведение countdown: на странице нет модуля page — в section.json секции нужен "uses": ["page"]';
const BAD_DATE_TEXT = (raw: string | null): string =>
  `Поведение countdown: data-until=${raw === null ? 'не задан' : `"${raw}"`} — нужна дата ISO 8601 с поясом, например 2026-12-31T23:59:59+03:00`;

// Дата и время с поясом: Z или ±чч:мм. Дата без пояса зависела бы от часов устройства — такую не принимаем.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

// Единицы от крупной к мелкой; pad — два знака («05»), у суток — без дополнения.
const UNITS = [
  { name: 'days', ms: 86_400_000, pad: false },
  { name: 'hours', ms: 3_600_000, pad: true },
  { name: 'minutes', ms: 60_000, pad: true },
  { name: 'seconds', ms: 1000, pad: true },
] as const;

interface Slot {
  readonly element: HTMLElement;
  readonly ms: number;
  readonly pad: boolean;
}

function endOf(raw: string | null): number | null {
  if (raw === null || !ISO_WITH_ZONE.test(raw)) return null;
  const end = Date.parse(raw);
  return Number.isNaN(end) ? null : end;
}

const slotsOf = (host: BehaviorHost): readonly Slot[] =>
  UNITS.flatMap((unit) => {
    const element = host.root.querySelector<HTMLElement>(`[data-part="${unit.name}"]`);
    return element === null ? [] : [{ element, ms: unit.ms, pad: unit.pad }];
  });

// Остаток целыми секундами вверх: ноль показывается, только когда время вышло, а не за секунду до этого.
function render(slots: readonly Slot[], left: number): void {
  let rest = Math.ceil(Math.max(0, left) / 1000) * 1000;
  slots.forEach(({ element, ms, pad }) => {
    const value = Math.floor(rest / ms);
    rest -= value * ms;
    element.textContent = pad ? String(value).padStart(2, '0') : String(value);
  });
}

function pageOf(host: BehaviorHost): PageModule | null {
  try {
    if (host.core === undefined) throw new Error('нет ядра');
    return host.core.part('page');
  } catch {
    console.error(NO_MODULE_TEXT);
    return null;
  }
}

export const countdown: Behavior<'countdown'> = {
  name: 'countdown',
  attach(host: BehaviorHost): BehaviorInstance {
    const raw = host.params.until;
    const end = endOf(typeof raw === 'string' ? raw : null);
    if (end === null) {
      console.error(BAD_DATE_TEXT(typeof raw === 'string' ? raw : null));
      return {};
    }
    const page = pageOf(host);
    const source = page === null ? null : watchSource(page.$now);
    if (page === null || source === null) return {};
    const slots = slotsOf(host);
    let ended = false;
    let stop: () => void = () => undefined;
    const update = (now: number | null): void => {
      if (now === null || ended) return; // время сервера ещё не пришло: часам устройства конец не доверен
      const left = end - now;
      render(slots, left);
      if (left > 0) return;
      ended = true;
      stop();
      host.core?.emit('merfy:countdown:end', sectionRefOf(host));
    };
    stop = source.listen(update);
    if (ended) stop(); // время в сторе уже было и вышло, пока шла подписка
    host.signal.addEventListener('abort', () => stop(), { once: true });
    update(page.$now.get());
    return {};
  },
};
