import { describe, expect, it } from 'vitest';
import { PUBLISH_RULES, publishProblems } from '../src/publish-rules';
import { HOME, SCARF, buildOf } from './manifests';

const ABOUT = { path: '/about/', entity: HOME.entity };

describe('проверка перед переключением', () => {
  it('всё на месте — проблем нет', () => {
    const { manifest } = buildOf([HOME, SCARF]);
    expect(publishProblems({ manifest, previous: buildOf([HOME, SCARF]).manifest, missing: [] }, [])).toEqual([]);
  });

  it('нет главной — home-page', () => {
    const { manifest } = buildOf([ABOUT]);
    expect(publishProblems({ manifest, previous: null, missing: [] }, [])).toEqual([
      { rule: 'home-page', text: 'нет главной страницы' },
    ]);
  });

  it('товаров было больше нуля, стало ноль — products-not-gone; служебная команда может разрешить', () => {
    const context = { manifest: buildOf([HOME]).manifest, previous: buildOf([HOME, SCARF]).manifest, missing: [] };
    expect(publishProblems(context, [])).toEqual([
      { rule: 'products-not-gone', text: 'товаров было больше нуля, а стало ноль' },
    ]);
    expect(publishProblems(context, ['products-not-gone'])).toEqual([]);
  });

  it('первая выкладка без товаров — проходит', () => {
    expect(publishProblems({ manifest: buildOf([HOME]).manifest, previous: null, missing: [] }, [])).toEqual([]);
  });

  it('не все файлы есть в хранилище — files-present; это правило разрешить нельзя', () => {
    const context = { manifest: buildOf([HOME]).manifest, previous: null, missing: [`sha256:${'a'.repeat(64)}`] };
    const problems = [{ rule: 'files-present', text: 'не все файлы манифеста есть в хранилище' }];
    expect(publishProblems(context, [])).toEqual(problems);
    expect(publishProblems(context, ['files-present'])).toEqual(problems);
  });

  it('у каждого правила — имя и текст', () => {
    expect(PUBLISH_RULES.map((rule) => rule.id)).toEqual(['files-present', 'home-page', 'products-not-gone']);
  });
});
