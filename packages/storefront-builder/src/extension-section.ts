import { SECTION_ID, doorSchema, readManifest, sectionAnswer, type Door } from '@merfy/storefront-sections';
import type { SectionFiles, SectionProblem } from '@merfy/storefront-sections';
import { z } from 'zod';
import type { DrawAnswer } from './draw';
import { errorText } from './errors';
import { filesBodySchema, toolError, type SectionToolsDeps } from './section-tools';
import { jsonAnswer } from './stand-preview';

// Секция или глобальный скрипт версии расширения (блок 12 «Секций и SDK», 12.6, 12.10; договор —
// src/extension-sections/extension-sections.contract.ts сервиса sites): сервис extensions при регистрации версии
// отправляет файлы в sites, sites — сюда. Способ сохранения extension: начало полного имени и владелец — id расширения, release —
// версия расширения; проверка — та же, что у секций магазина, и только при закрытой песочнице (Р14-13). Вход —
// внутренняя сеть: id расширения и версию дал сервис extensions из реестра.
export const EXTENSION_SECTION_ROUTE = '/sections/extension';

const querySchema = z.strictObject({
  extension: z.string(),
  release: z.string(),
  kind: z.enum(['section', 'global']),
  name: z.string().regex(SECTION_ID),
});
type SectionQuery = z.infer<typeof querySchema>;

export interface ExtensionSectionAnswer {
  ok: true;
  status: 'accepted' | 'unchanged';
  name: string;
  id: string;
}

const TEXT = {
  query: 'нужны ?extension=<id>&release=<semver>&kind=section|global&name=<имя секции>',
  body: 'нужно тело JSON { "files": { "<путь>": "<текст>" } }',
  closed: 'загрузка секций на этом контуре выключена: песочница процессов рендера не закрыта',
  failed: 'сохранение секции расширения упало: повтор — следующей регистрацией версии',
} as const;

const LISTS = { section: 'storefront.sections', global: 'storefront.globals' } as const;

const manifestProblem = (message: string): SectionProblem => ({
  code: 'manifest-invalid',
  file: 'section.json',
  line: null,
  column: null,
  message,
});

// name и kind из section.json — как в манифесте расширения: иначе магазины получат секцию не под тем именем или не того
// вида. section.json не разобран — промолчим: это скажет приём.
export function manifestMismatch(files: SectionFiles, query: SectionQuery): SectionProblem[] {
  const manifest = readManifest(files);
  if (!manifest.ok) return [];
  const { name, kind } = manifest.value;
  const nameText = `name в section.json — «${name}», в манифесте расширения — «${query.name}»`;
  const kindText = `kind в section.json — «${kind}», а в манифесте расширения секция в ${LISTS[query.kind]}`;
  return [
    ...(name === query.name ? [] : [manifestProblem(nameText)]),
    ...(kind === query.kind ? [] : [manifestProblem(kindText)]),
  ];
}

function filesOf(text: string): SectionFiles | null {
  try {
    const parsed = filesBodySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.files : null;
  } catch {
    return null;
  }
}

const refusedAnswer = (query: SectionQuery, files: SectionFiles, problems: SectionProblem[]): DrawAnswer =>
  jsonAnswer(422, sectionAnswer(query.extension, files, { ok: false, problems }));

async function save(deps: SectionToolsDeps, door: Door, query: SectionQuery, files: SectionFiles): Promise<DrawAnswer> {
  const mismatch = manifestMismatch(files, query);
  if (mismatch.length > 0) return refusedAnswer(query, files, mismatch);
  const result = await deps.accept(door, files);
  const fields = { extension: query.extension, release: query.release, name: query.name };
  if (result.status === 'refused') {
    deps.log('extension-section-refused', { ...fields, codes: result.problems.map((item) => item.code).join(',') });
    return refusedAnswer(query, files, result.problems);
  }
  deps.log('extension-section-saved', { ...fields, status: result.status });
  const answer: ExtensionSectionAnswer = { ok: true, status: result.status, name: result.row.name, id: result.row.id };
  return jsonAnswer(200, answer);
}

// POST /sections/extension?extension=&release=&kind=&name= с телом { files }. Ответы: 200 ExtensionSectionAnswer;
// 422 SectionAnswer (отказ проверки или name/kind не те); 400, 405, 503, 500 — ToolError (section-tools.ts).
export async function extensionSection(
  deps: SectionToolsDeps,
  method: string,
  url: URL,
  body: () => Promise<string>,
): Promise<DrawAnswer> {
  if (method !== 'POST') return { status: 405, body: '' };
  if (!deps.open()) return toolError(503, 'uploads-closed', TEXT.closed);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return toolError(400, 'name-invalid', TEXT.query);
  const door = doorSchema.safeParse({
    author: 'extension',
    extension: query.data.extension,
    release: query.data.release,
  });
  if (!door.success) return toolError(400, 'name-invalid', TEXT.query);
  const files = filesOf(await body());
  if (files === null) return toolError(400, 'body-invalid', TEXT.body);
  try {
    return await save(deps, door.data, query.data, files);
  } catch (error) {
    deps.log('extension-section-failed', {
      extension: query.data.extension,
      name: query.data.name,
      error: errorText(error),
    });
    return toolError(500, 'tool-failed', TEXT.failed);
  }
}
