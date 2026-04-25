import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const VideoSchema = z.object({
  heading: z.string(),
  videoUrl: z.string(),
  poster: z.string(),
  position: z.enum(['contained', 'fullscreen']).optional(),
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
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    videoUrl: { type: 'text', label: 'Ссылка на видео (YouTube / Vimeo / MP4)' },
    poster: { type: 'text', label: 'Постер (URL)' },
    position: {
      type: 'radio',
      label: 'Положение',
      options: [
        { label: 'В контейнере', value: 'contained' },
        { label: 'На всю ширину', value: 'fullscreen' },
      ],
    },
    size: {
      type: 'radio',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    overlay: { type: 'slider', label: 'Затемнение', min: 0, max: 100, step: 5 },
    video: {
      type: 'object',
      label: 'Видео',
      objectFields: {
        url: { type: 'text', label: 'URL' },
      },
    },
    content: {
      type: 'object',
      label: 'Содержимое',
      objectFields: {
        heading: {
          type: 'object',
          label: 'Заголовок',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
            alignment: { type: 'alignment', label: 'Выравнивание' },
            enabled: {
              type: 'radio',
              label: 'Показывать',
              options: [
                { label: 'Да', value: 'true' },
                { label: 'Нет', value: 'false' },
              ],
            },
            size: {
              type: 'radio',
              label: 'Размер',
              options: [
                { label: 'Маленький', value: 'small' },
                { label: 'Средний', value: 'medium' },
                { label: 'Большой', value: 'large' },
              ],
            },
          },
        },
      },
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: '',
    videoUrl: '',
    poster: '',
    position: 'contained',
    padding: { top: 80, bottom: 80 },
  },
  schema: VideoSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
