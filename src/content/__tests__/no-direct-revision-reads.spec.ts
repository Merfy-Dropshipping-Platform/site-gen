import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Одна дверь к содержимому ревизии — `StoreContent.load`/`.save`
 * (`content/store-content.port.ts`). Сторож ловит файлы, которые читают
 * `site_revision.data` НАПРЯМУЮ, минуя порт.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1 (сторож).
 *
 * Два сигнала прямого чтения (комментарии срезаются перед проверкой):
 *   А. литеральный `schema.siteRevision.data` — проекция `select({ data: … })`;
 *   Б. «голый» `.select()` (без проекции — отдаёт ВСЕ колонки, включая `data`)
 *      сразу перед `.from(schema.siteRevision)`.
 *
 * Оба сигнала осознанно НЕ ловят чтение ТОЛЬКО метаданных (`id`, `createdAt`,
 * `meta`, `siteId` — без `data`): `listRevisions()`/`setCurrentRevision()`
 * в sites.service.ts и «determine revisionId»/meta-запрос в build.service.ts
 * не читают контент и не обязаны идти через порт.
 *
 * Что НЕ сканируется: `src/content/**` (сам порт — его чтение и есть
 * каноническая реализация, не «второй путь») и тесты (`__tests__/`,
 * `.spec.ts`, `.test.ts` — моки БД в них не читают реальный контент).
 *
 * Что ловим НОВОЕ: файл с сигналом, которого нет в ALLOWANCES ниже, — красный.
 * Число совпадений в файле из ALLOWANCES разошлось с ожидаемым (в любую
 * сторону) — тоже красный: либо завёлся новый читатель рядом со старым,
 * либо старый убрали и запись в списке протухла — обновить нужно оба случая.
 */

const SRC_ROOT = resolve(__dirname, '..', '..');
const SKIP_DIRS = ['node_modules', '/content/', '__tests__'];

type Allowance = {
  path: string;
  /** Ожидаемое число совпадений сигнала А (литеральный schema.siteRevision.data). */
  literalData: number;
  /** Ожидаемое число совпадений сигнала Б (голый .select() перед .from(schema.siteRevision)). */
  bareSelect: number;
  reason: string;
};

/**
 * Пять файлов из брифа (`pages.service`, `page-meta`, `generator.service`,
 * `theme-preset`, `bulk`) — плюс два файла ПОРТА волны 1 (`sites.service.ts`,
 * `generator/build.service.ts`), у которых `getRevision`/`createRevision` и
 * `stageMerge` теперь идут через `storeContent.load/save`, но ОСТАЮТСЯ
 * другие, не относящиеся к волне 1 места, читающие содержимое ревизии
 * напрямую — они не в объёме этого брифа (см. причину у каждого).
 */
const ALLOWANCES: Allowance[] = [
  {
    path: 'sites.service.ts',
    literalData: 2,
    bareSelect: 1,
    reason:
      'literalData×2: update() решает, нужен ли пересев темы, по themeSettings ' +
      'ПРЕДЫДУЩЕЙ ревизии (до вызова порта, не относится к load/save) — и ' +
      'resetContentPages() (админ-сброс контент-страниц на сиды темы, отдельная ' +
      'операция вне объёма волны 1). bareSelect×1: конверт ревизии в getRevision() ' +
      '(id/meta/createdAt/createdBy) — data сразу перезаписывается loaded.document ' +
      'из порта и не читается как контент.',
  },
  {
    path: 'generator/build.service.ts',
    literalData: 1,
    bareSelect: 0,
    reason:
      'snapshot-deploy fast-path (проверка «ревизия пустая/дефолтная → можно ' +
      'отдать снэпшот темы») — отдельная функция, не stageMerge (которая теперь ' +
      'идёт через storeContent.load).',
  },
  {
    path: 'generator/generator.service.ts',
    literalData: 1,
    bareSelect: 0,
    reason: 'легаси-генератор (не в объёме волны 1) — из брифа: "generator.service".',
  },
  {
    path: 'controllers/page-meta.controller.ts',
    literalData: 1,
    bareSelect: 0,
    reason: 'из брифа: "page-meta" — свой SELECT для og:title/description по странице.',
  },
  {
    path: 'pages/pages.service.ts',
    literalData: 0,
    bareSelect: 4,
    reason: 'из брифа: "pages.service" — CRUD пользовательских страниц (create/rename/reorder/delete).',
  },
  {
    path: 'admin/bulk/bulk.service.ts',
    literalData: 0,
    bareSelect: 0,
    reason:
      'из брифа: "bulk" — экспорт CSV читает только siteId/id/createdAt ' +
      '(метаданные для счётчика ревизий), .data не читает вовсе.',
  },
  {
    path: 'modules/theme-preset/theme-preset.service.ts',
    literalData: 0,
    bareSelect: 0,
    reason: 'из брифа: "theme-preset" — только INSERT новой ревизии при theme/apply, .data не читает.',
  },
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function isTestFile(rel: string): boolean {
  return /\.(spec|test)\.ts$/.test(rel);
}

function walk(): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = resolve(dir, e);
      const rel = p.slice(SRC_ROOT.length + 1);
      if (SKIP_DIRS.some((x) => `/${rel}/`.includes(x))) continue;
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) visit(p);
      else if (rel.endsWith('.ts') && !isTestFile(rel)) out.push(rel);
    }
  };
  visit(SRC_ROOT);
  return out;
}

function countSignals(rel: string): { literalData: number; bareSelect: number } {
  const code = stripComments(readFileSync(resolve(SRC_ROOT, rel), 'utf-8'));
  const literalData = code.match(/schema\.siteRevision\.data\b/g)?.length ?? 0;
  const bareSelect =
    code.match(/\.select\(\s*\)\s*\.from\(\s*schema\.siteRevision\s*\)/g)?.length ?? 0;
  return { literalData, bareSelect };
}

const ALL_FILES = walk();
const ALLOWED_PATHS = new Set(ALLOWANCES.map((a) => a.path));

describe('одна дверь к содержимому ревизии: прямые читатели schema.siteRevision.data', () => {
  it('ОПОРА: обход видит src/ — иначе проверки ниже сторожат пустоту', () => {
    expect(ALL_FILES.length).toBeGreaterThan(100);
    expect(ALL_FILES).toContain('sites.service.ts');
    expect(ALL_FILES).toContain('pages/pages.service.ts');
  });

  it('src/content/document.adapter.ts не участвует в обходе (это порт, не второй путь)', () => {
    expect(ALL_FILES).not.toContain('content/document.adapter.ts');
  });

  it('новый прямой читатель вне белого списка — красный', () => {
    const violators = ALL_FILES.filter((rel) => {
      if (ALLOWED_PATHS.has(rel)) return false;
      const { literalData, bareSelect } = countSignals(rel);
      return literalData > 0 || bareSelect > 0;
    });
    expect(violators).toEqual([]);
  });

  it.each(ALLOWANCES.map((a) => [a.path, a] as const))(
    'запись белого списка точна: %s',
    (_path, allowance) => {
      const found = countSignals(allowance.path);
      // Расходится в любую сторону — либо завёлся сосед рядом со старым
      // читателем, либо старый убрали (запись протухла) — оба случая
      // требуют осознанного обновления ALLOWANCES, а не молчаливого дрифта.
      expect({
        path: allowance.path,
        literalData: found.literalData,
        bareSelect: found.bareSelect,
      }).toEqual({
        path: allowance.path,
        literalData: allowance.literalData,
        bareSelect: allowance.bareSelect,
      });
    },
  );
});
