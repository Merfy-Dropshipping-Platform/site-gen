import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { errorText } from '../errors';
import { base64Size } from './look-fit';
import {
  LAYOUT_CODES,
  LookError,
  type Clip,
  type LayoutCode,
  type LayoutFinding,
  type LookFinding,
  type PageSession,
  type Viewport,
} from './look-types';

// Проверки вёрстки в снимке черновика (28.10): карточки разной высоты, полоски не на всю ширину, выход за экран, обрезанный
// текст, наложения, растянутые картинки, мелкие кнопки и текст, много колонок на телефоне. Сами проверки и пороги — в
// `browser/layout-checks.js` (работают в странице); здесь — запуск, пределы ответа и вырезки мест.

// Находок одного кода на страницу и устройство.
export const MAX_PER_CODE = 3;
// Вырезок на весь ответ. Каждой находке даётся `clip`, а картинка — только первым по важности.
export const MAX_CLIPS = 4;
// Поля вокруг места находки на вырезке, px.
export const CLIP_PADDING = 12;
export const CLIP_MAX_HEIGHT = 480;
export const CLIP_MAX_WIDTH = 900;
// Качество JPEG вырезки от лучшего к худшему: следующее берём, пока вырезка не влезла в `CLIP_MAX_BYTES`.
export const CLIP_QUALITY_STEPS = [70, 50, 35] as const;
// Вес одной вырезки, байт (до base64); четыре вырезки вычитаются из предела веса снимков (`look-fit.ts`).
export const CLIP_MAX_BYTES = 60_000;

const LAYOUT_NAMES: Record<LayoutCode, string> = {
  'row-unequal': 'Карточки ряда разной высоты',
  'row-not-filling': 'Полоски не на всю ширину ряда',
  'overflow-x': 'Выходит за ширину экрана',
  'text-clipped': 'Текст обрезан контейнером',
  overlap: 'Элементы перекрывают друг друга',
  'image-distorted': 'Картинка растянута',
  'columns-many': 'Много колонок карточек на телефоне',
  'tap-small': 'Кнопка или ссылка мельче 44 px',
  'text-small': 'Текст мельче 12 px',
};

let layoutScript: string | undefined;
export function layoutSource(): string {
  // Форматтер дописывает `;` после функции-выражения — в `(функция)(аргумент)` она недопустима.
  layoutScript ??= readFileSync(new URL('./browser/layout-checks.js', import.meta.url), 'utf8')
    .trim()
    .replace(/;+$/, '');
  return layoutScript;
}

const ClipShape = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const LayoutOutput = z.array(
  z.object({
    code: z.enum(LAYOUT_CODES),
    section: z.string().nullable(),
    text: z.string(),
    clip: ClipShape,
    mark: z.int().nonnegative(),
  }),
);

export const parseLayout = (raw: unknown): LayoutFinding[] => LayoutOutput.parse(raw);

// Не больше `MAX_PER_CODE` на код, коды — по важности.
export const limitPerCode = (found: LayoutFinding[]): LayoutFinding[] =>
  LAYOUT_CODES.flatMap((code) => found.filter((finding) => finding.code === code).slice(0, MAX_PER_CODE));

// Место на вырезке: найденный прямоугольник с полями, внутри экрана по ширине и страницы по высоте, не больше пределов.
export function clipArea(clip: Clip, viewport: Viewport, pageHeight: number): Clip {
  const left = Math.max(0, clip.x - CLIP_PADDING);
  const right = Math.min(viewport.width, clip.x + clip.width + CLIP_PADDING);
  const inside = right > left;
  const x = inside ? left : 0;
  const width = Math.min(CLIP_MAX_WIDTH, (inside ? right : viewport.width) - x);
  const y = Math.max(0, clip.y - CLIP_PADDING);
  const bottom = Math.min(Math.max(pageHeight, y + 1), clip.y + clip.height + CLIP_PADDING);
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.max(1, Math.ceil(width)),
    height: Math.max(1, Math.min(CLIP_MAX_HEIGHT, Math.ceil(bottom - y))),
  };
}

const firstLine = (text: string): string => (text.split('\n')[0] ?? '').slice(0, 200);

interface DeviceLayout {
  session: PageSession;
  findings: LayoutFinding[];
}

type LayoutStatus = { ok: true } | { ok: false; reason: string };

// Проверки одного устройства. Отказ проверок не роняет снимки: причина уходит в ответ; срок задания — наружу.
async function layoutOf(session: PageSession): Promise<{ layout: DeviceLayout; failure: string | null }> {
  try {
    const found = limitPerCode(await session.layout());
    const findings = found.map((finding) => ({
      ...finding,
      clip: clipArea(finding.clip, session.viewport, session.facts.pageHeight),
    }));
    return { layout: { session, findings }, failure: null };
  } catch (error) {
    if (error instanceof LookError) throw error;
    return { layout: { session, findings: [] }, failure: firstLine(errorText(error)) };
  }
}

interface Candidate {
  layout: DeviceLayout;
  finding: LayoutFinding;
}

// Кому достанется вырезка: сначала по одной на пару «устройство, код» (телефон первым, коды по важности), потом остальные.
export function chooseForClips(layouts: DeviceLayout[]): Candidate[] {
  const all = layouts.flatMap((layout) => layout.findings.map((finding) => ({ layout, finding })));
  const isFirst = (item: Candidate): boolean =>
    all.find((other) => other.layout === item.layout && other.finding.code === item.finding.code) === item;
  const firsts = all.filter(isFirst);
  return [...firsts, ...all.filter((item) => !firsts.includes(item))].slice(0, MAX_CLIPS);
}

async function shootWithin(session: PageSession, finding: LayoutFinding): Promise<Uint8Array> {
  let shot: Uint8Array = new Uint8Array();
  for (const quality of CLIP_QUALITY_STEPS) {
    shot = await session.shootClip(finding, quality);
    if (shot.length <= CLIP_MAX_BYTES) break;
  }
  return shot;
}

const toLookFinding = (layout: DeviceLayout, finding: LayoutFinding, image: Uint8Array | undefined): LookFinding => ({
  source: 'layout',
  code: finding.code,
  name: LAYOUT_NAMES[finding.code],
  text: finding.text,
  device: layout.session.device,
  section: finding.section,
  clip: finding.clip,
  image: image === undefined ? null : Buffer.from(image).toString('base64'),
});

export interface LayoutResult {
  status: LayoutStatus;
  // Телефон первым; внутри устройства — по важности кода.
  findings: LookFinding[];
  // Вес вырезок в base64, байт: вычитается из предела веса снимков.
  clipBytes: number;
}

// Проверки вёрстки на всех устройствах и вырезки первых по важности находок.
export async function runLayoutChecks(sessions: PageSession[]): Promise<LayoutResult> {
  const results = await Promise.all(sessions.map(layoutOf));
  const layouts = results.map((result) => result.layout);
  const reason = results.find((result) => result.failure !== null)?.failure ?? null;
  const shots = new Map<LayoutFinding, Uint8Array>();
  for (const { layout, finding } of chooseForClips(layouts)) {
    shots.set(finding, await shootWithin(layout.session, finding));
  }
  const findings = layouts.flatMap((layout) =>
    layout.findings.map((finding) => toLookFinding(layout, finding, shots.get(finding))),
  );
  const clipBytes = [...shots.values()].reduce((sum, shot) => sum + base64Size(shot.length), 0);
  return { status: reason === null ? { ok: true } : { ok: false, reason }, findings, clipBytes };
}
