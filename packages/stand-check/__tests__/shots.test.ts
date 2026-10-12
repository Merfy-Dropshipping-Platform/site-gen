import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { packagePath } from '../src/paths';
import { renderReport } from '../src/report/report';
import { parseRunArgs } from '../src/run/args';
import { diffPng } from '../src/shots/diff';
import { compareShots, shotFileName, standShotEntry } from '../src/shots/shots';
import { parseThresholds, shotKey, thresholdOf } from '../src/shots/thresholds';
import { cleanPassport } from './support/passports';

// Пороги — настоящий файл site-gen: формат строк «$comment» внутри per_key и skip — его, а не придуманный.
const THRESHOLDS_FILE = packagePath('../../visual-diff-thresholds.json');

function png(width: number, height: number, paint: (x: number, y: number) => number): Buffer {
  const image = new PNG({ width, height });
  for (let index = 0; index < width * height; index += 1) {
    const value = paint(index % width, Math.floor(index / width));
    image.data.set([value, value, value, 255], index * 4);
  }
  return PNG.sync.write(image);
}

const WHITE = png(10, 10, () => 255);
const ONE_DOT = png(10, 10, (x, y) => (x === 0 && y === 0 ? 0 : 255));

describe('пороги снимков', () => {
  it('настоящий visual-diff-thresholds.json: default, per_key и skip без строк $comment', async () => {
    const thresholds = parseThresholds(JSON.parse(await readFile(THRESHOLDS_FILE, 'utf8')));
    expect(thresholds.fallback).toBe(0.05);
    expect(thresholdOf(thresholds, 'rose/product/375')).toBe(0.08);
    expect(thresholdOf(thresholds, 'rose/order-tracking/1920')).toBeNull();
    expect(thresholdOf(thresholds, shotKey('nova', 'home', 390))).toBe(0.05);
    expect(thresholds.perKey.has('$comment')).toBe(false);
    expect([...thresholds.skip].some((entry) => entry.startsWith('$comment'))).toBe(false);
  });

  it('порог больше 1 — thresholds-invalid', () => {
    expect(() => parseThresholds({ default: 2, per_key: {}, skip: [] })).toThrow(/thresholds-invalid/);
  });
});

describe('сравнение снимков', () => {
  it('одинаковые — 0; одна точка из ста — 0.01; другой размер — 1 без картинки отличий', () => {
    expect(diffPng(WHITE, WHITE).ratio).toBe(0);
    expect(diffPng(WHITE, ONE_DOT).ratio).toBe(0.01);
    expect(
      diffPng(
        WHITE,
        png(10, 12, () => 255),
      ),
    ).toEqual({ ratio: 1, diff: null });
  });

  it('выше порога — over; снимка «до» нет — пары нет', () => {
    const thresholds = parseThresholds({ default: 0.005, per_key: {}, skip: [] });
    const before = [{ page: 'home', width: 390, png: WHITE }];
    const after = [
      { page: 'home', width: 390, png: ONE_DOT },
      { page: 'stand', width: 390, png: WHITE },
    ];
    const differences = compareShots('nova', before, after, thresholds);
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatchObject({ key: 'nova/home/390', ratio: 0.01, threshold: 0.005, over: true });
    expect(shotFileName(after[1])).toBe('stand-390.png');
  });
});

describe('выключатель и отчёт', () => {
  it('--shots: по умолчанию off; on — включено; другое — args-invalid', () => {
    expect(parseRunArgs([]).shots).toBe(false);
    expect(parseRunArgs(['--shots', 'on']).shots).toBe(true);
    expect(() => parseRunArgs(['--shots', 'maybe'])).toThrow(/args-invalid/);
  });

  it('снимки — раздел отчёта с картинками; без снимков раздела нет', () => {
    const base = {
      verdict: 'clean' as const,
      differences: [],
      before: cleanPassport(),
      after: cleanPassport(),
      checklist: '',
    };
    const entry = standShotEntry({ page: 'home', width: 390, png: WHITE });
    expect(renderReport({ ...base, shots: [entry] })).toContain('<img src="shots/home-390.png"');
    expect(renderReport(base)).not.toContain('<h2>Снимки</h2>');
  });
});
