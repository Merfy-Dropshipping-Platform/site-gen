/**
 * R4: таблица шагов миграции — проверка порядка.
 *
 * Требование: «ограничения порядка из таблицы реально
 * проверяются» — не просто лежат в `after` как необязательная документация.
 * Ниже два пласта:
 *  1. Реальная таблица (`MIGRATION_STEPS`) проходит `validateStepOrder` —
 *     ловит регресс, если кто-то переставит шаги в будущем.
 *  2. Саботаж на МИНИМАЛЬНОЙ таблице: нарочно нарушаем `after` (шаг ссылается
 *     на зависимость, которая идёт ПОСЛЕ него, или на несуществующее имя) —
 *     `validateStepOrder` обязана бросить. Без этого пласта тест 1 доказывал
 *     бы только «сегодняшний порядок правильный», а не «нарушение поймают».
 */
import {
  MIGRATION_STEPS,
  validateStepOrder,
  type MigrationStep,
} from '../table';

describe('validateStepOrder на реальной таблице', () => {
  it('MIGRATION_STEPS проходит без ошибок (документированный порядок соблюдён)', () => {
    expect(() => validateStepOrder(MIGRATION_STEPS)).not.toThrow();
  });

  it('каждое имя в MIGRATION_STEPS уникально (иначе after мог бы сослаться не на тот шаг)', () => {
    const names = MIGRATION_STEPS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('документированные пары «после» присутствуют и в правильном порядке', () => {
    const indexOf = new Map(MIGRATION_STEPS.map((s, i) => [s.name, i]));
    const REQUIRED_PAIRS: Array<[after: string, before: string]> = [
      ['materializeMultiRowsItemSize', 'materializeMultiRowsSectionSize'],
      ['clearDemoImageSections', 'materializeGalleryItems'],
      ['seedProfilePage', 'seedAccountPageSections'],
      ['storeChromeOnCheckoutResult', 'unifyHeaderWithHome'],
      ['unifyHeaderWithHome', 'unifyFooterWithHome'],
    ];
    for (const [dep, step] of REQUIRED_PAIRS) {
      expect(indexOf.get(dep)).toBeLessThan(indexOf.get(step)!);
    }
    // seedCheckoutResultPage — после ВСЕХ шагов фазы 1 (pagesData); storeChromeOnCheckoutResult
    // — после ВСЕХ шагов фазы 1 и фазы 2 (комментарии из бывшей лестницы).
    const seedCheckoutIdx = indexOf.get('seedCheckoutResultPage')!;
    const storeChromeIdx = indexOf.get('storeChromeOnCheckoutResult')!;
    const phase1Names = ['migrateCatalogPage', 'backfillVideoSizeSplit'];
    const phase2Names = ['seedProfilePage', 'seedLoginPageSection'];
    for (const n of phase1Names) expect(indexOf.get(n)).toBeLessThan(seedCheckoutIdx);
    for (const n of [...phase1Names, ...phase2Names]) expect(indexOf.get(n)).toBeLessThan(storeChromeIdx);
  });
});

describe('validateStepOrder: саботаж — нарушение ловится', () => {
  const noop = (x: Record<string, unknown>) => x;

  it('шаг идёт РАНЬШЕ своей объявленной зависимости — бросает', () => {
    const broken: MigrationStep[] = [
      { name: 'b', scope: 'pagesData', after: ['a'], run: noop }, // a должен быть раньше, но его тут нет вовсе
      { name: 'a', scope: 'pagesData', run: noop },
    ];
    expect(() => validateStepOrder(broken)).toThrow(/должен идти строго после|нет в таблице/);
  });

  it('явная перестановка местами двух шагов с реальной связью — бросает', () => {
    // То же самое нарушение, что случилось бы, переставь кто-то местами
    // materializeMultiRowsItemSize/materializeMultiRowsSectionSize в MIGRATION_STEPS.
    const swapped: MigrationStep[] = [
      { name: 'materializeMultiRowsSectionSize', scope: 'pagesData', after: ['materializeMultiRowsItemSize'], run: noop },
      { name: 'materializeMultiRowsItemSize', scope: 'pagesData', run: noop },
    ];
    expect(() => validateStepOrder(swapped)).toThrow(/materializeMultiRowsSectionSize.*materializeMultiRowsItemSize/s);
  });

  it('зависимость ссылается на несуществующее имя шага — бросает', () => {
    const dangling: MigrationStep[] = [
      { name: 'onlyStep', scope: 'pagesData', after: ['ghostStep'], run: noop },
    ];
    expect(() => validateStepOrder(dangling)).toThrow(/такого шага нет в таблице/);
  });

  it('шаг «после самого себя» — бросает (вырожденный случай цикла)', () => {
    const selfDep: MigrationStep[] = [
      { name: 'x', scope: 'pagesData', after: ['x'], run: noop },
    ];
    expect(() => validateStepOrder(selfDep)).toThrow(/должен идти строго после/);
  });

  it('корректный порядок с реальной связью НЕ бросает (контроль — саботаж-тест не ловит всё подряд)', () => {
    const ok: MigrationStep[] = [
      { name: 'materializeMultiRowsItemSize', scope: 'pagesData', run: noop },
      { name: 'materializeMultiRowsSectionSize', scope: 'pagesData', after: ['materializeMultiRowsItemSize'], run: noop },
    ];
    expect(() => validateStepOrder(ok)).not.toThrow();
  });
});
