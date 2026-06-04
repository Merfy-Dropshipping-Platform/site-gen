// Тесты получения источника из github (с моком fetcher)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { getThemeSource, _setFetcher, _resetFetcher } from '../lib/github-source.mjs';

async function tmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'gh-src-test-'));
}

test('github-source: качает файл при отсутствии кэша', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async ({ owner, repo, file }) => {
    assert.equal(owner, 'Merfy-Dropshipping-Platform');
    assert.equal(repo, 'rose-theme');
    assert.equal(file, 'src/components/Header.astro');
    return { ok: true, body: '<header>test</header>' };
  });

  const result = await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });
  assert.equal(result.cached, false);
  assert.equal(result.source, '<header>test</header>');
  assert.ok(result.fetchedAt);
});

test('github-source: использует кэш при повторном вызове', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  let calls = 0;
  _setFetcher(async () => { calls++; return { ok: true, body: 'first' }; });

  await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });
  const r2 = await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });

  assert.equal(calls, 1, 'fetcher должен быть вызван только 1 раз');
  assert.equal(r2.cached, true);
  assert.equal(r2.source, 'first');
});

test('github-source: --refresh-source игнорирует кэш', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  let calls = 0;
  _setFetcher(async () => { calls++; return { ok: true, body: `body-${calls}` }; });

  await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });
  const r2 = await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir, refresh: true });

  assert.equal(calls, 2);
  assert.equal(r2.cached, false);
  assert.equal(r2.source, 'body-2');
});

test('github-source: 404 → понятная ошибка', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async () => ({ ok: false, status: 404, error: 'Not Found' }));

  await assert.rejects(
    () => getThemeSource({ theme: 'flux', block: 'Mystery', sourcesDir: dir }),
    /не найден в репо/,
  );
});

test('github-source: 500 → ошибка с stderr', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async () => ({ ok: false, status: 500, error: 'network down' }));

  await assert.rejects(
    () => getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir }),
    /Не удалось получить/,
  );
});

test('github-source: сохраняет meta.json с fetchedAt', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async () => ({ ok: true, body: 'abc' }));

  await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });
  const metaContents = await fs.readFile(path.join(dir, 'rose-Header.meta.json'), 'utf-8');
  const meta = JSON.parse(metaContents);
  assert.ok(meta.fetchedAt);
  assert.equal(meta.theme, 'rose');
  assert.equal(meta.block, 'Header');
});

test('github-source: сохраняет файл с правильным именем', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async () => ({ ok: true, body: 'content' }));

  await getThemeSource({ theme: 'flux', block: 'Footer', sourcesDir: dir });
  const contents = await fs.readFile(path.join(dir, 'flux-Footer.astro'), 'utf-8');
  assert.equal(contents, 'content');
});

test('github-source: sourceUrl содержит owner/repo/file', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async () => ({ ok: true, body: 'X' }));

  const r = await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });
  assert.match(r.sourceUrl, /Merfy-Dropshipping-Platform\/rose-theme.*Header\.astro/);
});

test('github-source: custom owner работает', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async ({ owner }) => {
    assert.equal(owner, 'TestOrg');
    return { ok: true, body: 'X' };
  });

  await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir, owner: 'TestOrg' });
});

test('github-source: кэш не существует — fetch вызывается', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  let called = false;
  _setFetcher(async () => { called = true; return { ok: true, body: 'X' }; });
  await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });
  assert.equal(called, true);
});

test('github-source: возвращает поле source строкой', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { _resetFetcher(); await fs.rm(dir, { recursive: true, force: true }); });

  _setFetcher(async () => ({ ok: true, body: 'X' }));
  const r = await getThemeSource({ theme: 'rose', block: 'Header', sourcesDir: dir });
  assert.equal(typeof r.source, 'string');
});
