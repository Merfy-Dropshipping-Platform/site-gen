import { describe, expect, it } from 'vitest';
import { parseBuildInputs } from '../src/inputs';
import { codeInputs } from './support-code';

// Значения настроек экземпляра — любой JSON (часть 5 блока 1 «Секций и SDK», Р1-5-2).

const WITH = (settings: unknown) => (inputs: { code: { pages: Record<string, unknown[]> } }) => {
  inputs.code.pages.home = [{ id: 'hero-1', section: 'shop:hero', settings }];
};

describe('значения настроек во входах сборки', () => {
  it('число, объект и null проходят; блоки — так же', () => {
    const inputs = codeInputs((changed) => {
      changed.code.pages.home = [
        {
          id: 'hero-1',
          section: 'shop:hero',
          settings: { overlay: 45, images: { url1: 'https://cdn.example/a.jpg', url2: '' }, space: null, shown: true },
          blocks: [{ id: 'heading-1', type: 'heading', settings: { size: 3 } }],
        },
      ];
    });
    expect(parseBuildInputs(inputs).code.pages.home?.[0]?.settings).toEqual({
      overlay: 45,
      images: { url1: 'https://cdn.example/a.jpg', url2: '' },
      space: null,
      shown: true,
    });
  });

  it('значение не из JSON не проходит', () => {
    const inputs = codeInputs();
    WITH({ overlay: undefined })(inputs);
    expect(() =>
      parseBuildInputs({
        ...inputs,
        code: { ...inputs.code, pages: { home: [{ id: 'hero-1', section: 'shop:hero', settings: { f: () => 1 } }] } },
      }),
    ).toThrow();
  });
});
