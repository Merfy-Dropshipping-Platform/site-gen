/**
 * Build Pipeline — orchestrates the full site generation pipeline.
 *
 * 7 stages:
 * 1. merge    — load revision (Puck JSON) + site data from DB, merge with theme defaults
 * 2. generate — scaffold Astro project (pages, tokens, configs)
 * 3. fetch_data — fetch products/collections from product-service via RPC
 * 4. astro_build — run `npm install && astro build` in the scaffolded project
 * 5. zip      — zip the built dist/ directory
 * 6. upload   — upload artifact + static files to S3/MinIO
 * 7. deploy   — mark build as complete, trigger deploy if needed
 *
 * Each stage updates site_build.status and emits progress events via RabbitMQ.
 */
import { Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import * as path from "path";
import * as fs from "fs/promises";
import { spawn } from "child_process";
import archiver from "archiver";
import { randomUUID } from "crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import type * as schemaTypes from "../db/schema";
import { fetchStoreData, type FetchedStoreData } from "./data-fetcher";
import {
  buildScaffold,
  type ScaffoldConfig,
  type PageEntry,
} from "./scaffold-builder";
import type { ComponentRegistryEntry } from "./page-generator";
import {
  themeRegistryToGeneratorRegistry,
  themeSettingsToMerchantSettings,
  type ThemeRegistryEntry,
  type ThemeSettingsGroup,
  type ThemeColorScheme,
  type ThemeFeatures,
} from "./theme-bridge";
import { S3StorageService } from "../storage/s3.service";
import { roseRegistry, roseServerRegistry } from "./registries/rose";

const logger = new Logger("BuildPipeline");

/** Build stages in order */
export const BUILD_STAGES = [
  "merge",
  "generate",
  "fetch_data",
  "astro_build",
  "zip",
  "upload",
  "deploy",
] as const;

export type BuildStage = (typeof BUILD_STAGES)[number];

/** Percentage progress per stage completion */
const STAGE_PERCENT: Record<BuildStage, number> = {
  merge: 10,
  generate: 25,
  fetch_data: 40,
  astro_build: 70,
  zip: 80,
  upload: 90,
  deploy: 100,
};

/** Context passed through the pipeline */
interface BuildContext {
  buildId: string;
  siteId: string;
  tenantId: string;
  mode: "draft" | "production";
  /** Loaded from DB */
  revisionId: string;
  revisionData: Record<string, unknown>;
  revisionMeta: Record<string, unknown>;
  templateId: string;
  publicUrl: string | null;
  /** Set during pipeline */
  workingDir: string;
  artifactsDir: string;
  distDir: string;
  artifactPath: string;
  artifactUrl: string;
  storeData: FetchedStoreData;
  /** Whether the site uses server-island smart revalidation */
  islandsEnabled: boolean;
  /** Branding overrides (logo, colors) from site table */
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string };
}

/** Dependencies injected into the pipeline */
export interface BuildDependencies {
  db: NodePgDatabase<typeof schemaTypes>;
  schema: typeof schemaTypes;
  productClient: ClientProxy;
  s3: S3StorageService;
  eventsEmit?: (pattern: string, payload: unknown) => void;
}

export interface BuildParams {
  tenantId: string;
  siteId: string;
  mode?: "draft" | "production";
  templateOverride?: string;
  /** Component registry for page generation (pre-converted generator format) */
  registry?: Record<string, ComponentRegistryEntry>;
  /** Theme registry entries (raw theme format — will be converted via theme-bridge) */
  themeRegistry?: ThemeRegistryEntry[];
  /** Theme feature flags for component filtering */
  themeFeatures?: ThemeFeatures;
  /** Theme settings schema for token generation */
  themeSettingsSchema?: ThemeSettingsGroup[];
  /** Theme color schemes */
  themeColorSchemes?: ThemeColorScheme[];
}

export interface BuildResult {
  buildId: string;
  revisionId: string;
  artifactUrl: string;
}

/**
 * Emit a progress event (best-effort) and persist to DB.
 */
function emitProgress(
  deps: BuildDependencies,
  ctx: Pick<BuildContext, "buildId" | "siteId">,
  stage: BuildStage,
  message: string,
): void {
  const percent = STAGE_PERCENT[stage];
  deps.eventsEmit?.("sites.build.progress", {
    buildId: ctx.buildId,
    siteId: ctx.siteId,
    percent,
    stage,
    message,
  });

  // Persist progress to DB (best-effort, don't block pipeline)
  deps.db
    .update(deps.schema.siteBuild)
    .set({ stage, percent, message })
    .where(eq(deps.schema.siteBuild.id, ctx.buildId))
    .catch((e) => logger.warn(`Failed to persist build progress: ${e}`));
}

