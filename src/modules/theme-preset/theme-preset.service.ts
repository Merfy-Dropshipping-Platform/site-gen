/**
 * ThemePresetService — manages theme presets (CRUD + apply-to-site).
 *
 * Responsibilities:
 * 1. List active presets (for admin theme gallery).
 * 2. Get full preset by id (for "preview" before apply).
 * 3. Apply preset to a site: copy content into a new site_revision, seed
 *    customTokens, emit audit trail via siteThemeMigrations.
 * 4. Seed presets from committed JSON files on boot (idempotent upsert).
 */
import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

import { PG_CONNECTION } from '../../constants';
import * as schema from '../../db/schema';
import {
  ApplyThemeResult,
  ThemePreset,
  ThemePresetSchema,
  ThemePresetSummary,
} from './theme-preset.schema';

@Injectable()
export class ThemePresetService {
  private readonly logger = new Logger(ThemePresetService.name);

  /** Directory with seed presets — resolved from cwd (sites service root). */
  private readonly seedDir = resolve(process.cwd(), 'seed/theme-presets');

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** List active presets — lightweight summary (no large content/tokens). */
  async list(): Promise<ThemePresetSummary[]> {
    const rows = await this.db
      .select({
        id: schema.theme.id,
        name: schema.theme.name,
        slug: schema.theme.slug,
        description: schema.theme.description,
        previewDesktop: schema.theme.previewDesktop,
        previewMobile: schema.theme.previewMobile,
        templateId: schema.theme.templateId,
        price: schema.theme.price,
        tags: schema.theme.tags,
        badge: schema.theme.badge,
        author: schema.theme.author,
        isActive: schema.theme.isActive,
        fontsPreload: schema.theme.fontsPreload,
      })
      .from(schema.theme)
      .where(eq(schema.theme.isActive, true));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description ?? undefined,
      previewDesktop: r.previewDesktop ?? undefined,
      previewMobile: r.previewMobile ?? undefined,
      templateId: r.templateId,
      price: r.price ?? 0,
      tags: (r.tags as string[] | null) ?? [],
      badge: r.badge ?? undefined,
      author: r.author ?? 'merfy',
      isActive: r.isActive ?? true,
      fontsPreload: (r.fontsPreload as string[] | null) ?? [],
    }));
  }

  /** Get full preset (content + tokens) — heavier response. */
  async get(id: string): Promise<ThemePreset> {
    const [row] = await this.db.select().from(schema.theme).where(eq(schema.theme.id, id)).limit(1);
    if (!row) throw new NotFoundException(`Theme preset "${id}" not found`);
    if (!row.content || !row.tokens) {
      throw new BadRequestException(
        `Theme "${id}" exists but has no preset data (content/themeSettings missing). Re-run seed migration.`,
      );
    }
    return {
      id: row.id,
      presetVersion: row.presetVersion ?? 1,
      name: row.name,
      slug: row.slug,
      description: row.description ?? undefined,
      previewDesktop: row.previewDesktop ?? undefined,
      previewMobile: row.previewMobile ?? undefined,
      templateId: row.templateId,
      price: row.price ?? 0,
      tags: (row.tags as string[] | null) ?? [],
      badge: row.badge ?? undefined,
      author: row.author ?? 'merfy',
      isActive: row.isActive ?? true,
      // `theme.tokens` column stores themeSettings (constructor shape) —
      // legacy column name kept for backward compatibility with Phase 2e DB.
      themeSettings: row.tokens as Record<string, unknown>,
      content: row.content as Record<string, unknown>,
      fontsPreload: (row.fontsPreload as string[] | null) ?? [],
    };
  }

  /**
   * Apply preset to a site:
   * 1. Transactional: update site.themeId, site.customTokens, create new revision
   * 2. Write audit row in site_theme_migrations
   * 3. Mark site needsRebuild
   *
   * `replaceContent`:
   *   - true (default): new revision data = preset content (tenant's edits replaced)
   *   - false: only tokens applied, revision unchanged (useful when tenant wants
   *     the same layout with a new color scheme)
   */
  async applyToSite(
    siteId: string,
    presetId: string,
    opts: { replaceContent?: boolean; actorId?: string } = {},
  ): Promise<ApplyThemeResult> {
    const { replaceContent = true, actorId } = opts;
    const warnings: string[] = [];

    const preset = await this.get(presetId);
    const [site] = await this.db.select().from(schema.site).where(eq(schema.site.id, siteId)).limit(1);
    if (!site) throw new NotFoundException(`Site "${siteId}" not found`);

    const fromTheme = site.themeId ?? 'none';
    const fromVersion = site.themeVersion ?? '1';

    let newRevisionId: string | undefined;

    await this.db.transaction(async (tx) => {
      if (replaceContent) {
        newRevisionId = randomUUID();
        // Preset JSON stores Puck-native single-page shape ({ root, content[], zones }).
        // The constructor/preview/build pipeline use multi-page shape
        // ({ currentPageId, pages, pagesData: { <pageId>: { content: [...] } } }).
        // Wrap preset content into the canonical multi-page shape; keep
        // themeSettings merged at root.
        const presetContent = preset.content as {
          root?: unknown;
          content?: unknown;
          zones?: unknown;
          themeSettings?: object;
        };
        const mergedThemeSettings = {
          ...(presetContent.themeSettings ?? {}),
          ...(preset.themeSettings as object),
        };
        const contentWithSettings = 'pagesData' in presetContent
          ? {
              ...(presetContent as Record<string, unknown>),
              themeSettings: mergedThemeSettings,
            }
          : {
              currentPageId: 'home',
              pages: [{ id: 'home', name: 'Главная', slug: '/' }],
              pagesData: {
                home: {
                  content: Array.isArray(presetContent.content)
                    ? presetContent.content
                    : [],
                  root: presetContent.root ?? { props: {} },
                  zones: presetContent.zones ?? {},
                },
              },
              themeSettings: mergedThemeSettings,
            };
        await tx.insert(schema.siteRevision).values({
          id: newRevisionId,
          siteId,
          data: contentWithSettings,
          meta: {
            source: 'theme-preset',
            presetId,
            presetVersion: preset.presetVersion,
            actorId,
          },
          createdAt: new Date(),
        });
      }

      await tx
        .update(schema.site)
        .set({
          themeId: presetId,
          // customTokens column kept for future use but not populated here —
          // single source of truth is revision.data.themeSettings (see above).
          currentRevisionId: newRevisionId ?? site.currentRevisionId,
          needsRebuild: true,
          updatedAt: new Date(),
          updatedBy: actorId ?? null,
        })
        .where(eq(schema.site.id, siteId));

      await tx.insert(schema.siteThemeMigrations).values({
        id: randomUUID(),
        siteId,
        fromTheme,
        fromVersion,
        toTheme: presetId,
        toVersion: String(preset.presetVersion),
        report: {
          replaceContent,
          newRevisionId,
          actorId,
          timestamp: new Date().toISOString(),
        },
      });
    });

    this.logger.log(
      `Applied preset "${presetId}" to site "${siteId}" (revision=${newRevisionId ?? 'kept'})`,
    );
    return { success: true, siteId, themeId: presetId, newRevisionId, warnings };
  }

  /**
   * Seed presets from `seed/theme-presets/<id>.json` files.
   * Idempotent — upserts by id. Preserves `viewCount` and other tenant-facing
   * fields. Preset creator should re-run this via CLI (`pnpm sites:seed-presets`)
   * or on bootstrap.
   */
  async seedFromFiles(): Promise<{ loaded: number; skipped: string[]; errors: string[] }> {
    const skipped: string[] = [];
    const errors: string[] = [];
    let loaded = 0;

    if (!existsSync(this.seedDir)) {
      return { loaded: 0, skipped, errors: [`seed dir ${this.seedDir} not found`] };
    }

    const files = readdirSync(this.seedDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const path = resolve(this.seedDir, file);
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        const preset = ThemePresetSchema.parse(raw);

        const existing = await this.db
          .select({ id: schema.theme.id })
          .from(schema.theme)
          .where(eq(schema.theme.id, preset.id))
          .limit(1);

        if (existing.length > 0) {
          await this.db
            .update(schema.theme)
            .set({
              name: preset.name,
              slug: preset.slug,
              description: preset.description ?? null,
              previewDesktop: preset.previewDesktop ?? null,
              previewMobile: preset.previewMobile ?? null,
              templateId: preset.templateId,
              price: preset.price,
              tags: preset.tags,
              badge: preset.badge ?? null,
              author: preset.author,
              isActive: preset.isActive,
              tokens: preset.themeSettings as object,
              content: preset.content as object,
              fontsPreload: preset.fontsPreload,
              presetVersion: preset.presetVersion,
              updatedAt: new Date(),
            })
            .where(eq(schema.theme.id, preset.id));
        } else {
          await this.db.insert(schema.theme).values({
            id: preset.id,
            name: preset.name,
            slug: preset.slug,
            description: preset.description ?? null,
            previewDesktop: preset.previewDesktop ?? null,
            previewMobile: preset.previewMobile ?? null,
            templateId: preset.templateId,
            price: preset.price,
            tags: preset.tags,
            badge: preset.badge ?? null,
            author: preset.author,
            viewCount: 0,
            isActive: preset.isActive,
            tokens: preset.themeSettings as object,
            content: preset.content as object,
            fontsPreload: preset.fontsPreload,
            presetVersion: preset.presetVersion,
          });
        }

        loaded++;
        this.logger.log(`Seeded preset "${preset.id}" from ${file}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file}: ${msg}`);
        this.logger.warn(`Skipped ${file}: ${msg}`);
        skipped.push(file);
      }
    }

    return { loaded, skipped, errors };
  }
}
