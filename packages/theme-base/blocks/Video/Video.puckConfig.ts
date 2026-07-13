import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const VideoSchema = z.object({
  heading: z.string(),
  // Подзаголовок (Figma-борд Video). Видимый top-level aiText — зеркалит
  // `heading`. Рендерится строкой <p> под <h2>. Дефолт пустой →
  // ничего не рендерится (default-preserving).
  subheading: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingEnabled: z.enum(['true', 'false']).optional(),
  videoUrl: z.string(),
  poster: z.string(),
  position: z.enum(['window', 'fullscreen']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Whether the video media has
   * horizontal padding (container max-width). Default `true` keeps the
   * pre-084 contained layout identical. `false` removes the container
   * wrapper without changing aspect ratio.
   */
  padded: z.boolean().optional(),
  /**
   * 084 vanilla pilot — additive variant. Container vs. fullbleed
   * alignment. Default `container` preserves pre-084 max-width clamp.
   * `fullbleed` removes the clamp so video spans the viewport.
   */
  align: z.enum(['container', 'fullbleed']).optional(),
  // «Размер» — ВЫСОТА медиа-блока (small короче 21:9 / medium 16:9 дефолт /
  // large выше 4:3). Раньше `size` ошибочно управлял кеглем <h2> — исправлено:
  // теперь это высота, а кегль заголовка приходит из `content.heading.size`
  // (панель конструктора «Размер заголовка» пишет именно туда).
  size: z.enum(['small', 'medium', 'large']).optional(),
  overlay: z.number().int().min(0).max(100).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type VideoProps = z.infer<typeof VideoSchema>;

export interface VideoStoredInput {
  heading?: unknown;
  headingSize?: unknown;
  headingAlignment?: unknown;
  headingEnabled?: unknown;
  subheading?: unknown;
  videoUrl?: unknown;
  poster?: unknown;
  video?: unknown;
  position?: unknown;
  padded?: unknown;
  align?: unknown;
  size?: unknown;
  overlay?: unknown;
  content?: unknown;
  colorScheme?: unknown;
  padding?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function normalizeVideoStoredProps(input: unknown): VideoProps | unknown {
  if (!isRecord(input)) return input;
  const raw = input as VideoStoredInput;
  const video = isRecord(raw.video) ? raw.video : undefined;
  const content = isRecord(raw.content) ? raw.content : undefined;
  const legacyHeading = isRecord(content?.heading) ? content.heading : undefined;
  const legacySubheading = isRecord(content?.subheading) ? content.subheading : undefined;
  const heading = typeof raw.heading === 'string' && raw.heading.trim()
    ? raw.heading
    : typeof legacyHeading?.text === 'string' ? legacyHeading.text : '';
  const headingSize = raw.headingSize ?? legacyHeading?.size;
  const videoUrl = resolveVideoUrl({ videoUrl: raw.videoUrl, video });
  const poster = typeof raw.poster === 'string'
    ? raw.poster
    : typeof video?.coverImage === 'string' ? video.coverImage : '';
  return {
    heading,
    headingSize: headingSize === 'small' || headingSize === 'large' ? headingSize : 'medium',
    ...(raw.headingAlignment === 'left' || raw.headingAlignment === 'center' || raw.headingAlignment === 'right'
      ? { headingAlignment: raw.headingAlignment }
      : legacyHeading?.alignment === 'left' || legacyHeading?.alignment === 'center' || legacyHeading?.alignment === 'right'
        ? { headingAlignment: legacyHeading.alignment }
        : {}),
    headingEnabled: String(raw.headingEnabled ?? legacyHeading?.enabled ?? 'true') === 'false' ? 'false' : 'true',
    subheading: legacySubheading?.enabled === 'false'
      ? ''
      : typeof raw.subheading === 'string' ? raw.subheading : typeof legacySubheading?.text === 'string' ? legacySubheading.text : '',
    videoUrl,
    poster,
    position: raw.position === 'fullscreen' ? 'fullscreen' : 'window',
    ...(typeof raw.padded === 'boolean' ? { padded: raw.padded } : {}),
    ...(raw.align === 'container' || raw.align === 'fullbleed' ? { align: raw.align } : {}),
    ...(raw.size === 'small' || raw.size === 'medium' || raw.size === 'large' ? { size: raw.size } : {}),
    ...(typeof raw.overlay === 'number' ? { overlay: raw.overlay } : {}),
    ...(typeof raw.colorScheme === 'string' ? { colorScheme: raw.colorScheme } : {}),
    padding: isRecord(raw.padding) ? raw.padding : { top: 80, bottom: 80 },
  };
}

export const VideoStoredSchema: z.ZodType<VideoProps, z.ZodTypeDef, unknown> =
  z.preprocess(normalizeVideoStoredProps, VideoSchema);

export const VideoPuckConfig: BlockPuckConfig<VideoProps> = {
  label: 'Видео',
  category: 'media',
  // Figma 314-35082: Добавить видео (file upload) / Положение видео (toggle) /
  // Содержание (header) / Заголовок (aiText) / Размер заголовка (кегль <h2>) /
  // Цветовая схема / Отступы. Legacy size/subheading remain hidden in data.
  fields: {
    videoUrl: { type: 'video', label: 'Добавить видео' } as any,
    position: {
      type: 'radio',
      label: 'Положение видео',
      options: [
        { label: 'На весь экран', value: 'fullscreen' },
        { label: 'Окно', value: 'window' },
      ],
    },
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    heading: {
      type: 'aiText',
      label: 'Заголовок',
      fieldType: 'title',
      placeholder: 'Ввести текст...',
    } as any,
    headingSize: {
      type: 'select',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — нет в Figma 314-35082.
    subheading: { type: 'hidden', label: '' } as any,
    size: { type: 'hidden', label: '' } as any,
    poster: { type: 'hidden', label: '' },
    padded: { type: 'hidden', label: '' },
    align: { type: 'hidden', label: '' },
    overlay: { type: 'hidden', label: '' },
    headingAlignment: { type: 'hidden', label: '' },
    headingEnabled: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: '',
    headingSize: 'medium',
    subheading: '',
    videoUrl: '',
    poster: '',
    position: 'window',
    padding: { top: 80, bottom: 80 },
  },
  schema: VideoSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

export function resolveVideoHeadingSize(raw: {
  headingSize?: unknown;
  content?: { heading?: { size?: unknown } };
}): 'small' | 'medium' | 'large' {
  const value = raw.headingSize ?? raw.content?.heading?.size;
  return value === 'small' || value === 'medium' || value === 'large' ? value : 'medium';
}

export function resolveVideoUrl(raw: {
  videoUrl?: unknown;
  video?: { url?: unknown };
}): string {
  const value = typeof raw.videoUrl === 'string' && raw.videoUrl.length > 0
    ? raw.videoUrl
    : typeof raw.video?.url === 'string'
      ? raw.video.url
      : '';
  return value.startsWith('blob:') ? '' : value;
}

export function resolveVideoPosition(value: unknown): 'window' | 'fullscreen' {
  return value === 'fullscreen' ? 'fullscreen' : 'window';
}
