import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Вкладки (design.md блока 6, раздел 6): свой код по шаблону W3C APG Tabs — автоматическая активация, стрелки
// по кругу, Home и End; пара триггер-панель — общий data-value.

interface Pair {
  readonly trigger: HTMLElement;
  readonly panel: HTMLElement;
  readonly value: string;
}

interface Keyboard {
  open(pair: Pair): void;
  focusAt(from: Pair, key: string): Pair | undefined;
}

const STEPS: Readonly<Record<string, Readonly<Record<string, 'next' | 'prev'>>>> = {
  horizontal: { ArrowRight: 'next', ArrowLeft: 'prev' },
  vertical: { ArrowDown: 'next', ArrowUp: 'prev' },
};

function pairsOf(host: BehaviorHost): readonly Pair[] {
  const triggers = [...host.root.querySelectorAll<HTMLElement>('[data-part="trigger"]')];
  const panels = [...host.root.querySelectorAll<HTMLElement>('[data-part="content"]')];
  return triggers.flatMap((trigger) => {
    const value = trigger.getAttribute('data-value');
    const panel = panels.find((node) => node.getAttribute('data-value') === value);
    if (value === null || panel === undefined) return [];
    return [{ trigger, panel, value }];
  });
}

function ensureIds(pairs: readonly Pair[], sectionId: string): void {
  pairs.forEach((pair) => {
    if (pair.trigger.id === '') pair.trigger.id = `${sectionId}-tab-${pair.value}`;
    if (pair.panel.id === '') pair.panel.id = `${sectionId}-panel-${pair.value}`;
    pair.trigger.setAttribute('role', 'tab');
    pair.trigger.setAttribute('aria-controls', pair.panel.id);
    pair.panel.setAttribute('role', 'tabpanel');
    pair.panel.setAttribute('aria-labelledby', pair.trigger.id);
  });
}

function markList(host: BehaviorHost): void {
  const list = host.root.querySelector('[data-part="list"]');
  if (list === null) return;
  list.setAttribute('role', 'tablist');
  if (host.params.orientation === 'vertical') list.setAttribute('aria-orientation', 'vertical');
}

const stepOf = (orientation: string, key: string): 'next' | 'prev' | null =>
  (STEPS[orientation] ?? STEPS.horizontal)[key] ?? null;

const isHomeOrEnd = (key: string): boolean => key === 'Home' || key === 'End';

function keyboardOf(pairs: readonly Pair[]): Keyboard {
  const open = (pair: Pair): void => {
    pairs.forEach(({ trigger, panel, value }) => {
      const selected = value === pair.value;
      trigger.setAttribute('aria-selected', String(selected));
      trigger.tabIndex = selected ? 0 : -1;
      panel.toggleAttribute('hidden', !selected);
    });
  };
  const indexFor = (from: Pair, key: string): number => {
    const at = pairs.indexOf(from);
    const total = pairs.length;
    if (key === 'Home') return 0;
    if (key === 'End') return total - 1;
    if (key === 'next') return (at + 1) % total;
    return (at - 1 + total) % total;
  };
  const focusAt = (from: Pair, key: string): Pair | undefined => {
    const pair = pairs[indexFor(from, key)];
    if (pair === undefined) return undefined;
    pair.trigger.focus();
    open(pair);
    return pair;
  };
  return { open, focusAt };
}

// Слушатели вкладки: клик открывает, стрелки/Home/End ведут фокус и выбор вместе.
function listenPair(host: BehaviorHost, keyboard: Keyboard, pair: Pair, onOpen: (pair: Pair) => void): void {
  pair.trigger.addEventListener(
    'click',
    () => {
      keyboard.open(pair);
      onOpen(pair);
    },
    { signal: host.signal },
  );
  pair.trigger.addEventListener(
    'keydown',
    (event) => {
      const step = stepOf(String(host.params.orientation), event.key);
      if (step === null && !isHomeOrEnd(event.key)) return;
      event.preventDefault();
      onOpen(keyboard.focusAt(pair, step ?? event.key) ?? pair);
    },
    { signal: host.signal },
  );
}

export const tabs: Behavior<'tabs'> = {
  name: 'tabs',
  attach(host: BehaviorHost): BehaviorInstance {
    const pairs = pairsOf(host);
    const sectionId = host.section.getAttribute('data-section-id') ?? host.section.id;
    ensureIds(pairs, sectionId);
    markList(host);
    const keyboard = keyboardOf(pairs);
    const initial = pairs.find((pair) => pair.value === String(host.params.value ?? '')) ?? pairs[0];
    const current: { pair: Pair | null } = { pair: initial ?? null };
    if (initial !== undefined) keyboard.open(initial);
    const onOpen = (pair: Pair): void => {
      current.pair = pair;
    };
    pairs.forEach((pair) => listenPair(host, keyboard, pair, onOpen));
    return {
      save: () => ({ value: current.pair?.value ?? null }),
      restore: (state) => {
        if (typeof state !== 'object' || state === null || !('value' in state)) return;
        const pair = pairs.find((item) => item.value === state.value);
        if (pair !== undefined) {
          current.pair = pair;
          keyboard.open(pair);
        }
      },
    };
  },
};
