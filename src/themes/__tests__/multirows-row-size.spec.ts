/**
 * «Размер» ряда в «Мультирядах» применяется всегда — даже когда все ряды
 * выставлены одинаково и когда ряд в секции один.
 *
 * Откуда задача. Владелец, 20.09, три строки подряд: «При размере у рядов
 * средний, сбрасываются до маленьких», «При размерах в рядах большой, они
 * становятся размерами маленькие», «При размерах в рядах средний, они
 * становятся размерами маленькие».
 *
 * ЗАМЕР ДО (живой стенд Bloom Pilot, `POST /preview/block`, 20.09):
 *   секция small + ряды [small,small]    → aspect-[16/9]      aspect-[16/9]
 *   секция small + ряды [medium,medium]  → aspect-[16/9]      aspect-[16/9]   ← БАГ
 *   секция small + ряды [large,large]    → aspect-[16/9]      aspect-[16/9]   ← БАГ
 *   секция small + ряды [medium,small]   → aspect-[652/594]   aspect-[16/9]   ← верно
 *   секция small + ОДИН ряд [large]      → aspect-[16/9]                      ← БАГ
 * (bloom: small = 16/9, medium = 652/594, large = square)
 *
 * ПРИЧИНА. 18–19.09 «Высота» секции не работала: у каждого ряда в сиде лежит
 * свой `size`, и он безусловно перебивал секционный. Чинили эвристикой
 * `perRowSizesDiffer` — «размеры у всех рядов одинаковы ≡ мерчант их не
 * выбирал, значит правит секция». Эвристика вылечила одну сторону монеты и
 * сломала другую: мерчант доводит выбор до ПОСЛЕДНЕГО ряда, размеры снова
 * совпадают, признак гаснет — и весь выбор отменяется. А у секции с одним
 * рядом `.some(s => s !== rowSizes[0])` ложен по определению, поэтому там
 * per-row размер не работал ни дня.
 *
 * РЕШЕНИЕ. Угадывать намерение по данным нельзя — обе стороны монеты уже
 * приходили жалобами. Поэтому намерение фиксируется ЯВНО: рендер снова читает
 * `r.size ?? p.size` (ряд главнее, секция — фолбэк), а секционная «Высота»
 * при изменении прописывается конструктором во ВСЕ ряды
 * (`CustomFieldsPanel.updateProp`, гард `multirows-section-height-writes-rows`
 * в конструкторе). Так живы обе настройки и ничего не угадывается.
 *
 * ПОЧЕМУ ТЕСТ РЕНДЕРИТ, А НЕ ЧИТАЕТ ИСХОДНИК. Прежний гард сверял текст порта
 * с регуляркой — и был зелёным всё то время, пока мерчант видел баг: текст
 * соответствовал требованию, неверным было само требование. Здесь секция
 * рендерится ТЕМ ЖЕ скомпилированным модулем, что уходит на витрину и в превью
 * (`dist/theme-sections/<тема>`), живой цепочкой (`live: true`), и проверяется
 * РЕЗУЛЬТАТ — класс аспекта у каждого ряда.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'bloom', 'satin', 'flux', 'vanilla'] as const;
type Theme = (typeof THEMES)[number];

type Job = { block: string; props: Record<string, unknown>; live: true };
type Row = { block: string; html?: string; error?: string; missing?: boolean };

const row = (size?: string) => ({
  id: `row-${size ?? 'none'}`,
  title: 'Ряд',
  description: 'Текст ряда',
  image: '/images/x.jpg',
  ...(size === undefined ? {} : { size }),
});

const job = (props: Record<string, unknown>): Job => ({
  block: 'MultiRows',
  props: { id: 'MultiRows-1', ...props },
  live: true,
});

/**
 * Порядок ВАЖЕН: первые три — контрольные замеры «как выглядит small / medium /
 * large», по ним тест узнаёт классы аспекта конкретной темы и не зашивает их
 * числами (у пяти тем они разные, а у satin ещё и свой puckConfig).
 */
