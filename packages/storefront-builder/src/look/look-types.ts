// Снимок черновика: общие типы (перенесено 28.10 из merfy-mcp `src/nova/look-types.ts`). Отрисовщик (Chromium) стоит за
// интерфейсом `PageRenderer`: логика задания (`look-job.ts`, `look-fit.ts`) от браузера не зависит и проверяется подменой.

export type LookDevice = 'mobile' | 'desktop';

export interface Viewport {
  width: number;
  height: number;
}

// Размеры экранов из задачи Т1 (IMPECCABLE.md, 28.10): телефон 390×844, компьютер 1440×900.
export const VIEWPORTS: Record<LookDevice, Viewport> = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

// Факты о странице, измеренные в браузере после загрузки и прокрутки до конца.
export interface PageFacts {
  // Высота страницы в пикселях.
  pageHeight: number;
  // Картинки, которые не загрузились.
  brokenImages: number;
  // Сообщения об ошибках в консоли страницы (все; сколько показать, решает потребитель).
  consoleErrors: string[];
  // Ширина содержимого больше ширины экрана: страница прокручивается вбок.
  sideScroll: boolean;
}

// Одна находка детектора Impeccable, как её отдаёт страница.
export interface DetectorFinding {
  // Правило детектора (`gradient-text`).
  rule: string;
  name: string;
  detail: string;
}

// Место на снимке: прямоугольник в пикселях страницы (от левого верхнего угла документа).
export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Коды проверок вёрстки (28.10), в порядке важности: по нему отбираются находки и вырезки. Правила и пороги — в
// `browser/layout-checks.js`. `overflow-x`, `columns-many`, `tap-small`, `text-small` запускаются только на телефоне.
export const LAYOUT_CODES = [
  'row-unequal',
  'row-not-filling',
  'overflow-x',
  'text-clipped',
  'overlap',
  'image-distorted',
  'columns-many',
  'tap-small',
  'text-small',
] as const;
export type LayoutCode = (typeof LAYOUT_CODES)[number];

// Находка проверки вёрстки, как её отдаёт страница. `clip` — место на странице, уже с полями и обрезанное по экрану;
// `mark` — номер, по которому страница обводит элементы находки на время снимка вырезки; `fixed` — место прибито к
// экрану (баннер, плавающая кнопка): координаты `clip` тогда от экрана, и вырезка снимается без прокрутки.
export interface LayoutFinding {
  code: LayoutCode;
  section: string | null;
  text: string;
  clip: Clip;
  mark: number;
  fixed: boolean;
}

// Находка в ответе снимка. Источники: детектор Impeccable (`section`, `clip` и `image` у него null) и проверки вёрстки
// (`layout`). `section` — id экземпляра секции на странице (`data-section-id`, как в `merfy_pages · outline`), `clip` —
// прямоугольник места в пикселях страницы, `image` — вырезка этого места, JPEG в base64 (есть не у каждой находки: не
// больше `MAX_CLIPS` на ответ).
export interface LookFinding {
  source: 'impeccable' | 'layout';
  code: string;
  name: string;
  text: string;
  device: LookDevice;
  section: string | null;
  clip: Clip | null;
  image: string | null;
}

// Одна страница в браузере на одном размере экрана. Живёт до `RenderedPage.close()`.
export interface PageSession {
  device: LookDevice;
  viewport: Viewport;
  facts: PageFacts;
  // JPEG экрана с номером `index` (с нуля): страница прокручивается на `index` высот экрана.
  shoot(index: number, quality: number): Promise<Uint8Array>;
  // Детектор Impeccable на отрисованной странице. Вызывается после снимков.
  detect(): Promise<DetectorFinding[]>;
  // Проверки вёрстки на отрисованной странице (`look-layout.ts`). Ничего на странице не меняют.
  layout(): Promise<LayoutFinding[]>;
  // JPEG места находки: страница прокручивается к `finding.clip`, элементы находки обводятся.
  shootClip(finding: LayoutFinding, quality: number): Promise<Uint8Array>;
}

export interface RenderedPage {
  sessions: PageSession[];
  // Закрывает страницы и освобождает место в очереди отрисовок.
  close(): Promise<void>;
}

export interface RenderInput {
  // HTML превью страницы целиком, как его отдаёт sites.
  html: string;
  devices: LookDevice[];
  // Срок на эту отрисовку, мс: не больше срока отрисовщика; меньше — когда задание долго шло до процесса.
  timeoutMs?: number;
}

export interface PageRenderer {
  open(input: RenderInput): Promise<RenderedPage>;
}

// Отрисовка не удалась по понятной мерчанту причине: текст идёт в ответ как есть.
export class LookError extends Error {
  readonly code: 'timeout' | 'no-browser';

  constructor(code: 'timeout' | 'no-browser', message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LookError';
    this.code = code;
  }
}
