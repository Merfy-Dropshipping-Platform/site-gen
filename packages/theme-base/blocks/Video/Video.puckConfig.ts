import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const VideoSchema = z.object({
  heading: z.string(),
  videoUrl: z.string(),
  poster: z.string(),
  /**
   * `contained` clamps the media to max-width (Figma vanilla — video with
   * scheme-1 dark olive padding around). `fullscreen` = edge-to-edge.
   */
  position: z.enum(['contained', 'fullscreen']).optional(),
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
      label: 'Размер',
      options: [
        { label: 'В контейнере', value: 'contained' },
        { label: 'На всю ширину', value: 'fullscreen' },
      ],
    },
    padding: { type: 'object', label: 'Отступы' },
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
