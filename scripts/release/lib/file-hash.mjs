/**
 * Отпечатки файлов для памяти результатов (spec 115, часть 3).
 *
 * Отпечаток — sha1 содержимого. Чтобы не перечитывать тысячи файлов на каждый
 * прогон, он запоминается по (mtime, ctime, size, ino) в
 * node_modules/.cache/merfy-checks/file-hash.json этого дерева. Файл, тронутый
 * меньше двух секунд назад, перечитывается всегда: правка в тот же тик часов
 * могла бы оставить прежние mtime и размер (та же ловушка, что «racy git»).
 *
 * Каталог — хэш отсортированного списка имён (появился или пропал файл —
 * отпечаток другой). Нет файла — 'absent': проверка, которая смотрела, что
 * файла нет, узнает, когда он появится.
 *
 * Выход сборки (dist/) хэшируется без изменчивых метаданных — то же правило,
 * что у отпечатка конформанса (src/themes/conformance/source-types.ts):
 * `compiledAt` манифеста меняется на каждой сборке, а абсолютный корень дерева
 * в собранных модулях свой у каждого worktree. Поведения ни то ни другое не
 * меняет; без этого любая сборка «меняла» бы вход каждого гарда с рендером,
 * а память не переходила бы между worktree.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const RECENT_MS = 2000;
const MEMO_VERSION = 2;
const sha1 = (data) => createHash('sha1').update(data).digest('hex');

const IS_BUILD_OUTPUT = /(^|\/)dist\//;
const IS_MANIFEST = /manifest\.json$/;

function normalized(rel, buf, roots) {
  if (!IS_BUILD_OUTPUT.test(rel)) return buf;
  // latin1 — байт в символ и обратно без потерь, в том числе для картинок.
  let text = roots.reduce((t, root) => t.split(root).join('<root>'), buf.toString('latin1'));
  if (IS_MANIFEST.test(rel)) text = text.replace(/"compiledAt":\s*"[^"]*",?/g, '');
  return Buffer.from(text, 'latin1');
}

export function createHasher(repoRoot, { memoFile = join(repoRoot, 'node_modules/.cache/merfy-checks/file-hash.json') } = {}) {
  const roots = [...new Set([repoRoot, realpathSync(repoRoot)])];
  let memo = {};
  try {
    const saved = JSON.parse(readFileSync(memoFile, 'utf-8'));
    if (saved.__version === MEMO_VERSION) memo = saved;
  } catch {
    /* первый прогон в этом дереве */
  }
  memo.__version = MEMO_VERSION;
  let dirty = false;

  const fileHash = (rel, abs, st) => {
    const sig = `${st.mtimeMs}:${st.ctimeMs}:${st.size}:${st.ino}`;
    const known = memo[rel];
    if (known?.sig === sig && Date.now() - st.mtimeMs > RECENT_MS) return known.h;
    const h = sha1(normalized(rel, readFileSync(abs), roots));
    memo[rel] = { sig, h };
    dirty = true;
    return h;
  };

  /** Отпечаток пути относительно корня репозитория. */
  function hashPath(rel) {
    const abs = resolve(repoRoot, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      return 'absent';
    }
    try {
      return st.isDirectory() ? `dir:${sha1(readdirSync(abs).sort().join('\n'))}` : fileHash(rel, abs, st);
    } catch {
      return 'unreadable';
    }
  }

  function save() {
    if (!dirty) return;
    mkdirSync(dirname(memoFile), { recursive: true });
    writeFileSync(memoFile, JSON.stringify(memo));
    dirty = false;
  }

  return { hashPath, save };
}

/** Один отпечаток на набор путей (порядок не важен). */
export function hashOf(hasher, rels) {
  return sha1([...new Set(rels)].sort().map((r) => `${r}\0${hasher.hashPath(r)}`).join('\n'));
}
