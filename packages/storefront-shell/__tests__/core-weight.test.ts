// @vitest-environment node
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { parseCoreParts } from '../build/core-parts';
import coreParts from '../core-parts.json';

// Ядро — только то, что нужно каждой странице (блок 15 «Секций и SDK», часть 15ж, Р15ж-1, Р15ж-7): в бандле страницы без
// секций нет запроса кода, входа, выхода, профиля и их текстов — они в части auth, её приносит объявление секции. Бандл
// собирается, как pageBundleBytes (build/core.ts), в UTF-8 — тексты ищутся как есть. esbuild — в среде node.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const LOGIN_CODE = ['"magic/request"', '"magic/verify"', '"logout"', '"profile"', 'Неверный код', 'Код устарел', 'Проверьте e-mail'];

async function pageWithoutSections(parts: readonly string[]): Promise<string> {
  const entry = JSON.stringify(join(PACKAGE_DIR, 'src/core/index.ts'));
  const contents = `import { start, ${parts.join(', ')} } from ${entry};\nstart({ parts: [${parts.join(', ')}], sections: [] });`;
  const result = await build({
    stdin: { contents, resolveDir: PACKAGE_DIR, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
    charset: 'utf8',
  });
  return result.outputFiles.map((file) => file.text).join('');
}

describe('ядро без кода входа', () => {
  it('core-parts.json: customer в ядре, auth — нет', () => {
    const core = parseCoreParts(coreParts);
    expect(core).toContain('customer');
    expect(core).not.toContain('auth');
  });

  it('бандл страницы без секций: чтение me есть; запроса кода, входа, выхода, профиля и текстов входа нет', async () => {
    const text = await pageWithoutSections(parseCoreParts(coreParts));
    expect(text).toContain('/store/auth/me');
    for (const piece of LOGIN_CODE) expect(text, piece).not.toContain(piece);
  });

  it('страница с частью auth — код входа в бандле (проверка самого теста)', async () => {
    const text = await pageWithoutSections([...parseCoreParts(coreParts), 'auth']);
    for (const piece of LOGIN_CODE) expect(text, piece).toContain(piece);
  });
});
