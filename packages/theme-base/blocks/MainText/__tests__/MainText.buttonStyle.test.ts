import {
  MainTextSchema,
  MainTextPuckConfig,
  MainTextClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variant: MainText.buttonStyle.
 *   solid (default, identical pre-commit) | outlined (vanilla home).
 */
describe('MainText.buttonStyle (additive variant)', () => {
  const baseValid = {
    heading: 'h',
    text: 't',
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts buttonStyle="outlined"', () => {
    expect(MainTextSchema.safeParse({ ...baseValid, buttonStyle: 'outlined' }).success).toBe(true);
  });

  it('schema accepts buttonStyle="solid"', () => {
    expect(MainTextSchema.safeParse({ ...baseValid, buttonStyle: 'solid' }).success).toBe(true);
  });

  it('schema rejects invalid buttonStyle', () => {
    expect(
      MainTextSchema.safeParse({ ...baseValid, buttonStyle: 'ghost' as unknown as 'solid' })
        .success,
    ).toBe(false);
  });

  it('schema works without buttonStyle (backwards compat)', () => {
    expect(MainTextSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes buttonStyle field', () => {
    const fields = MainTextPuckConfig.fields as Record<string, unknown>;
    expect(fields.buttonStyle).toBeDefined();
  });

  it('Classes export buttonStyle mapping with solid + outlined', () => {
    const c = MainTextClasses as Record<string, unknown>;
    expect(c.buttonStyle).toBeDefined();
    const map = c.buttonStyle as Record<string, string>;
    expect(map.solid).toBeDefined();
    expect(map.outlined).toMatch(/border/);
    expect(map.outlined).toMatch(/bg-transparent/);
  });
});
