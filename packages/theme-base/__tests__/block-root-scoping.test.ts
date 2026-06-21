/**
 * Spec 102 — guard: block root self-scoping.
 *
 * Инвариант: ни один блок не ищет свой корень/элементы через document-level
 * запросы (document.querySelector / querySelectorAll / getElementById). Это
 * first-match, который при 2+ одинаковых секциях оживляет только первую.
 * Канон — общий примитив window.__merfyRoot(blockId) + root.querySelector(...).
 *
 * Гард делает корректность ПОСТОЯННОЙ: новый/изменённый блок, вернувший
 * document-level поиск, роняет тест с указанием файла и строки.
 *
 * Escape-hatch: строка с комментарием `// merfy-root-allow` исключается
 * (для редких легитимных кросс-секционных случаев). По умолчанию не используется.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const BLOCKS_DIR = join(__dirname, '..', 'blocks');

// document-level поиск элементов = анти-паттерн (Spec 102).
const FORBIDDEN = /document\.(querySelector|querySelectorAll|getElementById)\s*\(/;

function astroFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...astroFiles(full));
    else if (name.endsWith('.astro')) out.push(full);
  }
  return out;
}

/** Тела всех <script>…</script> в исходнике блока. */
function scriptBodies(src: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

describe('Spec 102 — block root self-scoping guard', () => {
  const files = astroFiles(BLOCKS_DIR);

  it('обнаруживает блоки (.astro)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const rel = file.slice(file.indexOf('/blocks/') + 1);
    it(`${rel} — корень через window.__merfyRoot, без document-level поиска`, () => {
      const src = readFileSync(file, 'utf8');
      const offenders: string[] = [];
      for (const body of scriptBodies(src)) {
        for (const line of body.split('\n')) {
          if (line.includes('merfy-root-allow')) continue;
          if (FORBIDDEN.test(line)) offenders.push(line.trim().slice(0, 110));
        }
      }
      if (offenders.length > 0) {
        throw new Error(
          `${rel}: document-level поиск элементов вместо window.__merfyRoot(blockId):\n` +
            offenders.map((o) => `    ${o}`).join('\n') +
            `\n  Канон: var root = window.__merfyRoot(blockId); if (!root) return; root.querySelector(...)`,
        );
      }
    });
  }
});
