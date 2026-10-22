import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Количество (design.md блока 6, раздел 8): браузер — stepUp() и stepDown() у поля, границы — min и max поля.

const partOf = (host: BehaviorHost, name: string): HTMLElement | null =>
  host.root.querySelector<HTMLElement>(`[data-part="${name}"]`);

function step(input: HTMLInputElement, direction: 'down' | 'up'): void {
  if (direction === 'up') input.stepUp();
  else input.stepDown();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// minus недоступен, когда значение не больше min; plus — когда не меньше max (нет атрибута — границы нет).
function updateButtons(input: HTMLInputElement, minus: HTMLElement, plus: HTMLElement): void {
  const value = Number(input.value);
  const min = input.min === '' ? null : Number(input.min);
  const max = input.max === '' ? null : Number(input.max);
  minus.toggleAttribute('disabled', min !== null && value <= min);
  plus.toggleAttribute('disabled', max !== null && value >= max);
}

export const quantity: Behavior<'quantity'> = {
  name: 'quantity',
  attach(host: BehaviorHost): BehaviorInstance {
    const input = partOf(host, 'input');
    const minus = partOf(host, 'minus');
    const plus = partOf(host, 'plus');
    if (!(input instanceof HTMLInputElement) || minus === null || plus === null) return {};
    const refresh = (): void => updateButtons(input, minus, plus);
    refresh();
    minus.addEventListener('click', () => step(input, 'down'), { signal: host.signal });
    plus.addEventListener('click', () => step(input, 'up'), { signal: host.signal });
    input.addEventListener('input', refresh, { signal: host.signal });
    input.addEventListener('change', refresh, { signal: host.signal });
    return {};
  },
};
