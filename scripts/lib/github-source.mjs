// Источник стилей из приватных репозиториев `Merfy-Dropshipping-Platform/<тема>-theme`
// через `gh api`. Кэшируется в packages/theme-contract/tokens/sources/.
//
// Один модуль вынесен ради тестируемости: тесты подсовывают свой `fetcher`
// через DI (см. `_internals.setFetcher` ниже) чтобы не дёргать настоящий gh.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let _fetcher = realGhFetch;

export function _setFetcher(fn) { _fetcher = fn; }
export function _resetFetcher() { _fetcher = realGhFetch; }

async function realGhFetch({ owner, repo, file, ref }) {
  const refPart = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const apiPath = `repos/${owner}/${repo}/contents/${file}${refPart}`;
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.raw', apiPath],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return { ok: true, body: stdout };
  } catch (err) {
    const stderr = (err && err.stderr) ? String(err.stderr) : String(err.message || err);
    if (stderr.includes('Not Found') || stderr.includes('404')) {
      return { ok: false, status: 404, error: stderr };
    }
    return { ok: false, status: 500, error: stderr };
  }
}

// Возможные относительные пути для одного блока в репо темы.
// rose-theme/main кладёт `Hero` в `src/components/sections/Hero.astro`, тогда как
// `Header` лежит в `src/components/Header.astro`. Пробуем варианты по порядку.
function candidatePaths(block) {
  return [
    `src/components/${block}.astro`,
    `src/components/sections/${block}.astro`,
    `src/components/${block.toLowerCase()}/${block}.astro`,
  ];
}

/**
 * Получить файл темы из github (или из кэша).
 * @param {object} opts
 * @param {string} opts.theme — `rose`, `flux`, `satin`, и т.д.
 * @param {string} opts.block — `Header`, `Footer` и т.д. (имя файла без `.astro`)
 * @param {string} opts.sourcesDir — куда сохранять кэш
 * @param {boolean} [opts.refresh=false] — игнорировать кэш и перекачать
 * @param {string} [opts.owner='Merfy-Dropshipping-Platform']
 * @returns {Promise<{ source: string, fetchedAt: string, cached: boolean, sourceUrl: string }>}
 */
export async function getThemeSource({
  theme,
  block,
  sourcesDir,
  refresh = false,
  owner = 'Merfy-Dropshipping-Platform',
}) {
  const cacheFile = path.join(sourcesDir, `${theme}-${block}.astro`);
  const metaFile = path.join(sourcesDir, `${theme}-${block}.meta.json`);

  if (!refresh) {
    try {
      const [cached, metaRaw] = await Promise.all([
        fs.readFile(cacheFile, 'utf-8'),
        fs.readFile(metaFile, 'utf-8').catch(() => '{}'),
      ]);
      const meta = JSON.parse(metaRaw || '{}');
      return {
        source: cached,
        fetchedAt: meta.fetchedAt || 'unknown',
        cached: true,
        sourceUrl: meta.sourceUrl ||
          `github://${owner}/${theme}-theme@main:src/components/${block}.astro`,
      };
    } catch {
      /* fall through to fetch */
    }
  }

  const candidates = candidatePaths(block);
  let lastError = '';
  for (const filePath of candidates) {
    const result = await _fetcher({
      owner,
      repo: `${theme}-theme`,
      file: filePath,
    });
    if (result.ok) {
      const sourceUrl = `github://${owner}/${theme}-theme@main:${filePath}`;
      const fetchedAt = new Date().toISOString();
      await fs.mkdir(sourcesDir, { recursive: true });
      await fs.writeFile(cacheFile, result.body, 'utf-8');
      await fs.writeFile(
        metaFile,
        JSON.stringify({ fetchedAt, sourceUrl, theme, block }, null, 2),
        'utf-8',
      );
      return { source: result.body, fetchedAt, cached: false, sourceUrl };
    }
    if (result.status === 404) {
      lastError = result.error;
      continue;
    }
    throw new Error(
      `Не удалось получить ${block} из ${owner}/${theme}-theme: ${result.error}`,
    );
  }
  throw new Error(
    `Файл блока ${block} не найден в репо ${owner}/${theme}-theme. ` +
    `Пробовали:\n  ${candidates.join('\n  ')}\n` +
    `Проверь что:\n` +
    `  1) Блок реально есть в репо темы\n` +
    `  2) Имя файла совпадает (регистр важен)\n` +
    `  3) У тебя есть доступ: gh auth status\n` +
    `Ошибка gh: ${lastError}`,
  );
}
