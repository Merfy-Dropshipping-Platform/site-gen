import { substituteTemplateVars } from '../template-vars';

describe('substituteTemplateVars', () => {
  const vars = {
    COLLECTION_NAME: 'URBAN',
    COLLECTION_DESCRIPTION: 'Urban style collection',
    COLLECTION_IMAGE: 'https://cdn/image.jpg',
  };

  it('substitutes single var in string', () => {
    expect(substituteTemplateVars('Hello {{COLLECTION_NAME}}', vars)).toBe('Hello URBAN');
  });

  it('substitutes multiple vars', () => {
    expect(
      substituteTemplateVars('{{COLLECTION_NAME}} - {{COLLECTION_DESCRIPTION}}', vars)
    ).toBe('URBAN - Urban style collection');
  });

  it('leaves unknown vars untouched', () => {
    expect(substituteTemplateVars('{{UNKNOWN}}', vars)).toBe('{{UNKNOWN}}');
  });

  it('recursively substitutes in arrays', () => {
    expect(
      substituteTemplateVars(['{{COLLECTION_NAME}}', '{{COLLECTION_DESCRIPTION}}'], vars)
    ).toEqual(['URBAN', 'Urban style collection']);
  });

  it('recursively substitutes in nested objects', () => {
    const input = {
      heading: { text: '{{COLLECTION_NAME}}', size: 'large' },
      meta: { title: '{{COLLECTION_NAME}} | Shop' },
    };
    expect(substituteTemplateVars(input, vars)).toEqual({
      heading: { text: 'URBAN', size: 'large' },
      meta: { title: 'URBAN | Shop' },
    });
  });

  it('handles null and undefined safely', () => {
    expect(substituteTemplateVars(null, vars)).toBe(null);
    expect(substituteTemplateVars(undefined, vars)).toBe(undefined);
  });

  it('passes numbers and booleans through unchanged', () => {
    expect(substituteTemplateVars(42, vars)).toBe(42);
    expect(substituteTemplateVars(true, vars)).toBe(true);
  });

  it('handles empty values gracefully (substitutes empty string)', () => {
    expect(substituteTemplateVars('Image: {{COLLECTION_IMAGE}}', { COLLECTION_IMAGE: '' })).toBe('Image: ');
  });
});
