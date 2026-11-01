import type { EventDetail } from '../types';
import type { BehaviorHost } from './types';

// Секция поведения для данных событий countdown и scratch: имя и id экземпляра, как у merfy:section:error. Нет
// data-section-id — id равен имени, как у ctx.id.
export function sectionRefOf(host: BehaviorHost): EventDetail<'merfy:countdown:end'> {
  const section = host.section.getAttribute('data-section') ?? '';
  return { section, id: host.section.getAttribute('data-section-id') ?? section };
}
