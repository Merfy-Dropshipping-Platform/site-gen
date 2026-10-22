import { describe, expectTypeOf, it } from 'vitest';
import type { SettingValueOf } from '../src/setting-value';

describe('SettingValueOf — что хранится в значении поля вида', () => {
  it('строковые виды и выбор — строка, переключатель — true или false', () => {
    expectTypeOf<SettingValueOf<'string'>>().toEqualTypeOf<string>();
    expectTypeOf<SettingValueOf<'text'>>().toEqualTypeOf<string>();
    expectTypeOf<SettingValueOf<'richtext'>>().toEqualTypeOf<string>();
    expectTypeOf<SettingValueOf<'url'>>().toEqualTypeOf<string>();
    expectTypeOf<SettingValueOf<'image'>>().toEqualTypeOf<string>();
    expectTypeOf<SettingValueOf<'select'>>().toEqualTypeOf<string>();
    expectTypeOf<SettingValueOf<'toggle'>>().toEqualTypeOf<boolean>();
  });

  it('вида, которого нет в формате, нет и в типе', () => {
    // @ts-expect-error — вида stars в формате секции нет
    expectTypeOf<SettingValueOf<'stars'>>().toBeNever();
  });
});
