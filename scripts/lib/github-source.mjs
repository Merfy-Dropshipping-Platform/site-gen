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
//
// BLOCK_FILE_ALIASES — для блоков чьё имя в base-репо отличается от github темы.
// Например `PopularProducts` (имя блока в base) живёт в rose-theme как `Popular.astro`.
const BLOCK_FILE_ALIASES = {
  PopularProducts: ['Popular'],
};

// SUB_COMPONENTS — компоненты внутри блока, которые нужно сразу инлайнить
// в кэшированный источник (иначе AST не видит атрибуты карточек/sub-разметки).
// Для PopularProducts rose использует `<RoseProductCard product={...} />` —
// инлайним его раскрытый markup поверх компонента в кэше, чтобы парсер
// каталога видел `<article>`, `<img>`, badge, title, price и т.д.
const SUB_COMPONENTS = {
  PopularProducts: {
    rose: [
      {
        // Имя в JSX (компонент темы)
        componentName: 'RoseProductCard',
        // Путь на github для скачивания
        candidatePaths: [
          'src/components/products/RoseProductCard.astro',
          'src/components/RoseProductCard.astro',
        ],
      },
    ],
  },
};

function candidatePaths(block) {
  const aliases = BLOCK_FILE_ALIASES[block] || [];
  const allNames = [block, ...aliases];
  const out = [];
  for (const name of allNames) {
    out.push(`src/components/${name}.astro`);
    out.push(`src/components/sections/${name}.astro`);
    out.push(`src/components/${name.toLowerCase()}/${name}.astro`);
  }
  return out;
}

/**
 * Извлечь только разметку внутри корневого элемента <article|div|section>
 * sub-компонента — без обёртки frontmatter и <style>. Используется чтобы
 * инлайнить sub-component в исходник секции.
 */
function extractSubComponentBody(astroSource) {
  // 1) убираем frontmatter `---...---`
  const noFront = astroSource.replace(/^---[\s\S]*?---\s*/m, '');
  // 2) убираем <style>...</style>
  return noFront.replace(/<style[\s\S]*?<\/style>/gi, '').trim();
}

/**
 * Заменить теги вида <CompName ... /> и <CompName ...>...</CompName>
 * на raw markup sub-component'а. Атрибуты не переносим — нам важна
 * иерархия и классы для парсера каталога.
 */
function inlineSubComponent(sectionSource, componentName, subMarkup) {
  // Self-closing: <RoseProductCard product={p} />
  const selfClosing = new RegExp(`<${componentName}\\b[^>]*\\/>`, 'g');
  // Open + close: <RoseProductCard ...>...</RoseProductCard>
  const openClose = new RegExp(`<${componentName}\\b[^>]*>[\\s\\S]*?<\\/${componentName}>`, 'g');
  let out = sectionSource.replace(selfClosing, subMarkup);
  out = out.replace(openClose, subMarkup);
  return out;
}

async function fetchSubComponents({ owner, theme, block, sectionSource }) {
  const subs = SUB_COMPONENTS[block]?.[theme];
  if (!subs || subs.length === 0) return sectionSource;
  let merged = sectionSource;
  for (const sub of subs) {
    let subSource = null;
    for (const subPath of sub.candidatePaths) {
      const result = await _fetcher({ owner, repo: `${theme}-theme`, file: subPath });
      if (result.ok) {
        subSource = result.body;
        break;
      }
    }
    if (!subSource) continue;
    const body = extractSubComponentBody(subSource);
    merged = inlineSubComponent(merged, sub.componentName, body);
  }
  return merged;
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
      // Если блок имеет sub-component (см. SUB_COMPONENTS) — инлайним его
      // в кэшируемый источник, чтобы парсер каталога видел разметку карточек,
      // не только JSX-теги верхнего уровня.
      const mergedSource = await fetchSubComponents({
        owner,
        theme,
        block,
        sectionSource: result.body,
      });
      await fs.mkdir(sourcesDir, { recursive: true });
      await fs.writeFile(cacheFile, mergedSource, 'utf-8');
      await fs.writeFile(
        metaFile,
        JSON.stringify({ fetchedAt, sourceUrl, theme, block }, null, 2),
        'utf-8',
      );
      return { source: mergedSource, fetchedAt, cached: false, sourceUrl };
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
