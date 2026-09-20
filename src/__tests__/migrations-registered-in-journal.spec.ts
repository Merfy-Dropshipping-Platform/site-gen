/**
 * Каждый файл миграции обязан быть записан в журнале drizzle.
 *
 * Авария 20.09. В main приехал `drizzle/0016_site_theme_applied_at.sql`
 * (колонка `site.theme_applied_at`), а записи о нём в
 * `drizzle/meta/_journal.json` не было: последняя запись — idx 15. Контейнер
 * стартует как `node dist/src/db/manual-migrate.js && node dist/src/main.js`, а
 * `manual-migrate` зовёт drizzle-`migrate()`, который выполняет ТОЛЬКО то, что
 * перечислено в журнале. Файл не выполнился, колонки в проде не появилось — и
 * каждый UPDATE, который её пишет, начал падать.
 *
 * Бьёт по смене темы: `sites.service` пишет `themeAppliedAt` ровно тогда, когда
 * меняется `themeId`. Мерчант жал «Выбрать тему» и получал на экран сырой SQL,
 * а тема не менялась. `PATCH {name}` при этом работал — колонка в нём не
 * участвует.
 *
 * Почему обычные проверки этого не ловят. Схема в коде (`db/schema.ts`) и файл
 * миграции были согласованы между собой, тесты вокруг фичи зелёные, CI зелёный:
 * рассогласование жило между файлом и ЖУРНАЛОМ, а журнал никто не читал. Это
 * отдельный класс — «код готов, а до базы он не доехал».
 *
 * Здесь сверяются два списка: `drizzle/*.sql` на диске и теги в журнале. Тест
 * дешёвый и не требует ни базы, ни сборки — он должен оставаться таким, чтобы
 * его нельзя было отключить «ради скорости».
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DRIZZLE = resolve(__dirname, '..', '..', 'drizzle');

type Journal = {
  entries: { idx: number; tag: string; when: number }[];
};

const journal = (): Journal =>
  JSON.parse(readFileSync(resolve(DRIZZLE, 'meta', '_journal.json'), 'utf-8')) as Journal;

/** Имена sql-файлов без расширения — ровно в том виде, в каком журнал их зовёт «tag». */
const sqlTags = (): string[] =>
  readdirSync(DRIZZLE)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();

describe('миграции зарегистрированы в журнале drizzle', () => {
  it('ОПОРА: файлы миграций и журнал вообще читаются', () => {
    // Без этого оба сравнения ниже зеленели бы на пустых списках.
    expect(sqlTags().length).toBeGreaterThan(10);
    expect(journal().entries.length).toBeGreaterThan(10);
  });

  it('у каждого .sql есть запись в _journal.json', () => {
    const registered = new Set(journal().entries.map((e) => e.tag));
    const missing = sqlTags().filter((tag) => !registered.has(tag));
    // Именно это и случилось с 0016: файл в репозитории есть, в журнале нет,
    // значит на проде он не выполнится НИКОГДА.
    expect(missing).toEqual([]);
  });

  it('в журнале нет записей без файла', () => {
    const files = new Set(sqlTags());
    const orphaned = journal().entries.map((e) => e.tag).filter((tag) => !files.has(tag));
    // Обратная сторона: запись есть, файла нет — миграция упадёт при старте
    // контейнера, и сервис не поднимется вообще.
    expect(orphaned).toEqual([]);
  });

  it('порядок журнала строгий: idx и when только растут', () => {
    const entries = journal().entries;
    const idx = entries.map((e) => e.idx);
    const when = entries.map((e) => e.when);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(when).toEqual([...when].sort((a, b) => a - b));
    expect(new Set(idx).size).toBe(idx.length);
  });
});
