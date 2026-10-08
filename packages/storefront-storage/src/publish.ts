import { checkManifest, sha256, type BuildFile, type StorefrontManifest } from '@merfy/storefront-build';
import { contentTypeOf } from './content-types';
import { StorefrontStorageError } from './errors';
import { parseRoutesTable, type FileRow, type Pointer } from './formats';
import { hexOf, manifestKey, pointerKey, routesKey } from './layout';
import { readObject, writeObject } from './objects';
import { changePointer, nextPointer, readPointer, type PointerOutcome } from './pointer';
import { publishProblems, type PublishProblem, type PublishRuleId } from './publish-rules';
import { buildRoutesTable, type PreviousBuild } from './routes-table';
import { seoFiles, type SeoFile } from './sitemap';
import type { ObjectStore } from './store';
import { uploadBuild, uploadFiles, type UploadReport } from './upload';

// Выкладка сборки магазина новой темы (design.md блока 5): заливка только нового → проверка перед переключением →
// манифест и таблица раздачи → указатель одной условной записью. Зовёт сборщик (блок 6) после рендера; номер сборки —
// его, выдан при старте сборки. Сборка, которая не новее уже выложенных или уже выложена, ничего не льёт и не пишет.

export interface PublishRequest {
  // Метка хоста магазина: по ней раздача находит указатель.
  label: string;
  build: number;
  // Манифест блока 4 как есть: проверяется его схемой.
  manifest: unknown;
  // Содержимое перерисованных файлов; остальные файлы манифеста уже в хранилище.
  files: readonly BuildFile[];
  publicUrl: string;
  // Магазин для поиска: robots.txt открыт и есть карта сайта. Стенд — нет.
  indexable: boolean;
  now: string;
  // Правила проверки, которые разрешила нарушить служебная команда.
  allowed?: readonly PublishRuleId[];
}

export type PublishStatus = PointerOutcome | 'blocked';

export interface PublishResult {
  status: PublishStatus;
  problems: PublishProblem[];
  // Что залито; null — сборка не новее выложенных или уже выложена, заливки не было.
  upload: UploadReport | null;
  // Указатель после выкладки; при blocked — каким был.
  pointer: Pointer | null;
}

const encoder = new TextEncoder();
const parseManifest = (value: unknown): StorefrontManifest => checkManifest(value);

async function liveBuild(store: ObjectStore, pointer: Pointer): Promise<PreviousBuild> {
  const key = routesKey(pointer.shop, pointer.build);
  const manifest = await readObject(store, manifestKey(pointer.shop, pointer.build), parseManifest);
  const table = await readObject(store, key, parseRoutesTable);
  if (manifest === null || table === null)
    throw new StorefrontStorageError('build-incomplete', 'у живой сборки нет манифеста или таблицы раздачи', {
      path: key,
    });
  return { manifest: manifest.value, table: table.value };
}

const seoRow = (file: SeoFile): FileRow => ({
  h: hexOf(sha256(file.text)),
  t: contentTypeOf(file.path),
  c: 'revalidate',
});

// Манифест — как есть; таблица раздачи — из манифеста и прошлой живой сборки, плюс robots.txt и карта сайта.
async function writeBuild(
  store: ObjectStore,
  request: PublishRequest,
  manifest: StorefrontManifest,
  previous: PreviousBuild | null,
): Promise<void> {
  const seo = seoFiles({ manifest, publicUrl: request.publicUrl, indexable: request.indexable });
  await uploadFiles(
    store,
    seo.map((file) => ({ path: file.path.slice(1), content: encoder.encode(file.text) })),
  );
  const table = buildRoutesTable({ manifest, build: request.build, previous, now: request.now });
  const seoRows = Object.fromEntries(seo.map((file) => [file.path, seoRow(file)]));
  await writeObject(store, manifestKey(manifest.shop.id, request.build), manifest);
  await writeObject(store, routesKey(manifest.shop.id, request.build), {
    ...table,
    files: { ...table.files, ...seoRows },
  });
}

export async function publishBuild(store: ObjectStore, request: PublishRequest): Promise<PublishResult> {
  const manifest = checkManifest(request.manifest);
  const intent = { kind: 'publish', shop: manifest.shop.id, build: request.build } as const;
  const pointer = await readPointer(store, request.label);
  const early = pointer === null ? null : nextPointer(pointer, intent, pointerKey(request.label));
  if (early?.next === null) return { status: early.outcome, problems: [], upload: null, pointer };
  const previous = pointer === null ? null : await liveBuild(store, pointer);
  const upload = await uploadBuild(store, manifest, request.files, previous?.manifest ?? null);
  const context = { manifest, previous: previous?.manifest ?? null, missing: upload.missing };
  const problems = publishProblems(context, request.allowed ?? []);
  if (problems.length > 0) return { status: 'blocked', problems, upload, pointer };
  await writeBuild(store, request, manifest, previous);
  const change = await changePointer(store, request.label, intent);
  return { status: change.outcome, problems: [], upload, pointer: change.pointer };
}
