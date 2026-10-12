import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// Сравнение двух снимков — pixelmatch, как у scripts/visual-diff-themes.mjs: доля отличающихся пикселей и картинка
// отличий. Размеры разные — страница стала выше или ниже: доля 1, картинки отличий нет.
export interface PngDiff {
  ratio: number;
  diff: Buffer | null;
}

const PIXEL_THRESHOLD = 0.1;

export function diffPng(before: Buffer, after: Buffer): PngDiff {
  const first = PNG.sync.read(before);
  const second = PNG.sync.read(after);
  if (first.width !== second.width || first.height !== second.height) return { ratio: 1, diff: null };
  const out = new PNG({ width: first.width, height: first.height });
  const options = { threshold: PIXEL_THRESHOLD };
  const changed = pixelmatch(first.data, second.data, out.data, first.width, first.height, options);
  return { ratio: changed / (first.width * first.height), diff: PNG.sync.write(out) };
}