/**
 * Update build status in the database.
 */
async function updateBuildStatus(
  deps: BuildDependencies,
  buildId: string,
  status: "queued" | "running" | "failed" | "uploaded",
  extra?: { error?: string; artifactUrl?: string; logUrl?: string },
): Promise<void> {
  const set: Record<string, unknown> = { status };
  if (extra?.error) set.error = extra.error;
  if (extra?.artifactUrl) set.artifactUrl = extra.artifactUrl;
  if (extra?.logUrl) set.logUrl = extra.logUrl;
  if (status === "running") {
    set.startedAt = new Date();
  }
  if (status === "uploaded" || status === "failed") {
    set.completedAt = new Date();
  }

  await deps.db
    .update(deps.schema.siteBuild)
    .set(set)
    .where(eq(deps.schema.siteBuild.id, buildId));
}

/**
 * Run a shell command in a directory and return stdout.
 */
function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 300_000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production" },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

/**
 * Zip a directory into a .zip file.
 */
async function zipDirectory(srcDir: string, outZipPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outZipPath), { recursive: true });
  const archive = archiver("zip", { zlib: { level: 1 } });
  const stream = (await fs.open(outZipPath, "w")).createWriteStream();
  return new Promise<void>((resolve, reject) => {
    archive.directory(srcDir, false).on("error", reject).pipe(stream);
    stream.on("close", () => resolve());
    archive.finalize().catch(reject);
  });
}

/**
 * Execute the full 7-stage build pipeline.
 */
