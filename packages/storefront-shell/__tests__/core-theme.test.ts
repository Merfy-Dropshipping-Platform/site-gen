import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { defineSection } from '../src/core/define';
import { start, type StartedCore } from '../src/core/start';
import type { BaseCtx } from '../src/core/types';
import { configTag, entry, placeSection, watchFailures } from './core-support';

// ctx.theme (блок 9 «Секций и SDK», часть 9б; design.md блока 9, п. 16): сквозные настройки темы из theme.settings
// конфига страницы, только чтение. Есть у каждой секции и глобального скрипта; нет поля или конфига — пустой объект.
const THEME_JSON = '"theme":{"id":"nova","version":"0.0.4"}';
const SETTINGS = {
  'cart-type': 'page',
  'logo-image': 'https://minio.merfy.ru/scarves/logo.png',
  'cookie-banner-enabled': false,
} as const;

let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

beforeEach(() => {
  failures = watchFailures();
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// Конфиг страницы: settings — поле theme.settings; null — без поля, как у страницы без панели темы.
function configWith(settings: Readonly<Record<string, unknown>> | null): void {
  const tag = configTag('live');
  expect(tag).toContain(THEME_JSON);
  const theme = `"theme":{"id":"nova","version":"0.0.4","settings":${JSON.stringify(settings)}}`;
  document.head.innerHTML = settings === null ? tag : tag.replace(THEME_JSON, theme);
}

// Секции, которые запоминают свой ctx.theme при запуске.
function startReaders(names: readonly string[], kind: 'section' | 'global' = 'section'): unknown[] {
  const seen: unknown[] = [];
  const reader = defineSection({ mount: (_el, ctx) => void seen.push(ctx.theme) });
  if (kind === 'section') names.forEach((name, index) => placeSection(name, `${name.split(':')[1]}-${index}`));
  core = start({ parts: [], sections: names.map((name) => entry(name, reader, { kind })) });
  return seen;
}

describe('ctx.theme', () => {
  it('значения — из theme.settings конфига; у секций страницы один и тот же объект', () => {
    configWith(SETTINGS);
    const seen = startReaders(['shop:cart-badge', 'shop:header']);
    expect(seen).toEqual([SETTINGS, SETTINGS]);
    expect(seen[0]).toBe(seen[1]);
    expect(failures.details).toEqual([]);
  });

  it('только чтение: объект заморожен, запись не меняет значение', () => {
    configWith(SETTINGS);
    const values: unknown[] = [];
    const writer = defineSection({
      mount(_el, ctx) {
        values.push(Object.isFrozen(ctx.theme), ctx.theme['cart-type']);
        values.push(Reflect.set(ctx.theme, 'cart-type', 'drawer'), ctx.theme['cart-type']);
      },
    });
    placeSection('shop:cart-badge', 'cart-badge-1');
    core = start({ parts: [], sections: [entry('shop:cart-badge', writer)] });
    expect(values).toEqual([true, 'page', false, 'page']);
  });

  it('имени нет в конфиге — undefined', () => {
    configWith({ 'cart-type': 'drawer' });
    const [theme] = startReaders(['shop:cart-badge']);
    expect(theme).toEqual({ 'cart-type': 'drawer' });
    expect(Reflect.get(Object(theme), 'logo-image')).toBeUndefined();
  });

  it('нет theme.settings — пустой замороженный объект', () => {
    configWith(null);
    const [theme] = startReaders(['shop:cart-badge']);
    expect(theme).toEqual({});
    expect(Object.isFrozen(theme)).toBe(true);
  });

  it('нет конфига на странице — пустой объект, секция запускается', () => {
    const [theme] = startReaders(['shop:cart-badge']);
    expect(theme).toEqual({});
    expect(failures.consoleError).toHaveBeenCalled();
  });

  it('глобальный скрипт получает тот же ctx.theme', () => {
    configWith(SETTINGS);
    expect(startReaders(['shop:cookie-banner'], 'global')).toEqual([SETTINGS]);
  });

  it('тип: «Вид корзины» — drawer или page, баннер cookie — да или нет; нет значения — undefined', () => {
    expectTypeOf<BaseCtx<object>['theme']['cart-type']>().toEqualTypeOf<'drawer' | 'page' | undefined>();
    expectTypeOf<BaseCtx<object>['theme']['cookie-banner-enabled']>().toEqualTypeOf<boolean | undefined>();
  });
});
