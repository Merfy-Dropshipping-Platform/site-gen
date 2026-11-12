// Раскадровка в браузере (часть 3в, `look-motion.ts`): вторая страница того же контекста с HTML в режиме витрины. Открывается
// при первой просьбе и живёт до закрытия контекста; повторный вызов (запасное качество) использует её же.
import { z } from 'zod';
import type { BrowserContext, Page } from 'playwright';
import {
  COLLECT_SCRIPT,
  HOLD_SCRIPT,
  MOTION_END_SCRIPT,
  MOTION_FRAME_MAX_HEIGHT,
  MOTION_FRAME_TIMES,
  MOTION_SECTIONS_SCRIPT,
  REFRESH_SCRIPT,
  groupAnimations,
  motionBeginScript,
  motionSetScript,
  parseRows,
  type MotionHtml,
} from './look-motion';
import type { MotionCapture, MotionSectionShots, PageSession, Viewport } from './look-types';

// Кадр меньше этого по высоте не снимается: секция без содержимого.
const MIN_FRAME_HEIGHT = 20;

const Place = z
  .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), type: z.string().nullable() })
  .nullable();
const Order = z.array(z.string());

interface Opened {
  page: Page;
  order: string[];
}

export interface MotionRunnerInput {
  context: BrowserContext;
  viewport: Viewport;
  html: MotionHtml;
  // Адрес страницы кадров: тот же магазин, что у основной, отличается параметром (по нему маршрут отдаёт HTML режима витрины).
  entry: string;
  // Загрузка и прокрутка до конца, как у основной страницы (`look-page.ts`).
  settle: (page: Page, entry: string) => Promise<void>;
}

async function openMotionPage(input: MotionRunnerInput): Promise<Opened> {
  const page = await input.context.newPage();
  await page.addInitScript(HOLD_SCRIPT);
  await input.settle(page, input.entry);
  parseRows(await page.evaluate(COLLECT_SCRIPT));
  const order = Order.parse(await page.evaluate(MOTION_SECTIONS_SCRIPT));
  return { page, order };
}

// Кадры одной секции или `null`: секции не видно, анимаций у неё нет (кадры были бы одинаковые), она ниже экрана нулевой высоты.
async function shootSection(
  page: Page,
  viewport: Viewport,
  id: string,
  quality: number,
): Promise<MotionSectionShots | null> {
  try {
    const place = Place.parse(await page.evaluate(motionBeginScript(id)));
    if (place === null) return null;
    const x = Math.max(0, Math.floor(place.x));
    const y = Math.max(0, Math.floor(place.y));
    const width = Math.min(viewport.width - x, Math.ceil(place.width));
    const height = Math.min(MOTION_FRAME_MAX_HEIGHT, viewport.height - y, Math.ceil(place.height));
    if (width < 1 || height < MIN_FRAME_HEIGHT) return null;
    const frames: Uint8Array[] = [];
    for (const at of MOTION_FRAME_TIMES) {
      await page.evaluate(motionSetScript(id, at));
      frames.push(await page.screenshot({ type: 'jpeg', quality, animations: 'allow', clip: { x, y, width, height } }));
    }
    return { section: id, type: place.type, frames };
  } finally {
    await page.evaluate(MOTION_END_SCRIPT);
  }
}

async function capture(
  opened: Opened,
  input: MotionRunnerInput,
  sections: number,
  quality: number,
): Promise<MotionCapture> {
  if (!input.html.ok) return { ok: false, reason: input.html.reason };
  const shots: MotionSectionShots[] = [];
  for (const id of opened.order) {
    if (shots.length >= sections) break;
    const shot = await shootSection(opened.page, input.viewport, id, quality);
    if (shot !== null) shots.push(shot);
  }
  // Список — после кадров: вход в экран мог создать анимации, которых мелкая прокрутка не задела.
  const rows = parseRows(await opened.page.evaluate(REFRESH_SCRIPT));
  // Секции с конечными анимациями, которым кадров не досталось (лимит или их не видно).
  const shot = new Set(shots.map((entry) => entry.section));
  const animated = new Set(rows.flatMap((row) => (row.section === null || row.loop ? [] : [row.section])));
  const skipped = [...animated].filter((id) => !shot.has(id)).length;
  return { ok: true, revealForced: input.html.revealForced, animations: groupAnimations(rows), shots, skipped };
}

export function motionRunner(input: MotionRunnerInput): PageSession['motion'] {
  let opened: Promise<Opened> | undefined;
  return async ({ sections, quality }) => {
    if (!input.html.ok) return { ok: false, reason: input.html.reason };
    opened ??= openMotionPage(input);
    return capture(await opened, input, sections, quality);
  };
}
