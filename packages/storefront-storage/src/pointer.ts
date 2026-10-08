import { StorefrontStorageError } from './errors';
import { FORMAT_VERSION, HISTORY_LIMIT, parsePointer, type Pointer } from './formats';
import { pointerKey } from './layout';
import { readObject, updateObject, type Decision } from './objects';
import type { ObjectStore } from './store';

// Указатель «магазин → живая сборка» (design.md блока 5, В5-2 Б и В5-6 А). Что делает каждая команда — чистые функции
// ниже, по одной на команду; запись — одна условная (updateObject). Номер сборки выдаёт сборщик (блок 6) при её старте.

interface IntentFields {
  // Выложить готовую сборку: только если новее всех, что выкладывались. На паузе — ждёт снятия паузы.
  publish: { shop: string; build: number };
  // Откат на прошлую живую сборку и пауза. from — живая сборка, которую видел тот, кто откатывает: если живая уже
  // другая, откат не нужен (его сделали или выложили новую), и повтор команды не откатит дважды.
  rollback: { from: number };
  pause: object;
  // Снять паузу: ждущая сборка становится живой.
  resume: object;
}
type IntentKind = keyof IntentFields;
type IntentOf<K extends IntentKind> = { kind: K } & IntentFields[K];
export type PointerIntent = { [K in IntentKind]: IntentOf<K> }[IntentKind];
export type PointerOutcome = 'live' | 'paused' | 'stale' | 'unchanged';
export type PointerDecision = Decision<Pointer, PointerOutcome>;

export interface PointerChange {
  outcome: PointerOutcome;
  pointer: Pointer | null;
}

const keep = (outcome: PointerOutcome): PointerDecision => ({ outcome, next: null });
const changed = (outcome: PointerOutcome, next: Pointer): PointerDecision => ({ outcome, next });
const historyWith = (build: number, history: readonly number[]): number[] =>
  [build, ...history].slice(0, HISTORY_LIMIT);

function existing(current: Pointer | null, key: string): Pointer {
  if (current === null) throw new StorefrontStorageError('pointer-missing', 'у магазина нет указателя', { path: key });
  return current;
}

function created(intent: IntentOf<'publish'>): Pointer {
  const { shop, build } = intent;
  return { v: FORMAT_VERSION, shop, build, newest: build, rev: 1, paused: false, pending: null, history: [] };
}

function decidePublish(current: Pointer | null, intent: IntentOf<'publish'>, key: string): PointerDecision {
  if (current === null) return changed('live', created(intent));
  if (current.shop !== intent.shop)
    throw new StorefrontStorageError('object-invalid', `указатель другого магазина: ${current.shop}`, { path: key });
  if (current.build === intent.build && !current.paused) return keep('live');
  if (current.pending === intent.build) return keep('paused');
  if (intent.build <= current.newest) return keep('stale');
  const next = { ...current, newest: intent.build, rev: current.rev + 1 };
  if (current.paused) return changed('paused', { ...next, pending: intent.build });
  return changed('live', { ...next, build: intent.build, history: historyWith(current.build, current.history) });
}

function decideRollback(current: Pointer | null, intent: IntentOf<'rollback'>, key: string): PointerDecision {
  const pointer = existing(current, key);
  if (pointer.build !== intent.from) return keep('unchanged');
  const [previous, ...older] = pointer.history;
  if (previous === undefined)
    throw new StorefrontStorageError('rollback-impossible', 'в истории нет прошлой сборки', { path: key });
  return changed('paused', {
    ...pointer,
    build: previous,
    history: older,
    paused: true,
    pending: null,
    rev: pointer.rev + 1,
  });
}

function decidePause(current: Pointer | null, intent: IntentOf<'pause'>, key: string): PointerDecision {
  const pointer = existing(current, key);
  if (pointer.paused) return keep('paused');
  return changed('paused', { ...pointer, paused: true, rev: pointer.rev + 1 });
}

function decideResume(current: Pointer | null, intent: IntentOf<'resume'>, key: string): PointerDecision {
  const pointer = existing(current, key);
  if (!pointer.paused) return keep('live');
  const next = { ...pointer, paused: false, pending: null, rev: pointer.rev + 1 };
  if (pointer.pending === null) return changed('live', next);
  return changed('live', { ...next, build: pointer.pending, history: historyWith(pointer.build, pointer.history) });
}

const DECISIONS: { [K in IntentKind]: (current: Pointer | null, intent: IntentOf<K>, key: string) => PointerDecision } =
  {
    publish: decidePublish,
    rollback: decideRollback,
    pause: decidePause,
    resume: decideResume,
  };

export function nextPointer<K extends IntentKind>(
  current: Pointer | null,
  intent: IntentOf<K>,
  key: string,
): PointerDecision {
  const decide: (current: Pointer | null, intent: IntentOf<K>, key: string) => PointerDecision = DECISIONS[intent.kind];
  return decide(current, intent, key);
}

export async function changePointer(store: ObjectStore, label: string, intent: PointerIntent): Promise<PointerChange> {
  const key = pointerKey(label);
  const { outcome, value } = await updateObject(store, key, parsePointer, (current) =>
    nextPointer(current, intent, key),
  );
  return { outcome, pointer: value };
}

export async function readPointer(store: ObjectStore, label: string): Promise<Pointer | null> {
  return (await readObject(store, pointerKey(label), parsePointer))?.value ?? null;
}

// «Живая сборка есть?» (design.md, раздел 4, «Фоновые задачи»): у магазина новой темы — есть указатель. Её зовут
// фоновые задачи нынешнего конвейера вместо проверки sites/<slug>/index.html — это подключает блок 6.
export const hasLiveBuild = async (store: ObjectStore, label: string): Promise<boolean> =>
  (await readPointer(store, label)) !== null;
