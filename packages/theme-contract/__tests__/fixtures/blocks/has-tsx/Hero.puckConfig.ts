import { z } from 'zod';
export const HeroSchema = z.object({ title: z.string() });
export const HeroPuckConfig = {
  label: 'Hero', category: 'hero' as const,
  fields: { title: { type: 'text', label: 'Title' } },
  defaults: { title: '' },
  schema: HeroSchema,
};
