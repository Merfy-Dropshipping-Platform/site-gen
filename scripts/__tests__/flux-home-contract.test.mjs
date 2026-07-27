// Контракт главной страницы темы Flux (spec 111-flux-constructor-live-markup).
//
// Цель: зафиксировать целевое конечное состояние 9-секционного состава
// главной страницы Flux (packages/theme-flux/pages/home.json), карты секций
// (themes/flux/sections.map.json) и pinned upstream-коммита
// (themes/flux/SOURCE.lock.json) ДО того, как продакшн-файлы будут исправлены
// задачами 3-9 плана.
//
// Это RED-тест (Task 1): на момент написания сид не содержит PromoBanner,
// Product и ImageWithText, а sections.map.json не сопоставляет Product и
// сопоставляет ImageWithText на устаревший файл (не Puk.astro). Тест должен
// падать по ЭТИМ причинам — production-файлы в этой задаче не трогаем.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const SECTIONS_MAP_PATH = path.resolve(
  __dirname,
  '../../themes/flux/sections.map.json',
);
const HOME_JSON_PATH = path.resolve(
  __dirname,
  '../../packages/theme-flux/pages/home.json',
);
const SOURCE_LOCK_PATH = path.resolve(
  __dirname,
  '../../themes/flux/SOURCE.lock.json',
);

const HOME_ORDER = [
  'PromoBanner',
  'Header',
  'Hero',
  'Collections',
  'Product',
  'PopularProducts',
  'ImageWithText',
  'Gallery',
  'Footer',
];

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

// ───────── загрузка один раз ─────────

const sectionMap = await readJson(SECTIONS_MAP_PATH);
const home = await readJson(HOME_JSON_PATH);
const sourceLock = await readJson(SOURCE_LOCK_PATH);

// ───────── состав главной (9 секций, целевой порядок) ─────────

test('home.json: главная состоит из 9 секций в целевом порядке', () => {
  assert.deepEqual(
    home.content.map((block) => block.type),
    HOME_ORDER,
  );
});

// ───────── sections.map.json: сопоставления Product и ImageWithText ─────────

test('sections.map.json: Product сопоставлен на FeaturedProduct.astro', () => {
  assert.equal(
    sectionMap.Product,
    'src/components/sections/FeaturedProduct.astro',
  );
});

test('sections.map.json: ImageWithText сопоставлен на Puk.astro', () => {
  assert.equal(sectionMap.ImageWithText, 'src/components/sections/Puk.astro');
});

test('sections.map.json: каждый тип из HOME_ORDER имеет сопоставление', () => {
  for (const type of HOME_ORDER) {
    assert.ok(sectionMap[type], `${type} is mapped`);
  }
});

// ───────── SOURCE.lock.json: pinned upstream-коммит ─────────

test('SOURCE.lock.json: закреплён эталонный коммит upstream flux-theme', () => {
  assert.equal(
    sourceLock.commit,
    'e29b70920ffe4469744386b51b9c8ee0fcf68bd0',
  );
});

// ───────── стабильные уникальные props.id ─────────

test('home.json: у каждого блока есть стабильный уникальный props.id', () => {
  const ids = home.content.map((block) => block.props?.id);
  for (const id of ids) {
    assert.ok(
      typeof id === 'string' && id.length > 0,
      `каждый блок должен иметь непустой props.id (получено: ${JSON.stringify(id)})`,
    );
  }
  assert.equal(
    new Set(ids).size,
    ids.length,
    `props.id должны быть уникальны (получено: ${JSON.stringify(ids)})`,
  );
});
