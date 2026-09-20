import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';

/**
 * Баг тестера #2 из таблицы (18.09): «„Мультиколонны“ → „Ссылка“ у кнопки
 * секции: href кнопки всегда /catalog».
 *
 * Механизм общий, а не «одна кнопка». Поле панели объявлено как
 * `{ type: 'pagePicker' }`, а пикер сохраняет ОБЪЕКТ `{ href, text }` — так он
 * устроен и так же ведёт себя стартовый контент. Если схема блока требует
 * строку (`z.string()`), zod при разборе ОТБРАСЫВАЕТ поле целиком: до рендера
 * значение не доходит, и блок падает на свой фолбэк — в «Мультиколоннах» это
 * как раз `/catalog`.
 *
 * Прецедент уже был: в `Hero.puckConfig.ts` кнопки описаны
 * `z.union([z.string(), z.object({ href: z.string() })])`, и рядом стоит
 * комментарий «при строгом schema=string primaryButton дропался при safeParse →
 * кнопка пропадала». Там это починили точечно; гард распространяет правило на
 * все поля-пикеры разом.
 */
const BLOCKS_DIR = join(__dirname, '..', 'blocks');

function configs(): Array<{ block: string; src: string }> {
  return readdirSync(BLOCKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ block: e.name, file: join(BLOCKS_DIR, e.name, `${e.name}.puckConfig.ts`) }))
    .filter((e) => {
      try { readFileSync(e.file); return true; } catch { return false; }
    })
    .map((e) => ({ block: e.block, src: readFileSync(e.file, 'utf8') }));
}

/** Поля, объявленные в панели как pagePicker. */
function pickerFields(src: string): string[] {
  return [...src.matchAll(/(\w+):\s*\{\s*type:\s*'pagePicker'/g)].map((m) => m[1]);
}

/**
 * Поле объявлено схемой «только строка»?
 *
 * Считаем по каждому объявлению `field: z…`, схлопнув пробелы (объявление
 * бывает многострочным — на этом гард однажды пропустил подсунутый обратно
 * `z.string()`). Нарушение — объявление, в котором нет `union`: значит
 * объектная форма из пикера будет отброшена. Вхождения `href: z.string()`
 * ВНУТРИ самого union — это описание объектной формы, не нарушение.
 */
function hasStringOnlySchema(src: string, field: string): boolean {
  const flat = src.replace(/\s+/g, ' ');
  const re = new RegExp(`\\b${field}: z\\s*\\.[^;]{0,200}`, 'g');
  for (const m of flat.matchAll(re)) {
    const decl = m[0];
    if (decl.startsWith(`${field}: z .union`) || decl.startsWith(`${field}: z.union`)) continue;
    if (/^\w+: z\s*\.string\(\)/.test(decl)) return true;
  }
  return false;
}

describe('поле «Ссылка» доезжает до витрины', () => {
  const all = configs();

  it('в панели есть поля-пикеры (иначе гард сторожит пустоту)', () => {
    const total = all.reduce((n, c) => n + pickerFields(c.src).length, 0);
    expect(total).toBeGreaterThan(5);
  });

  it('ни одно поле-пикер не описано схемой «только строка»', () => {
    const broken: string[] = [];
    for (const { block, src } of all) {
      for (const field of pickerFields(src)) {
        if (hasStringOnlySchema(src, field)) broken.push(`${block}.${field}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

/**
 * Резолвер проверяем по исходнику, а не импортом: `MultiColumns.puckConfig.ts`
 * не типизируется под zod v4 (`ZodTypeDef` там больше не экспортируется) — это
 * предсуществующая поломка, из-за неё падают 32 проверки и на чистом main.
 * Импорт утянул бы гард в ту же яму и он не запускался бы вовсе.
 */
describe('ссылка кнопки секции «Мультиколонны» читается в обеих формах', () => {
  const src = readFileSync(
    join(BLOCKS_DIR, 'MultiColumns', 'MultiColumns.puckConfig.ts'),
    'utf8',
  );
  const resolver = src.slice(
    src.indexOf('export function resolveMultiColumnsSectionLink'),
    src.indexOf('export function getVisibleMultiColumns'),
  );

  it('строковая форма обоих полей', () => {
    expect(resolver).toMatch(/typeof raw\.buttonLink === 'string'/);
    expect(resolver).toMatch(/typeof raw\.link === 'string'/);
  });

  it('объектная форма обоих полей — то, что теряли', () => {
    expect(resolver).toMatch(/isRecord\(raw\.buttonLink\)[\s\S]{0,120}raw\.buttonLink\.href/);
    expect(resolver).toMatch(/isRecord\(raw\.link\)[\s\S]{0,120}raw\.link\.href/);
  });
});

/**
 * Живой путь: секцию рисует порт темы, а не общий блок — на этом в этой же
 * пачке уже попадался каталог. Поэтому проверяем сами порты.
 */
describe('порты тем читают объектную форму ссылки', () => {
  const THEMES = ['rose', 'flux', 'bloom', 'satin', 'vanilla'];

  it.each(THEMES)('%s: кнопка секции «Мультиколонны»', (theme) => {
    const p = join(__dirname, '..', '..', '..', 'themes', theme, 'src', 'components', 'sections', 'MultiColumns.astro');
    let src: string;
    try { src = readFileSync(p, 'utf8'); } catch { return; }
    const decl = src.slice(src.indexOf('const btnHref ='), src.indexOf('const btnHref =') + 700);
    expect(decl).toMatch(/buttonLink[\s\S]{0,160}"object"/);
    expect(decl).toMatch(/\.href/);
  });
});