const JOBS: Job[] = [
  job({ rows: [row('small')] }), // 0 — контроль small
  job({ rows: [row('medium')] }), // 1 — контроль medium
  job({ rows: [row('large')] }), // 2 — контроль large
  job({ size: 'small', rows: [row('medium'), row('medium')] }), // 3 — жалоба владельца
  job({ size: 'small', rows: [row('large'), row('large')] }), // 4 — жалоба владельца
  job({ size: 'small', rows: [row('large')] }), // 5 — секция с ОДНИМ рядом
  job({ size: 'small', rows: [row('medium'), row('small')] }), // 6 — ряды разошлись
  job({ size: 'large', rows: [row(), row()] }), // 7 — секция как фолбэк
];

/**
 * Классы аспекта в порядке появления.
 *
 * НЕ «по одному на ряд»: у satin маленький размер — это ПАРА классов
 * (`aspect-square md:aspect-[652/360]`, литерал compact-варианта About), потому
 * что тема переключает пропорцию на средней ширине. Поэтому ряды сравниваются
 * не поштучно, а списком: ожидание строится склейкой контрольных замеров.
 */
const aspects = (html: string | undefined): string[] =>
  (html ?? '').match(/aspect-(?:square|\[[^\]\s"]+\])/g) ?? [];

const built = (theme: Theme) =>
  existsSync(resolve(SITES_ROOT, 'dist', 'theme-sections', theme, 'manifest.json'));

describe.each(THEMES)('«Мультиряды»: размер ряда — %s', (theme) => {
  const isBuilt = built(theme);
  let rendered: Row[] = [];

  beforeAll(() => {
    if (!isBuilt) return;
    const raw = execFileSync('node', [RENDERER, theme, JSON.stringify(JOBS)], {
      cwd: SITES_ROOT,
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
    });
    rendered = JSON.parse(raw) as Row[];
  }, 300_000);

  it('секции темы собраны — иначе проверки ниже ничего не сторожат', () => {
    // Без этой опоры непостроенный dist давал бы «зелёный» файл из пустых
    // проверок — ровно тот случай, когда «Tests: 0 total» читается как успех.
    expect(isBuilt).toBe(true);
  });

  it('три размера ряда дают три РАЗНЫХ аспекта (опора всех проверок ниже)', () => {
    if (!isBuilt) return;
    const [small, medium, large] = [0, 1, 2].map((i) => aspects(rendered[i].html).join(' '));
    expect(rendered[0].error).toBeUndefined();
    expect(small).toBeTruthy();
    // Если размер ряда перестанет применяться вовсе, все три станут одинаковыми
    // и проверки ниже потеряют смысл — пусть падает здесь.
    expect(new Set([small, medium, large]).size).toBe(3);
  });

  it('все ряды «Средний» остаются средними, а не падают на секционный «Маленький»', () => {
    if (!isBuilt) return;
    const medium = aspects(rendered[1].html);
    expect(aspects(rendered[3].html)).toEqual([...medium, ...medium]);
  });

  it('все ряды «Большой» остаются большими', () => {
    if (!isBuilt) return;
    const large = aspects(rendered[2].html);
    expect(aspects(rendered[4].html)).toEqual([...large, ...large]);
  });

  it('секция с ОДНИМ рядом слушается размера этого ряда', () => {
    if (!isBuilt) return;
    // `.some(s => s !== rowSizes[0])` на массиве из одного элемента ложен
    // всегда — в такой секции per-row размер не работал никогда.
    const large = aspects(rendered[2].html);
    expect(aspects(rendered[5].html)).toEqual(large);
  });

  it('разные размеры у рядов по-прежнему работают порядно', () => {
    if (!isBuilt) return;
    const medium = aspects(rendered[1].html);
    const small = aspects(rendered[0].html);
    expect(aspects(rendered[6].html)).toEqual([...medium, ...small]);
  });

  it('ряд без своего размера берёт высоту у секции', () => {
    if (!isBuilt) return;
    // Секционная «Высота» остаётся фолбэком — она не декоративная. Мерчанту
    // она видна ещё и потому, что конструктор при её изменении прописывает
    // значение во все ряды.
    const large = aspects(rendered[2].html);
    expect(aspects(rendered[7].html)).toEqual([...large, ...large]);
  });
});
