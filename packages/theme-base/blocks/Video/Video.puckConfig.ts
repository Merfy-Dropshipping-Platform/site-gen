import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const VideoSchema = z.object({
  heading: z.string(),
  // Подзаголовок (Figma-борд Video). Видимый top-level aiText — зеркалит
  // `heading`. Рендерится строкой <p> под <h2>. Дефолт пустой →
  // ничего не рендерится (default-preserving).
  subheading: z.string().optional(),
  videoUrl: z.string(),
  poster: z.string(),
  position: z.enum(['contained', 'fullscreen']).optional(),
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
  // Pupa parity.
  size: z.enum(['small', 'medium', 'large']).optional(),
  overlay: z.number().int().min(0).max(100).optional(),
  video: z.object({ url: z.string() }).optional(),
  content: z.object({
    heading: z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      enabled: z.enum(['true', 'false']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }).optional(),
    // Подзаголовок-envelope (Figma-борд Video). Рендер читает
    // content.subheading.text при enabled !== 'false'. Top-level
    // `subheading` остаётся каноном для видимого aiText.
    subheading: z.object({
      text: z.string().optional(),
      enabled: z.enum(['true', 'false']).optional(),
    }).optional(),
  }).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type VideoProps = z.infer<typeof VideoSchema>;

export const VideoPuckConfig: BlockPuckConfig<VideoProps> = {
  label: 'Видео',
  category: 'media',
  // Figma 314-35082: Добавить видео (file upload) / Положение видео (toggle) /
  // Содержание (header) / Заголовок (aiText) / Размер заголовка /
  // Цветовая схема / Отступы.
  fields: {
    videoUrl: { type: 'video', label: 'Добавить видео' } as any,
    position: {
      type: 'radio',
      label: 'Положение видео',
      options: [
        { label: 'На весь экран', value: 'fullscreen' },
        { label: 'Окно', value: 'contained' },
      ],
    },
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    heading: {
      type: 'aiText',
      label: 'Заголовок',
      fieldType: 'title',
      placeholder: 'Ввести текст...',
    } as any,
    subheading: {
      type: 'aiText',
      label: 'Подзаголовок',
      fieldType: 'description',
      placeholder: 'Ввести текст...',
    } as any,
    size: {
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
    poster: { type: 'hidden', label: '' },
    padded: { type: 'hidden', label: '' },
    align: { type: 'hidden', label: '' },
    overlay: { type: 'hidden', label: '' },
    video: { type: 'hidden', label: '' },
    content: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: '',
    subheading: '',
    videoUrl: '',
    poster: '',
    position: 'contained',
    headingSize: 'medium',
    headingAlignment: 'left',
    padding: { top: 80, bottom: 80 },
  },
  schema: VideoSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