export async function runBuildPipeline(
  deps: BuildDependencies,
  params: BuildParams,
): Promise<BuildResult> {
  const buildId = randomUUID();
  const now = new Date();
  const { schema } = deps;

  // Create initial build record (queued)
  await deps.db.insert(schema.siteBuild).values({
    id: buildId,
    siteId: params.siteId,
    revisionId: "", // updated in merge stage
    status: "queued",
    createdAt: now,
  });

  // Prepare working directories
  const workingDir = path.join(
    process.cwd(),
    ".astro-builds",
    params.siteId,
    buildId,
  );
  const artifactsDir = path.join(process.cwd(), "artifacts", params.siteId);
  await fs.mkdir(workingDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  const ctx: BuildContext = {
    buildId,
    siteId: params.siteId,
    tenantId: params.tenantId,
    mode: params.mode ?? "draft",
    revisionId: "",
    revisionData: {},
    revisionMeta: {},
    templateId: "default",
    publicUrl: null,
    workingDir,
    artifactsDir,
    distDir: path.join(workingDir, "dist"),
    artifactPath: path.join(artifactsDir, `${buildId}.zip`),
    artifactUrl: "",
    storeData: { products: [], collections: [] },
    islandsEnabled: false,
  };

  // Transition to running
  await updateBuildStatus(deps, buildId, "running");

  try {
    const pipelineStart = Date.now();
    const time = (label: string, start: number) =>
      logger.log(`[timing] ${label}: ${Date.now() - start}ms`);

    // === Stage 1: MERGE ===
    let t = Date.now();
    emitProgress(deps, ctx, "merge", "Loading revision and site data");
    await stageMerge(deps, params, ctx);
    time("merge", t);

    // === Stage 2: GENERATE ===
    t = Date.now();
    emitProgress(deps, ctx, "generate", "Generating Astro project");
    await stageGenerate(deps, params, ctx);
    time("generate", t);

    // === Stage 3: FETCH_DATA ===
    t = Date.now();
    emitProgress(deps, ctx, "fetch_data", "Fetching products and collections");
    await stageFetchData(deps, ctx);
    time("fetch_data", t);

    // === Stage 4: ASTRO_BUILD ===
    t = Date.now();
    emitProgress(deps, ctx, "astro_build", "Running astro build");
    await stageAstroBuild(ctx);
    time("astro_build", t);

    // === Stage 5: ZIP ===
    t = Date.now();
    emitProgress(deps, ctx, "zip", "Packaging artifact");
    await stageZip(ctx);
    time("zip", t);

    // === Stage 6: UPLOAD ===
    t = Date.now();
    emitProgress(deps, ctx, "upload", "Uploading to S3");
    await stageUpload(deps, ctx);
    time("upload", t);

    // === Stage 7: DEPLOY ===
    t = Date.now();
    emitProgress(deps, ctx, "deploy", "Finalizing build");
    await stageDeploy(deps, ctx);
    time("deploy", t);

    logger.log(`[timing] TOTAL pipeline: ${Date.now() - pipelineStart}ms`);

    return {
      buildId,
      revisionId: ctx.revisionId,
      artifactUrl: ctx.artifactUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Build ${buildId} failed: ${message}`);

    await updateBuildStatus(deps, buildId, "failed", {
      error: message.slice(0, 2000),
    });

    emitProgress(deps, ctx, "deploy", `Build failed: ${message}`);

    throw err;
  } finally {
    // Cleanup working directory (best-effort)
    try {
      await fs.rm(workingDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// ─── STAGE IMPLEMENTATIONS ──────────────────────────────────────────────

/**
 * Stage 1: MERGE — Load revision, site data, theme info from DB.
 */
async function stageMerge(
  deps: BuildDependencies,
  params: BuildParams,
  ctx: BuildContext,
): Promise<void> {
  const { schema } = deps;

  // Load site with theme info
  const [siteRow] = await deps.db
    .select({
      id: schema.site.id,
      themeId: schema.site.themeId,
      currentRevisionId: schema.site.currentRevisionId,
      publicUrl: schema.site.publicUrl,
      islandsEnabled: schema.site.islandsEnabled,
      branding: schema.site.branding,
      templateId: schema.theme.templateId,
    })
    .from(schema.site)
    .leftJoin(schema.theme, eq(schema.site.themeId, schema.theme.id))
    .where(eq(schema.site.id, params.siteId));

  if (!siteRow) {
    throw new Error(`Site ${params.siteId} not found`);
  }

  ctx.templateId = params.templateOverride ?? siteRow.templateId ?? "default";
  ctx.publicUrl = siteRow.publicUrl;
  ctx.islandsEnabled = siteRow.islandsEnabled ?? false;
  ctx.branding = (siteRow.branding as BuildContext["branding"]) ?? undefined;

  // Load or create revision
  let revisionId: string | null = null;

  if (siteRow.currentRevisionId) {
    const [rev] = await deps.db
      .select({ id: schema.siteRevision.id })
      .from(schema.siteRevision)
      .where(
        and(
          eq(schema.siteRevision.id, siteRow.currentRevisionId),
          eq(schema.siteRevision.siteId, params.siteId),
        ),
      );
    if (rev) revisionId = rev.id;
  }

  if (!revisionId) {
    revisionId = randomUUID();
    const data = { content: [], meta: { title: "Мой сайт" } };
    await deps.db.insert(schema.siteRevision).values({
      id: revisionId,
      siteId: params.siteId,
      data,
      meta: { ...data.meta, mode: ctx.mode },
      createdAt: new Date(),
    });
  }

  // Load revision data
  const [revRow] = await deps.db
    .select({
      data: schema.siteRevision.data,
      meta: schema.siteRevision.meta,
    })
    .from(schema.siteRevision)
    .where(eq(schema.siteRevision.id, revisionId));

  ctx.revisionId = revisionId;
  ctx.revisionData = (revRow?.data as Record<string, unknown>) ?? {};
  ctx.revisionMeta = (revRow?.meta as Record<string, unknown>) ?? {};

  // Update build record with revisionId
  await deps.db
    .update(schema.siteBuild)
    .set({ revisionId })
    .where(eq(schema.siteBuild.id, ctx.buildId));

  logger.log(
    `[merge] Site ${params.siteId}, revision ${revisionId}, template ${ctx.templateId}`,
  );
}

/**
 * Extract Header and Footer component props from revision data.
 * Searches through page content arrays for Header/Footer components and
 * returns their props as site-config.json data for the Astro theme.
 */
export function extractSiteConfig(
  revisionData: Record<string, unknown>,
  pagesData?: Record<string, { content?: unknown[] }>,
): Record<string, unknown> {
  const siteConfig: Record<string, unknown> = { header: {}, footer: {} };

  // Find content to search — prefer home page from multipage, fall back to legacy
  let homeContent: unknown[] = [];
  if (pagesData?.home?.content && Array.isArray(pagesData.home.content)) {
    homeContent = pagesData.home.content;
  } else if (Array.isArray((revisionData as { content?: unknown[] }).content)) {
    homeContent = (revisionData as { content: unknown[] }).content;
  }

  for (const component of homeContent) {
    const comp = component as {
      type?: string;
      props?: Record<string, unknown>;
    };
    if (!comp?.type || !comp?.props) continue;

    if (comp.type === "Header") {
      siteConfig.header = {
        siteTitle: comp.props.siteTitle ?? "Rose",
        logo: comp.props.logo ?? "/logo.svg",
        navigationLinks: comp.props.navigationLinks ?? [],
        actionButtons: comp.props.actionButtons ?? {},
      };
    }

    if (comp.type === "Footer") {
      siteConfig.footer = {
        newsletter: comp.props.newsletter ?? {},
        navigationColumn: comp.props.navigationColumn ?? {},
        informationColumn: comp.props.informationColumn ?? {},
        socialColumn: comp.props.socialColumn ?? {},
        copyright: comp.props.copyright ?? {},
      };
    }
  }

  return siteConfig;
}

/**
 * Stage 2: GENERATE — Scaffold the Astro project using the scaffold-builder.
 */
async function stageGenerate(
  deps: BuildDependencies,
  params: BuildParams,
  ctx: BuildContext,
): Promise<void> {
  // Resolve registry: prefer pre-converted, then convert from theme entries
  let registry: Record<string, ComponentRegistryEntry>;
  if (params.registry && Object.keys(params.registry).length > 0) {
    registry = params.registry;
  } else if (params.themeRegistry && params.themeRegistry.length > 0) {
    registry = themeRegistryToGeneratorRegistry(params.themeRegistry, {
      features: params.themeFeatures,
    });
    logger.log(
      `[generate] Converted ${Object.keys(registry).length} theme registry entries via bridge`,
    );
  } else {
    // No registry provided (e.g. build triggered via queue consumer).
    // Try loading from theme template on disk, fallback to hardcoded roseRegistry.
    const registryPath = path.join(
      process.cwd(),
      "templates",
      "astro",
      ctx.templateId,
      "src",
      "components",
      "registry.json",
    );
    try {
      const raw = await fs.readFile(registryPath, "utf8");
      const entries = JSON.parse(raw) as ThemeRegistryEntry[];
      if (Array.isArray(entries) && entries.length > 0) {
        registry = themeRegistryToGeneratorRegistry(entries, {});
        logger.log(
          `[generate] Loaded ${Object.keys(registry).length} registry entries from disk (${ctx.templateId})`,
        );
      } else {
        registry = roseRegistry;
        logger.log(
          `[generate] Empty registry.json on disk, using roseRegistry fallback (${Object.keys(registry).length} entries)`,
        );
      }
    } catch {
      registry = roseRegistry;
      logger.log(
        `[generate] No registry.json on disk, using roseRegistry fallback (${Object.keys(registry).length} entries)`,
      );
    }
  }

  // Override product components with server-island variants when islands are enabled
  if (ctx.islandsEnabled) {
    for (const [name, entry] of Object.entries(roseServerRegistry)) {
      if (entry.kind === "server-island") {
        registry[name] = entry;
      }
    }
    logger.log(
      `[generate] Islands enabled — merged server-island registry overrides`,
    );
  }

  // Build page entries from revision content
  const pages: PageEntry[] = [];

  // New multipage format: { pages: PageMeta[], pagesData: Record<string, PuckData> }
  const revPages = (
    ctx.revisionData as { pages?: { id: string; slug: string }[] }
  ).pages;
  const revPagesData = (
    ctx.revisionData as { pagesData?: Record<string, { content?: unknown[] }> }
  ).pagesData;

  if (Array.isArray(revPages) && revPages.length > 0 && revPagesData) {
    for (const page of revPages) {
      const pageData = revPagesData[page.id];
      if (!pageData?.content || !Array.isArray(pageData.content) || pageData.content.length === 0) continue;

      // Convert slug to filename: "/" → "index.astro", "/about" → "about.astro"
      const slug = (page.slug || "/").replace(/^\/+/, "");
      const fileName = slug === "" ? "index.astro" : `${slug}.astro`;

      pages.push({
        fileName,
        data: { content: pageData.content as any[] },
      });
    }

    // Resolve page ID references to actual slugs in component props
    // PagePicker may save page.id (e.g. "page-about") instead of slug ("/about")
    const pageIdToSlug: Record<string, string> = {};
    for (const p of revPages) {
      if (p.id && p.slug) {
        pageIdToSlug[p.id] = p.slug.startsWith("/") ? p.slug : `/${p.slug}`;
      }
    }

    function resolvePageLinks(obj: unknown): unknown {
      if (Array.isArray(obj)) {
        return obj.map((item) => resolvePageLinks(item));
      }
      if (obj !== null && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
          obj as Record<string, unknown>,
        )) {
          if (
            key === "href" &&
            typeof value === "string" &&
            value in pageIdToSlug
          ) {
            result[key] = pageIdToSlug[value];
          } else {
            result[key] = resolvePageLinks(value);
          }
        }
        return result;
      }
      return obj;
    }

    for (const page of pages) {
      page.data = resolvePageLinks(page.data) as typeof page.data;
    }

    logger.log(
      `[generate] Resolved page links: ${Object.keys(pageIdToSlug).length} page IDs mapped`,
    );

    // Synchronize Header/Footer from home page to all other pages
    // so navigation is consistent across the entire site
    const homePage = pages.find((p) => p.fileName === "index.astro");
    if (homePage) {
      const homeContent = homePage.data.content as any[];
      const homeHeader = homeContent.find((c: any) => c?.type === "Header");
      const homeFooter = homeContent.find((c: any) => c?.type === "Footer");

      for (const page of pages) {
        if (page.fileName === "index.astro") continue;
        const content = page.data.content as any[];
        for (let i = 0; i < content.length; i++) {
          if (content[i]?.type === "Header" && homeHeader) {
            content[i] = { ...homeHeader };
          }
          if (content[i]?.type === "Footer" && homeFooter) {
            content[i] = { ...homeFooter };
          }
        }
      }
      logger.log(
        `[generate] Synchronized Header/Footer from home page to ${pages.length - 1} other pages`,
      );
    }

    logger.log(
      `[generate] Multipage format: ${pages.length} pages from revision`,
    );
  } else {
    // Legacy single-page format: { content: [...] }
    const content = (ctx.revisionData as { content?: unknown[] }).content;
    if (Array.isArray(content) && content.length > 0) {
      pages.push({
        fileName: "index.astro",
        data: { content: content as any[] },
      });
    }
    logger.log(`[generate] Legacy format: ${pages.length} page(s)`);
  }

  // Override Header logo with branding logoUrl in page content arrays
  if (ctx.branding?.logoUrl && pages.length > 0) {
    for (const page of pages) {
      const content = page.data.content as any[];
      for (const comp of content) {
        if (comp?.type === "Header" && comp.props) {
          comp.props.logo = ctx.branding.logoUrl;
        }
      }
    }
    logger.log(
      `[generate] Overriding Header.logo in ${pages.length} page(s) with branding: ${ctx.branding.logoUrl}`,
    );
  }

  const rawApiUrl = process.env.API_GATEWAY_URL ?? "https://gateway.merfy.ru";
  const apiUrl = rawApiUrl.endsWith("/api") ? rawApiUrl : `${rawApiUrl}/api`;

  // Extract Header and Footer component props from revision data for site-config.json
  const siteConfig = extractSiteConfig(ctx.revisionData, revPagesData);

  // Override header logo with branding logo if available
  if (ctx.branding?.logoUrl) {
    (siteConfig.header as Record<string, unknown>).logo = ctx.branding.logoUrl;
    logger.log(
      `[generate] Overriding header logo with branding: ${ctx.branding.logoUrl}`,
    );
  }

  // Resolve merchant settings: prefer theme-bridge conversion when schema available
  let merchantSettings = (ctx.revisionMeta as { merchantSettings?: any })
    .merchantSettings;
  if (
    params.themeSettingsSchema &&
    params.themeSettingsSchema.length > 0 &&
    !merchantSettings
  ) {
    const overrides =
      (ctx.revisionMeta as { settingsOverrides?: Record<string, unknown> })
        .settingsOverrides ?? {};
    merchantSettings = themeSettingsToMerchantSettings(
      params.themeSettingsSchema,
      overrides,
      params.themeColorSchemes,
    );
    logger.log(
      `[generate] Converted theme settings schema to merchant settings via bridge`,
    );
  }

  // Apply branding color overrides from site.branding
  if (ctx.branding?.primaryColor || ctx.branding?.secondaryColor) {
    merchantSettings = merchantSettings ?? {};
    merchantSettings.tokens = merchantSettings.tokens ?? {};

    if (ctx.branding.primaryColor) {
      merchantSettings.tokens["color-primary"] = ctx.branding.primaryColor;
      merchantSettings.tokens["color-primary-rgb"] = ctx.branding.primaryColor;
    }
    if (ctx.branding.secondaryColor) {
      merchantSettings.tokens["color-secondary"] = ctx.branding.secondaryColor;
    }

    // Also override primary color in color schemes if they exist
    if (
      ctx.branding.primaryColor &&
      merchantSettings.colorSchemes &&
      merchantSettings.colorSchemes.length > 0
    ) {
      const scheme = merchantSettings.colorSchemes[0];
      scheme.colors = scheme.colors ?? {};
      scheme.colors["primary"] = ctx.branding.primaryColor;
    }

    logger.log(
      `[generate] Applied branding color overrides: primary=${ctx.branding.primaryColor ?? "none"}, secondary=${ctx.branding.secondaryColor ?? "none"}`,
    );
  }

  const scaffoldConfig: ScaffoldConfig = {
    outputDir: ctx.workingDir,
    themeName: ctx.templateId,
    pages,
    registry,
    merchantSettings,
    themeDefaults: (ctx.revisionMeta as { themeDefaults?: any }).themeDefaults,
    buildData: {
      siteData: {
        ...ctx.revisionData,
        meta: {
          ...ctx.revisionMeta,
          shopId: ctx.siteId,
          apiUrl,
        },
      },
    },
    dynamicPages: {
      apiUrl,
      shopId: ctx.siteId,
    },
    layout: {
      importPath: "../layouts/BaseLayout.astro",
      tagName: "BaseLayout",
    },
    extraFiles: {
      "src/data/site-config.json": JSON.stringify(siteConfig, null, 2),
    },
    ...(ctx.islandsEnabled
      ? {
          islands: {
            enabled: true,
            serverUrl:
              process.env.ISLANDS_SERVER_URL ?? "https://islands.merfy.ru",
            storeId: ctx.siteId,
          },
        }
      : {}),
  };

  const { generatedFiles } = await buildScaffold(scaffoldConfig);
  logger.log(`[generate] Scaffolded ${generatedFiles.length} files`);
}

/**
 * Stage 3: FETCH_DATA — Fetch products/collections from product-service via RPC.
 * Writes fetched data to src/data/ for Astro build-time consumption.
 */
async function stageFetchData(
  deps: BuildDependencies,
  ctx: BuildContext,
): Promise<void> {
  // Also fetch from site_product table (local products)
  const localProducts = await deps.db
    .select()
    .from(deps.schema.siteProduct)
    .where(
      and(
        eq(deps.schema.siteProduct.siteId, ctx.siteId),
        eq(deps.schema.siteProduct.isActive, true),
      ),
    )
    .orderBy(deps.schema.siteProduct.sortOrder);

  // Try RPC fetch for full catalog (may fail if product-service unavailable)
  // Pass siteId so product-service returns products for this specific site
  const rpcData = await fetchStoreData(deps.productClient, ctx.tenantId, ctx.siteId);

  // Merge: RPC products take priority, local products as fallback
  const products =
    rpcData.products.length > 0
      ? rpcData.products
      : localProducts.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? undefined,
          price: p.price / 100,
          images: (p.images as string[]) ?? [],
          slug: p.slug ?? p.id,
        }));

  ctx.storeData = {
    products,
    collections: rpcData.collections,
  };

  // Transform products for Astro components (PopularProducts.astro expects { name, price: string, oldPrice: string, image: string })
  const formatPrice = (price: number | string | null | undefined): string => {
    if (price === null || price === undefined) return "0 ₽";
    const num = typeof price === "string" ? parseFloat(price) : price;
    return `${num.toLocaleString("ru-RU")} ₽`;
  };

  const astroProducts = products.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: formatPrice(p.price),
    oldPrice: p.compareAtPrice ? formatPrice(p.compareAtPrice) : undefined,
    image: (p.images as string[])?.[0] || "/images/placeholder.png",
    href: `/product/${p.slug || p.id}`,
    slug: p.slug || p.id,
  }));

  // Write products.json for Astro build-time consumption (formatted for components)
  const productsPath = path.join(
    ctx.workingDir,
    "src",
    "data",
    "products.json",
  );
  await fs.mkdir(path.dirname(productsPath), { recursive: true });
  await fs.writeFile(productsPath, JSON.stringify(astroProducts, null, 2), "utf8");

  // Also write to public/data/ for runtime access by checkout.js (raw format)
  const publicProductsPath = path.join(
    ctx.workingDir,
    "public",
    "data",
    "products.json",
  );
  await fs.mkdir(path.dirname(publicProductsPath), { recursive: true });
  await fs.writeFile(publicProductsPath, JSON.stringify(products, null, 2), "utf8");

  // Write collections.json (always, even empty — so Astro import doesn't throw)
  const astroCollections = ctx.storeData.collections.map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    image: (c.images as string[])?.[0] || "/images/placeholder.png",
    slug: c.slug || c.id,
    href: `/collection/${c.slug || c.id}`,
  }));
  const collectionsPath = path.join(
    ctx.workingDir,
    "src",
    "data",
    "collections.json",
  );
  await fs.mkdir(path.dirname(collectionsPath), { recursive: true });
  await fs.writeFile(
    collectionsPath,
    JSON.stringify(astroCollections, null, 2),
    "utf8",
  );

  logger.log(
    `[fetch_data] ${products.length} products, ${ctx.storeData.collections.length} collections`,
  );
}

/** Global npm cache directory for shared node_modules per theme */
const NPM_CACHE_DIR = "/app/.npm-cache";

/**
 * Stage 4: ASTRO_BUILD — Install dependencies and run `astro build`.
 *
 * Optimization: caches node_modules per theme to avoid 15s npm install on every build.
 * First build for a theme does a full npm install and copies node_modules to cache.
 * Subsequent builds copy from cache and skip install entirely.
 */
async function stageAstroBuild(ctx: BuildContext): Promise<void> {
  const cacheModulesDir = path.join(NPM_CACHE_DIR, ctx.templateId, "node_modules");
  const buildModulesDir = path.join(ctx.workingDir, "node_modules");
  const cachePackageJson = path.join(NPM_CACHE_DIR, ctx.templateId, "package.json");
  const buildPackageJson = path.join(ctx.workingDir, "package.json");

  // Check if cached node_modules exists and package.json matches
  const cacheExists = await fs.stat(cacheModulesDir).then(() => true).catch(() => false);
  let cacheValid = false;

  if (cacheExists) {
    try {
      // Check for corrupted cache (double node_modules nesting from old bug)
      const nestedModules = path.join(cacheModulesDir, "node_modules");
      const hasNesting = await fs.stat(nestedModules).then(() => true).catch(() => false);
      if (hasNesting) {
        logger.warn(`[astro_build] Corrupted cache detected (double nesting), clearing`);
        await fs.rm(cacheModulesDir, { recursive: true, force: true });
        cacheExists = false;
        cacheValid = false;
      } else {
        const cachedPkg = await fs.readFile(cachePackageJson, "utf8").catch(() => "");
        const currentPkg = await fs.readFile(buildPackageJson, "utf8").catch(() => "");
        cacheValid = cachedPkg.length > 0 && cachedPkg === currentPkg;
      }
    } catch {
      cacheValid = false;
    }
  }

  if (cacheValid) {
    // Fast path: copy cached node_modules
    await runCommand("cp", ["-r", cacheModulesDir, buildModulesDir], ctx.workingDir, 30_000);
    logger.log(`[astro_build] node_modules restored from cache (${ctx.templateId})`);
  } else {
    // Slow path: full npm install, then cache the result
    const install = await runCommand(
      "npm",
      ["install", "--prefer-offline"],
      ctx.workingDir,
      120_000,
    );
    if (install.code !== 0) {
      throw new Error(
        `npm install failed (exit ${install.code}): ${install.stderr.slice(0, 500)}`,
      );
    }
    logger.log(`[astro_build] npm install completed`);

    // Cache node_modules for next build (remove old cache first to avoid nesting)
    try {
      await fs.rm(cacheModulesDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(path.join(NPM_CACHE_DIR, ctx.templateId), { recursive: true });
      await runCommand("cp", ["-r", buildModulesDir, cacheModulesDir], ctx.workingDir, 60_000);
      // Also cache package.json for invalidation
      const pkgContent = await fs.readFile(buildPackageJson, "utf8").catch(() => "");
      if (pkgContent) {
        await fs.writeFile(cachePackageJson, pkgContent, "utf8");
      }
      logger.log(`[astro_build] node_modules cached for ${ctx.templateId}`);
    } catch (e) {
      logger.warn(`[astro_build] Failed to cache node_modules: ${e instanceof Error ? e.message : e}`);
    }
  }

  // astro build
  const build = await runCommand(
    "npx",
    ["astro", "build"],
    ctx.workingDir,
    300_000,
  );
  if (build.code !== 0) {
    throw new Error(
      `astro build failed (exit ${build.code}): ${build.stderr.slice(0, 500)}`,
    );
  }
  logger.log(`[astro_build] astro build completed`);

  // Verify dist/ exists
  const distExists = await fs
    .stat(ctx.distDir)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!distExists) {
    throw new Error("astro build did not produce a dist/ directory");
  }
}

/**
 * Stage 5: ZIP — Package dist/ directory into a zip artifact.
 */
async function stageZip(ctx: BuildContext): Promise<void> {
  await zipDirectory(ctx.distDir, ctx.artifactPath);
  ctx.artifactUrl = `file://${ctx.artifactPath}`;
  logger.log(`[zip] Artifact: ${ctx.artifactPath}`);
}

/**
 * Stage 6: UPLOAD — Upload artifact + static files to S3/MinIO.
 *
 * Uploads:
 * 1. Zip artifact to sites/{siteId}/{buildId}/artifact.zip
 * 2. Static files for direct serving to sites/{siteId}/
 * 3. Updates site_build.artifactUrl with the S3 URL
 */
async function stageUpload(
  deps: BuildDependencies,
  ctx: BuildContext,
): Promise<void> {
  if (!(await deps.s3.isEnabled())) {
    logger.log("[upload] S3 not enabled, skipping upload");
    return;
  }

  const bucket = await deps.s3.ensureBucket();

  // Determine the site prefix for live serving
  const siteSlug = ctx.publicUrl
    ? deps.s3.extractSubdomainSlug(ctx.publicUrl)
    : ctx.siteId;

  // 1. Upload zip artifact to sites/{siteId}/{buildId}/artifact.zip
  const artifactUrl = await deps.s3
    .uploadArtifact(siteSlug, ctx.buildId, ctx.artifactPath)
    .catch((e) => {
      logger.warn(`[upload] Failed to upload artifact: ${e}`);
      return null;
    });
  if (artifactUrl) {
    ctx.artifactUrl = artifactUrl;
  }

  // 2. Upload static files for direct serving
  const { uploaded, livePrefix } = await deps.s3.uploadStaticFiles(
    siteSlug,
    ctx.buildId,
    ctx.distDir,
  );
  logger.log(
    `[upload] Uploaded ${uploaded} static files + artifact for site ${siteSlug}`,
  );

  // 3. Update build record with S3 info and artifactUrl
  const sitePrefix = `sites/${siteSlug}/`;
  await deps.db
    .update(deps.schema.siteBuild)
    .set({
      s3Bucket: bucket,
      s3KeyPrefix: sitePrefix,
      artifactUrl: ctx.artifactUrl || undefined,
    })
    .where(eq(deps.schema.siteBuild.id, ctx.buildId));
}

/**
 * Stage 7: DEPLOY — Mark build as uploaded/complete.
 */
async function stageDeploy(
  deps: BuildDependencies,
  ctx: BuildContext,
): Promise<void> {
  // Write metadata file
  const metadataFile = path.join(ctx.artifactsDir, `${ctx.buildId}.json`);
  const metadata = {
    buildId: ctx.buildId,
    siteId: ctx.siteId,
    tenantId: ctx.tenantId,
    revisionId: ctx.revisionId,
    mode: ctx.mode,
    completedAt: new Date().toISOString(),
    artifactUrl: ctx.artifactUrl,
    productsCount: ctx.storeData.products.length,
    collectionsCount: ctx.storeData.collections.length,
  };
  await fs.mkdir(path.dirname(metadataFile), { recursive: true });
  await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), "utf8");

  // Upload metadata to S3 if available
  let logUrl = `file://${metadataFile}`;
  if (await deps.s3.isEnabled()) {
    const bucket = await deps.s3.ensureBucket();
    const sitePrefix = ctx.publicUrl
      ? deps.s3.getSitePrefixBySubdomain(ctx.publicUrl)
      : `sites/${ctx.tenantId}/${ctx.siteId}/`;
    const metaUrl = await deps.s3
      .uploadFile(bucket, `${sitePrefix}${ctx.buildId}.json`, metadataFile)
      .catch(() => null);
    if (metaUrl) logUrl = metaUrl;
  }

  // Final status: uploaded
  await updateBuildStatus(deps, ctx.buildId, "uploaded", {
    artifactUrl: ctx.artifactUrl,
    logUrl,
  });

  logger.log(
    `[deploy] Build ${ctx.buildId} complete — artifact: ${ctx.artifactUrl}`,
  );
}
