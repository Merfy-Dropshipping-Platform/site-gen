import { parseArgs } from 'node:util';
import { changePointer, readPointer, type PointerChange } from '../src/pointer';
import { createS3Store } from '../src/s3-store';
import { s3FromEnv } from './s3-env';

// pnpm pointer <команда> --label <метка хоста> [--from <сборка>] — служебные команды указателя (design.md блока 5,
// В5-6 А): show — показать указатель; rollback --from N — откат с живой сборки N на прошлую, выкладка на паузе;
// pause — пауза; resume — снять паузу, ждущая сборка становится живой. Хранилище — из переменных окружения (s3-env.ts).

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { label: { type: 'string' }, from: { type: 'string' } },
});
const label = values.label ?? '';
const store = createS3Store(s3FromEnv());

function fromBuild(): number {
  const from = Number(values.from);
  if (!Number.isInteger(from)) throw new Error('rollback: нужен --from <номер живой сборки>');
  return from;
}

const described = (change: PointerChange): string => `${change.outcome}: ${JSON.stringify(change.pointer)}`;

const COMMANDS: Record<string, () => Promise<string>> = {
  show: async () => JSON.stringify(await readPointer(store, label)),
  rollback: async () => described(await changePointer(store, label, { kind: 'rollback', from: fromBuild() })),
  pause: async () => described(await changePointer(store, label, { kind: 'pause' })),
  resume: async () => described(await changePointer(store, label, { kind: 'resume' })),
};

const command = COMMANDS[positionals[0] ?? ''];
if (command === undefined) throw new Error(`команда: ${Object.keys(COMMANDS).join(' | ')}`);
process.stdout.write(`${await command()}\n`);
