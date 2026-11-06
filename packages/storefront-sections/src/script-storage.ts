import type { NodePath } from '@babel/traverse';
import { checkKey } from '@merfy/shell/storage-key';
import { argsOf, child, isMember, memberKey, unwrap, valuesOf, type AttrFinding } from './script-attrs';

// Ключ ctx.storage при сохранении: ядро отказывает при выполнении, и секция падает у покупателя (магазин с окном
// popups-расширения, 06.11: storage.get('firstAt') приняли, на витрине — ShellError на каждой странице). Правило — та же
// функция ядра (@merfy/shell/storage-key). Ключ из вычисления при сохранении не известен, его проверит ядро.
// Формы: ctx.storage.get('k'), ctx?.storage?.set('k', v), const { storage } = ctx, mount(el, { storage }),
// const box = ctx.storage. Откуда взят объект, не важно: других storage у кода секции нет.
const METHODS: ReadonlySet<string> = new Set(['get', 'set', 'remove']);
const STORAGE = 'storage';

// const box = ctx.storage: псевдоним хранилища.
function isStorageAlias(path: NodePath): boolean {
  if (!path.isIdentifier()) return false;
  const binding = path.scope.getBinding(path.node.name);
  if (binding === undefined || !binding.path.isVariableDeclarator()) return false;
  const init = child(binding.path, 'init');
  const value = init === null ? null : unwrap(init);
  return value !== null && isMember(value) && memberKey(value) === STORAGE;
}

function isStorage(object: NodePath): boolean {
  const path = unwrap(object);
  if (isMember(path)) return memberKey(path) === STORAGE;
  return path.isIdentifier({ name: STORAGE }) || isStorageAlias(path);
}

function badKey(keys: readonly unknown[]): string | null {
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    try {
      checkKey(key);
    } catch {
      return key;
    }
  }
  return null;
}

const kebabOf = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

// Ключ хранилища в вызове call, который ядро откажет, или null.
export function storageFindingOf(call: NodePath): AttrFinding | null {
  const callee = child(call, 'callee');
  const path = callee === null ? null : unwrap(callee);
  if (path === null || !isMember(path)) return null;
  const method = memberKey(path);
  const object = child(path, 'object');
  if (method === null || !METHODS.has(method) || object === null || !isStorage(object)) return null;
  const [keyArg] = argsOf(call);
  const keys = keyArg === undefined ? null : valuesOf(keyArg);
  const key = keys === null ? null : badKey(keys);
  if (key === null || keyArg === undefined) return null;
  const hint = kebabOf(key);
  const fix = hint === '' ? 'ключ — строчные буквы, цифры и дефис' : `напиши '${hint}'`;
  return {
    node: keyArg.node,
    message: `storage.${method}('${key}'): ключ хранилища — kebab-case, на витрине секция упадёт · ${fix}`,
  };
}
