import { z } from 'zod';
import { TOKEN_REGISTRY, type TokenKey } from '../tokens/registry';

const TokenKeySchema = z.string().refine(
  (k): k is TokenKey => k in TOKEN_REGISTRY,
  (k) => ({ message: `Unknown token "${k}". Must be in TOKEN_REGISTRY.` }),
);

const TokensMapSchema = z.record(TokenKeySchema, z.string());

const ColorSchemeSchema = z.object({
  id: z.string().regex(/^scheme-\d+$/),
  name: z.string().min(1),
  tokens: TokensMapSchema,
});

const BlockOverrideSchema = z.object({
  path: z.string().regex(/^\.\//),
  reason: z.string().min(5),
});

const BlockConfigSchema = z.union([
  z.object({ override: BlockOverrideSchema }).strict(),
  z.object({
    variant: z.string().optional(),
    constraints: z.record(z.string(), z.unknown()).optional(),
  }).strict(),
]);

const CustomBlockSchema = z.object({
  path: z.string().regex(/^\.\//),
  requiredFeatures: z.array(z.string()).optional(),
});

const FontSpecSchema = z.object({
  family: z.string(),
  weights: z.array(z.number().int()),
  italic: z.boolean().optional(),
  source: z.union([
    z.literal('google'),
    z.literal('self-hosted'),
    z.string().regex(/^\.\//),
  ]),
});

const ConstraintsSchema = z.object({
  maxSections: z.number().int().positive().optional(),
  maxSlidesInSlideshow: z.number().int().positive().optional(),
  minColumnsCollections: z.number().int().positive().optional(),
  maxColumnsCollections: z.number().int().positive().optional(),
}).catchall(z.number());

const SeoSchema = z.object({
  titleTemplate: z.string().optional(),
  defaultDescription: z.string().optional(),
  defaultOgImage: z.string().optional(),
  socialHandles: z.record(z.string(), z.string()).optional(),
  yandexMarketFeed: z.boolean().optional(),
}).optional();

export const ThemeManifestSchema = z.object({
  $schema: z.string().optional(),
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be kebab-case lowercase'),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, 'version must be semver'),
  extends: z.string().regex(/^@merfy\/theme-base@/),
  category: z.enum(['fashion', 'electronics', 'food', 'digital', 'general', 'beauty', 'home', 'sports']).optional(),
  description: z.string().max(500).optional(),
  author: z.string().optional(),
  preview: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
  tokens: z.string().optional(),
  defaults: TokensMapSchema,
  colorSchemes: z.array(ColorSchemeSchema).min(1).max(4),
  blocks: z.record(z.string(), BlockConfigSchema),
  customBlocks: z.record(z.string(), CustomBlockSchema).optional(),
  features: z.record(z.string(), z.boolean()),
  constraints: ConstraintsSchema.optional(),
  fonts: z.array(FontSpecSchema),
  socialLinks: z.record(z.string(), z.string().url().nullable()).optional(),
  seo: SeoSchema,
});

export type ThemeManifest = z.infer<typeof ThemeManifestSchema>;
