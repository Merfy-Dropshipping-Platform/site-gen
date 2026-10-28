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

// Находка в ответе снимка. Сейчас источник один — детектор Impeccable; сюда же лягут проверки вёрстки (карточки разной
// высоты и т. п.) со своим `source`. `section` — имя экземпляра секции на странице, `clip` — вырезка места на снимке;
// у детектора их пока нет (null), проверки вёрстки будут заполнять.
export interface LookFinding {
  source: 'impeccable';
  code: string;
  name: string;
  text: string;
  device: LookDevice;
  section: string | null;
  clip: Clip | null;
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
