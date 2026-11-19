// Lighthouse по открытой странице снимка черновика (место `browser`, проверка `lighthouse`; владелец 18.11: «встроить
// встроенную оптимизацию lighthouse»). Режим snapshot: Lighthouse цепляется к уже открытой вкладке и не перезагружает её
// (замер 18.11 на главной nova: 2,1 с; полный снимок экрана выключен — он один занимал 1,2 с). Версия — 13.x, та же, что у
// PageSpeed: ссылка без адреса и без своего обработчика у неё — заготовка, а не ошибка (в 12.x было иначе).
//
// Берутся проверки, которые чинятся в коде секции и которых нет у html-validate и axe: картинки без размеров (страница
// прыгнет, когда они загрузятся — в снимке картинки грузятся быстро, и сам прыжок CLS может не поймать), растянутые
// картинки, ссылки, по которым не пройдёт поисковик, поля с запретом вставки. Остальное в snapshot — про фото (размер и
// формат: отложено владельцем), платформу (canonical, robots, viewport) или содержимое магазина (title, description).
import { z } from 'zod';
import type { LookDevice } from '../../look/look-types';
import { grouped, type CheckFinding } from '../finding';

export const LIGHTHOUSE_AUDITS = [
  'unsized-images',
  'image-aspect-ratio',
  'crawlable-anchors',
  'paste-preventing-inputs',
] as const;
type LighthouseAudit = (typeof LIGHTHOUSE_AUDITS)[number];

// Настройки прогона: только свои проверки, экран и устройство не трогать — их держит снимок (Playwright).
export const lighthouseConfig = (device: LookDevice) => ({
  extends: 'lighthouse:default' as const,
  settings: {
    onlyAudits: [...LIGHTHOUSE_AUDITS],
    formFactor: device,
    screenEmulation: { disabled: true },
    emulatedUserAgent: false as const,
    disableFullPageScreenshot: true,
  },
});

// Из отчёта нужны только непройденные проверки и их элементы: путь элемента в документе (`node.path`) — по нему страница
// находит секцию, начало разметки (`node.snippet`) — запасное описание, если элемент уже не найти.
const ReportNode = z.object({ path: z.string().optional(), snippet: z.string().optional() });
const ReportAudit = z.object({
  score: z.number().nullable(),
  details: z.object({ items: z.array(z.object({ node: ReportNode.optional() })).optional() }).optional(),
});
const Report = z.object({ audits: z.record(z.string(), z.unknown()) });

export interface FailedNode {
  audit: LighthouseAudit;
  path: string | null;
  snippet: string;
}

export function failedNodes(report: unknown): FailedNode[] {
  const { audits } = Report.parse(report);
  // Разбираются только свои проверки: вид остальных частей отчёта нас не касается. Своя не по форме — ошибка.
  return LIGHTHOUSE_AUDITS.flatMap((audit) => {
    if (audits[audit] === undefined) return [];
    const result = ReportAudit.parse(audits[audit]);
    if (result.score === null || result.score >= 1) return [];
    return (result.details?.items ?? []).map((item) => ({
      audit,
      path: item.node?.path ?? null,
      snippet: item.node?.snippet ?? '',
    }));
  });
}

// Скрипт страницы: элементы по путям Lighthouse и их секции. Путь — пары «номер среди соседей, имя узла» от документа
// вниз; соседи — без пустых текстовых узлов, теневой корень — номер `a` (getNodePath в core/lib/page-functions.js).
export const PLACES_BY_PATH = `(paths) => {
  const resolve = (path) => {
    if (!path) return null;
    const parts = path.split(',');
    let node = document;
    for (let index = 0; index + 1 < parts.length; index += 2) {
      const at = parts[index];
      const name = parts[index + 1];
      if (at === 'a' || at === 'u') {
        node = node && node.shadowRoot ? node.shadowRoot : null;
        if (node === null) return null;
        continue;
      }
      const kids = [...node.childNodes].filter((child) => !(child.nodeType === 3 && !(child.nodeValue || '').trim()));
      node = kids[Number(at)];
      if (!node || node.nodeName !== name) return null;
    }
    return node && node.nodeType === 1 ? node : null;
  };
  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      const src = (el.currentSrc || el.getAttribute('src') || '').split('?')[0].split('#')[0];
      const file = src.startsWith('data:') ? '' : src.split('/').pop();
      return file ? 'img ' + file : 'img';
    }
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    return text ? tag + ' «' + (text.length > 40 ? text.slice(0, 40) + '…' : text) + '»' : tag;
  };
  return paths.map((path) => {
    const el = resolve(path);
    if (el === null) return null;
    const wrapper = el.closest('[data-section-id]');
    return { section: wrapper ? wrapper.getAttribute('data-section-id') : null, where: describe(el) };
  });
}`;

export const LighthouseRaw = z.array(
  z.object({ audit: z.enum(LIGHTHOUSE_AUDITS), section: z.string().nullable(), where: z.string() }),
);
export type LighthouseRaw = z.infer<typeof LighthouseRaw>;

// Элемент, которого в странице уже нет: описание по началу разметки из отчёта — тег.
export const tagOfSnippet = (snippet: string): string =>
  /^<([a-zA-Z][\w-]*)/.exec(snippet)?.[1]?.toLowerCase() ?? 'элемент';

// «что не так · как починить».
const TEXT: Record<LighthouseAudit, string> = {
  'unsized-images':
    'Картинка без размеров — страница прыгнет, когда она загрузится · задай width и height (или aspect-ratio в CSS)',
  'image-aspect-ratio':
    'Картинка растянута: пропорции на странице не как у файла · задай object-fit: cover или пропорции файла',
  'crawlable-anchors':
    'Ссылка, по которой поисковик не пройдёт · дай ей настоящий адрес в href, а действие без перехода сделай кнопкой',
  'paste-preventing-inputs': 'Поле запрещает вставку — покупатель не вставит адрес или телефон · убери запрет вставки',
};

// Находки Lighthouse по элементам, которые страница уже привязала к секциям. Ответ не по форме — ошибка.
export function lighthouseFindings(raw: unknown): CheckFinding[] {
  return grouped(
    LighthouseRaw.parse(raw).map((entry) => ({
      place: 'browser' as const,
      check: 'lighthouse',
      rule: entry.audit,
      level: 'warning' as const,
      section: entry.section,
      where: entry.where,
      text: TEXT[entry.audit],
    })),
  );
}
