import { escapeScriptJson } from '@merfy/storefront-config';
import { PREVIEW_BUNDLE_TAG_ID } from '@merfy/shell/preview';
import { bundleScript, type BundleSection, type CodeNotice } from './bundle';
import { sha256 } from './canonical';
import { LIVE_PARTS, pageParts, type CodeAssets } from './code';
import { StorefrontBuildError } from './errors';
import type { BuildInputs, CodeSection } from './inputs';

// Код страницы превью конструктора (блок 5 «Секций и SDK», часть 5г; design.md блока 5, раздел 3.11; Р5г-10): перед
// </body> HTML превью — JSON-тег #merfy-preview-bundle со строкой бандла и dist/preview.js текстом. Бандл — как у
// опубликованного сайта (pageBundle, code.ts), но с секциями всего кода магазина со скриптом (секцию ставят на страницу
// без перезагрузки превью) и с preview: watchPreviewReplace; частей без API для секций (LIVE_PARTS) нет — превью ничего
// не отправляет. Поведений в бандле превью пока нет (часть 6в).
export interface PreviewCode {
  tags: string; // '' — нет ядра во входах, сборки ядра или dist/preview.js: превью без кода, как в 5б
  notices: CodeNotice[]; // пропущенные секции (section-script-skipped) — как у бандла страницы
}

const HASH_PREFIX = 'sha256:';
const LIVE = new Set<string>(LIVE_PARTS);

// Секция бандла превью из секции кода магазина: хеш — 64 знака hex, uses — из её script_meta, нет — части ядра.
function previewSection(section: CodeSection, coreParts: readonly string[]): BundleSection {
  return {
    name: section.name,
    kind: section.kind,
    script: (section.script ?? '').slice(HASH_PREFIX.length),
    uses: section.meta?.uses ?? coreParts,
  };
}

// Текст модуля секции: нет байтов или sha256 не тот — code-missing, как у бандла страницы.
function moduleText(hex: string, modules: ReadonlyMap<string, Uint8Array>): string {
  const hash = `${HASH_PREFIX}${hex}`;
  const bytes = modules.get(hash);
  if (bytes === undefined || hash !== sha256(bytes)) {
    throw new StorefrontBuildError('code-missing', 'нет файла скрипта секции с этим хешем', { path: hex });
  }
  return Buffer.from(bytes).toString('utf8');
}

// Модули секций бандла превью: hex → текст, по порядку секций.
function previewModules(
  sections: readonly BundleSection[],
  modules: ReadonlyMap<string, Uint8Array>,
): Map<string, string> {
  return new Map(sections.map((section): [string, string] => [section.script, moduleText(section.script, modules)]));
}

// Части бандла превью — как у страницы, но без частей без API для секций (LIVE_PARTS): превью ничего не отправляет.
function previewParts(core: readonly string[], sections: readonly CodeSection[]): string[] {
  return pageParts(core, sections).filter((part) => !LIVE.has(part));
}

// Теги кода превью: JSON-тег со строкой бандла, за ним — скрипт превью текстом.
function previewTagsOf(bundle: string, script: string): string {
  const json = escapeScriptJson(JSON.stringify(bundle));
  return `<script type="application/json" id="${PREVIEW_BUNDLE_TAG_ID}">${json}</script><script>${script}</script>`;
}

export async function previewCode(inputs: BuildInputs, assets: CodeAssets): Promise<PreviewCode> {
  const shell = inputs.shell;
  if (shell === null || assets.shell === null || assets.shell.preview === undefined) {
    return { tags: '', notices: [] };
  }
  const sections = inputs.code.sections
    .filter((section) => section.script !== null)
    .map((section) => previewSection(section, shell.parts));
  const modules = previewModules(sections, assets.modules);
  const parts = previewParts(shell.parts, inputs.code.sections);
  const { text, notices } = await bundleScript({
    core: assets.shell.code,
    parts,
    sections,
    modules,
    preview: true,
  });
  return { tags: previewTagsOf(text, assets.shell.preview), notices };
}
