import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineSection } from '../src/core/define';
import type { Ctx, El, ReadableStore, SectionEntry } from '../src/core/types';

// Договор секции (design.md блока 5, разделы 3.1–3.3). Проверки типов работают в pnpm typecheck: ошибка типа — красный
// typecheck, а не красный тест.
describe('договор секции', () => {
  it('defineSection — тождество: отдаёт то же определение', () => {
    const definition = { mount: (): void => undefined };
    expect(defineSection(definition)).toBe(definition);
  });

  it('стор для секции — только get(): подписка — только ctx.watch', () => {
    expectTypeOf<keyof ReadableStore<number>>().toEqualTypeOf<'get'>();
  });

  it('модули в ctx — по uses: модуля вне uses в типе ctx нет', () => {
    expectTypeOf<Ctx<{ coat: string }, 'cart'>>().toHaveProperty('cart');
    expectTypeOf<Ctx<{ coat: string }, 'cart'>>().not.toHaveProperty('favorites');
  });

  it('у обёртки элемента нет узла страницы', () => {
    expectTypeOf<El>().not.toHaveProperty('node');
    expectTypeOf<El>().not.toHaveProperty('element');
  });

  it('определение с любым State и uses входит в список секций бандла', () => {
    const scarf = defineSection<{ coat: string }, 'cart'>({
      mount(_el, ctx) {
        ctx.state.coat = 'grey';
      },
      actions: {
        pick: (target, ctx) => {
          ctx.state.coat = target.attr('data-coat') ?? 'grey';
        },
      },
    });
    const entry: SectionEntry = {
      name: 'shop:scarf-match',
      kind: 'section',
      script: 'a'.repeat(64),
      uses: ['cart'],
      definition: scarf,
    };
    expect(entry.definition).toBe(scarf);
  });
});
