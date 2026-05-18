import { z } from 'zod';
export const HeroSchema = z.object({ heading: z.string().optional() });
export const HeroPuckConfig = {
  label: 'Главный экран',
  category: 'media',
  paletteOrder: 10,
  defaultProps: { heading: 'Welcome' },
};
