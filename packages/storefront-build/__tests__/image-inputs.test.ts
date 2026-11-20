import type { Marker } from '@merfy-dropshipping-platform/images';
import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';
import { DATA_KEY_VERSION, buildKey, dataKey } from '../src/key';
import { changedInputs, errorOf, standInputs } from './support';

// Вход images (модуль картинок, шаг 3): маркеры копий по адресу картинки. Появился или сменился маркер — ключи сборки и
// данных другие, и сверка пересоберёт магазин; нет маркеров — ключа нет, входы прежние.
const ORIGIN = 'https://minio.dev.merfy.ru';
const PHOTO = `${ORIGIN}/product-images/a.jpg`;
const MARKER: Marker = {
  rulesVersion: 1,
  status: 'ok',
  attempts: 1,
  width: 2400,
  height: 1600,
  variants: [
    { kind: 'm', width: 800, key: 'product-images/a.jpg.m.webp' },
    { kind: 'd', width: 1600, key: 'product-images/a.jpg.d.webp' },
  ],
};
const withImages = (markers: Record<string, Marker>): BuildInputs =>
  changedInputs((inputs) => {
    inputs.images = { origin: ORIGIN, markers };
  });

describe('вход images', () => {
  it('версия ключа данных поднята: копия s только при своём sizes — пятая формула', () => {
    expect(DATA_KEY_VERSION).toBe(5);
  });

  it('входы с маркерами проходят разбор без изменений', () => {
    const inputs = withImages({ [PHOTO]: MARKER });
    expect(parseBuildInputs(inputs)).toEqual(inputs);
  });

  it('появился маркер — ключ сборки и ключ данных другие; тот же маркер — тот же ключ', () => {
    const marked = withImages({ [PHOTO]: MARKER });
    expect(buildKey(marked)).not.toBe(buildKey(standInputs));
    expect(dataKey(marked)).not.toBe(dataKey(standInputs));
    expect(buildKey(withImages({ [PHOTO]: structuredClone(MARKER) }))).toBe(buildKey(marked));
    expect(dataKey(withImages({ [PHOTO]: structuredClone(MARKER) }))).toBe(dataKey(marked));
  });

  it('сменился маркер (появилась копия для компьютера) — ключи другие', () => {
    const onlyPhone: Marker = { ...MARKER, variants: MARKER.variants.slice(0, 1) };
    expect(buildKey(withImages({ [PHOTO]: onlyPhone }))).not.toBe(buildKey(withImages({ [PHOTO]: MARKER })));
    expect(dataKey(withImages({ [PHOTO]: onlyPhone }))).not.toBe(dataKey(withImages({ [PHOTO]: MARKER })));
  });

  it('порядок адресов на ключ не влияет', () => {
    const other = `${ORIGIN}/product-images/b.jpg`;
    const one = withImages({ [PHOTO]: MARKER, [other]: MARKER });
    const two = withImages({ [other]: MARKER, [PHOTO]: MARKER });
    expect(buildKey(one)).toBe(buildKey(two));
  });

  it('маркер не по схеме и хост хранилища с косой чертой в конце — inputs-invalid', () => {
    const badMarker = { ...standInputsJson, images: { origin: ORIGIN, markers: { [PHOTO]: { status: 'ok' } } } };
    const slash = { ...standInputsJson, images: { origin: `${ORIGIN}/`, markers: {} } };
    expect(errorOf(() => parseBuildInputs(badMarker)).code).toBe('inputs-invalid');
    expect(errorOf(() => parseBuildInputs(slash)).code).toBe('inputs-invalid');
  });
});
