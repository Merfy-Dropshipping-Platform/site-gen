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
import * as fsSync from "fs";
import { spawn } from "child_process";
import archiver from "archiver";
import { randomUUID } from "crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import type * as schemaTypes from "../db/schema";
import { fetchStoreData, fetchAllCollectionProducts, fetchPublications, type FetchedStoreData } from "./data-fetcher";
import { migrateRevisionData } from "../utils/revision-migrations";
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
import {
  constructorThemeToMerchantSettings,
  generateGoogleFontsUrl,
  type ConstructorThemeSettings,
} from "./constructor-theme-bridge";
import { S3StorageService } from "../storage/s3.service";
import { roseRegistry, roseServerRegistry } from "./registries/rose";
import { vanillaRegistry, vanillaServerRegistry } from "./registries/vanilla";
import { satinRegistry } from "./registries/satin";
import { fluxRegistry } from "./registries/flux";
import { bloomRegistry } from "./registries/bloom";

// Map theme template IDs to their registries so the queue-consumer build path
// (which doesn't go through generator.service.ts) can pick the right Astro
// component map. Includes versionless and `theme-1.0` form variants.
const THEME_REGISTRIES: Record<string, Record<string, ComponentRegistryEntry>> = {
  satin: satinRegistry,
  flux: fluxRegistry,
  bloom: bloomRegistry,
  vanilla: vanillaRegistry,
  rose: roseRegistry,
};

function pickRegistryByTemplateId(
  templateId: string | undefined,
): Record<string, ComponentRegistryEntry> | null {
  if (!templateId) return null;
  const bare = templateId.replace(/-\d[\d.a-z]*$/, "");
  return THEME_REGISTRIES[bare] ?? null;
}

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
export interface BuildContext {
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
  /** Immutable S3 storage slug (e.g. cdf63de393ab) */
  storageSlug: string | null;
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
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; favicons?: { universal?: string; dark?: string; light?: string; apple?: string } };
  /** Site settings (checkout config, etc.) */
  settings?: { requireCustomerAuth?: boolean };
}

const ANALYTICS_COLLECTOR_URL = "https://iowcg0sw4wsoo0s4k8g0ws0o.176.57.218.121.sslip.io";

/** Inject tracker.js + loader.js into all HTML files before </head> */
async function injectAnalyticsTracker(distDir: string, siteId: string): Promise<void> {
  const htmlFiles: string[] = [];
  async function findHtml(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await findHtml(full);
      else if (e.name.endsWith(".html")) htmlFiles.push(full);
    }
  }
  await findHtml(distDir);

  const trackerSnippet = `<script src="${ANALYTICS_COLLECTOR_URL}/tracker.js?shop=${siteId}" defer></script>\n<script src="${ANALYTICS_COLLECTOR_URL}/loader.js?shop=${siteId}" defer></script>`;

  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");
    if (html.includes("tracker.js")) continue; // already injected
    html = html.replace(/<\/head>/i, `${trackerSnippet}\n</head>`);
    await fs.writeFile(file, html, "utf8");
  }
  logger.log(`[analytics] Injected tracker into ${htmlFiles.length} HTML files for site ${siteId}`);
}

/** Inject islands.js script + meta tags into all HTML files before </head> */
async function injectIslandsScript(
  distDir: string,
  siteId: string,
  serverUrl: string,
): Promise<void> {
  const htmlFiles: string[] = [];
  async function findHtml(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await findHtml(full);
      else if (e.name.endsWith(".html")) htmlFiles.push(full);
    }
  }
  await findHtml(distDir);

  const snippet =
    `<meta name="merfy-islands-url" content="${serverUrl}" />\n` +
    `<meta name="merfy-store-id" content="${siteId}" />\n` +
    `<script src="${serverUrl}/islands.js" defer></script>`;

  let injected = 0;
  for (const file of htmlFiles) {
    let html = await fs.readFile(file, "utf8");
    if (html.includes("islands.js")) continue; // already injected
    html = html.replace(/<\/head>/i, `${snippet}\n</head>`);
    await fs.writeFile(file, html, "utf8");
    injected++;
  }
  logger.log(`[islands] Injected islands.js into ${injected}/${htmlFiles.length} HTML files for site ${siteId}`);
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
 * Default revision data matching the constructor's initial state.
 * Ensures the first build produces a site identical to what the constructor shows.
 */
function getDefaultRevisionData(templateId?: string): Record<string, unknown> {
  // Try loading theme-specific defaults first, fallback to rose.json
  try {
    const templateFile = `${templateId || "rose"}.json`;
    const defaultPath = path.join(__dirname, "templates", "defaults", templateFile);
    if (fsSync.existsSync(defaultPath)) {
      return JSON.parse(fsSync.readFileSync(defaultPath, "utf-8"));
    }
    // Fallback to rose.json if theme-specific file not found
    if (templateId && templateId !== "rose") {
      const fallbackPath = path.join(__dirname, "templates", "defaults", "rose.json");
      if (fsSync.existsSync(fallbackPath)) {
        return JSON.parse(fsSync.readFileSync(fallbackPath, "utf-8"));
      }
    }
  } catch {
    // Fall through to hardcoded defaults
  }

  // Hardcoded fallback (legacy)
  const defaultHeader = {
    type: "Header",
    props: {
      id: "Header-default",
      siteTitle: "ROSE",
      logo: "/logo.svg",
      logoPosition: "top-left",
      stickiness: "scroll-up",
      colorScheme: "scheme-2",
      padding: { top: 32, bottom: 32 },
      navigationLinks: [
        { label: "Каталог", href: "/catalog" },
        { label: "О нас", href: "/about" },
        { label: "Доставка", href: "/delivery" },
        { label: "Контакты", href: "/contacts" },
      ],
      menuColorScheme: "scheme-2",
      menuType: "dropdown",
      actionButtons: { showSearch: "true", showCart: "true", showProfile: "true" },
    },
  };
  const defaultFooter = {
    type: "Footer",
    props: {
      id: "Footer-default",
      colorScheme: "scheme-2",
      copyrightColorScheme: "scheme-1",
      padding: { top: 80, bottom: 80 },
      heading: { text: "Подпишитесь на нашу рассылку", size: "small" },
      text: { content: "Введите электронную почту и получайте информацию нашего бренда.", size: "small" },
      newsletter: {
        enabled: "true",
        heading: "Подпишитесь на нашу рассылку",
        description: "Введите электронную почту и получайте информацию нашего бренда.",
        placeholder: "rose@example.ru",
      },
      copyright: { companyName: "ROSE", showYear: "true", poweredBy: "Powered by Merfy" },
      navigationColumn: {
        title: "Навигация",
        links: [
          { label: "Главная", href: "/" },
          { label: "Каталог", href: "/catalog" },
          { label: "Контакты", href: "/contacts" },
          { label: "О нас", href: "/about" },
        ],
      },
      informationColumn: {
        title: "Информация",
        links: [
          { label: "Политика доставки", href: "#" },
          { label: "Политика возврата", href: "#" },
          { label: "Условия обслуживания", href: "#" },
          { label: "Политика конфиденциальности", href: "#" },
        ],
      },
      socialColumn: {
        title: "Социальные сети",
        email: "rose@example.ru",
        socialLinks: [
          { platform: "VK", href: "#" },
          { platform: "Telegram", href: "#" },
          { platform: "YouTube", href: "#" },
        ],
      },
    },
  };
  return {
    pages: [
      { id: "home", name: "Главная страница", slug: "/", isCustom: false, createdAt: 0 },
      { id: "page-about", name: "О нас", slug: "/about", isCustom: false, createdAt: 0 },
      { id: "page-contacts", name: "Контакты", slug: "/contacts", isCustom: false, createdAt: 0 },
    ],
    pagesData: {
      home: {
        content: [
          defaultHeader,
          {
            type: "Hero",
            props: {
              id: "Hero-1",
              backgroundImage: "/main-image.png",
              backgroundImage2: "",
              size: "large",
              overlay: 30,
              position: "bottom-center",
              alignment: "center",
              container: "false",
              colorScheme: "scheme-1",
              heading: { text: "ROSE", size: "large" },
              text: { content: "Там, где классика встречается с характером", size: "large" },
              primaryButton: { text: "В КАТАЛОГ", link: { href: "/catalog" } },
              secondaryButton: { text: "", link: { href: "#" } },
            },
          },
          defaultFooter,
        ],
        root: { props: { title: "Мой сайт" } },
      },
      "page-about": {
        content: [
          { ...defaultHeader, props: { ...defaultHeader.props, id: "Header-about" } },
          {
            type: "MainText",
            props: {
              id: "MainText-about",
              position: "center",
              colorScheme: "scheme-2",
              padding: { top: 80, bottom: 80 },
              heading: { enabled: "true", text: "О нас" },
              text: { content: "Расскажите о вашем магазине" },
            },
          },
          { ...defaultFooter, props: { ...defaultFooter.props, id: "Footer-about" } },
        ],
        root: { props: { title: "О нас" } },
      },
      "page-contacts": {
        content: [
          { ...defaultHeader, props: { ...defaultHeader.props, id: "Header-contacts" } },
          {
            type: "ContactForm",
            props: {
              id: "ContactForm-contacts",
              colorScheme: "scheme-2",
              padding: { top: 80, bottom: 80 },
              heading: { enabled: "true", text: "Контакты" },
            },
          },
          { ...defaultFooter, props: { ...defaultFooter.props, id: "Footer-contacts" } },
        ],
        root: { props: { title: "Контакты" } },
      },
    },
    meta: { title: "Мой сайт" },
  };
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

// ─── SNAPSHOT DEPLOY ───────────────────────────────────────────────────

interface SnapshotParams {
  tenantId: string;
  siteId: string;
  mode?: "draft" | "production";
  templateId: string;
}

/**
 * Try a fast "snapshot" deploy for sites with default/empty content.
 *
 * Instead of running the full 7-stage pipeline (merge→generate→fetch_data→
 * astro_build→zip→upload→deploy), we copy the pre-built template dist/,
 * patch shopId into HTML files, inject real products, then zip→upload→deploy.
 *
 * Returns BuildResult if snapshot was used, null if conditions not met
 * (caller should fall through to full pipeline).
 */
export async function trySnapshotDeploy(
  deps: BuildDependencies,
  params: SnapshotParams,
): Promise<BuildResult | null> {
  const t0 = Date.now();
  const { schema } = deps;

  // 1. Check if pre-built dist/ exists for this template
  const templateDistDir = path.join(
    process.cwd(),
    "templates",
    "astro",
    params.templateId,
    "dist",
  );
  const distExists = await fs
    .stat(templateDistDir)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!distExists) {
    logger.log(`[snapshot] No pre-built dist/ for template ${params.templateId}, skipping`);
    return null;
  }

  // 2. Load site data — check revision & branding
  const [siteRow] = await deps.db
    .select({
      id: schema.site.id,
      currentRevisionId: schema.site.currentRevisionId,
      publicUrl: schema.site.publicUrl,
      storageSlug: schema.site.storageSlug,
      branding: schema.site.branding,
      islandsEnabled: schema.site.islandsEnabled,
    })
    .from(schema.site)
    .where(eq(schema.site.id, params.siteId));

  if (!siteRow) {
    logger.warn(`[snapshot] Site ${params.siteId} not found`);
    return null;
  }

  // 3. Check branding — if custom colors or logo, need full build
  const branding = siteRow.branding as BuildContext["branding"] | null;
  if (branding?.primaryColor || branding?.logoUrl) {
    logger.log(`[snapshot] Site has custom branding, skipping snapshot`);
    return null;
  }

  // 4. Check revision — must be empty/default or absent
  let revisionId: string | null = null;
  if (siteRow.currentRevisionId) {
    const [rev] = await deps.db
      .select({
        id: schema.siteRevision.id,
        data: schema.siteRevision.data,
      })
      .from(schema.siteRevision)
      .where(
        and(
          eq(schema.siteRevision.id, siteRow.currentRevisionId),
          eq(schema.siteRevision.siteId, params.siteId),
        ),
      );

    if (rev) {
      revisionId = rev.id;
      // Check if content is non-default (has real user edits)
      const data = rev.data as { content?: unknown[]; pages?: unknown[] } | null;
      const hasContent =
        (Array.isArray(data?.content) && data!.content.length > 0) ||
        (Array.isArray(data?.pages) && data!.pages.length > 0);
      if (hasContent) {
        logger.log(`[snapshot] Revision has custom content, skipping snapshot`);
        return null;
      }
    }
  }

  // Create revision if missing
  if (!revisionId) {
    revisionId = randomUUID();
    const data = getDefaultRevisionData(params.templateId);
    await deps.db.insert(schema.siteRevision).values({
      id: revisionId,
      siteId: params.siteId,
      data,
      meta: { title: "Мой сайт", mode: params.mode ?? "draft" },
      createdAt: new Date(),
    });
  }

  // ── All conditions met → snapshot deploy ──
  logger.log(`[snapshot] Conditions met for site ${params.siteId}, deploying from template dist/`);

  const buildId = randomUUID();
  const now = new Date();

  // Create build record
  await deps.db.insert(schema.siteBuild).values({
    id: buildId,
    siteId: params.siteId,
    revisionId,
    status: "queued",
    createdAt: now,
  });
  await updateBuildStatus(deps, buildId, "running");

  const artifactsDir = path.join(process.cwd(), "artifacts", params.siteId);
  await fs.mkdir(artifactsDir, { recursive: true });

  // Copy template dist/ to a temp working directory
  const workingDir = path.join(
    process.cwd(),
    ".astro-builds",
    params.siteId,
    buildId,
  );
  const distDir = path.join(workingDir, "dist");
  await fs.mkdir(workingDir, { recursive: true });
  await fs.cp(templateDistDir, distDir, { recursive: true });

  const ctx: BuildContext = {
    buildId,
    siteId: params.siteId,
    tenantId: params.tenantId,
    mode: params.mode ?? "draft",
    revisionId,
    revisionData: {},
    revisionMeta: {},
    templateId: params.templateId,
    publicUrl: siteRow.publicUrl,
    storageSlug: siteRow.storageSlug,
    workingDir,
    artifactsDir,
    distDir,
    artifactPath: path.join(artifactsDir, `${buildId}.zip`),
    artifactUrl: "",
    storeData: { products: [], collections: [] },
    islandsEnabled: false,
  };

  try {
    // ── Patch shopId in all HTML files ──
    const htmlFiles: string[] = [];
    async function findHtml(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await findHtml(full);
        else if (e.name.endsWith(".html")) htmlFiles.push(full);
      }
    }
    await findHtml(distDir);

    for (const file of htmlFiles) {
      let html = await fs.readFile(file, "utf8");
      html = html.replace(
        /const shopId = "";/g,
        `const shopId = "${params.siteId}";`,
      );
      html = html.replace(
        /const shopId = undefined;/g,
        `const shopId = "${params.siteId}";`,
      );
      await fs.writeFile(file, html, "utf8");
    }
    logger.log(`[snapshot] Patched shopId in ${htmlFiles.length} HTML files`);

    // ── Inject analytics tracker + pixel loader ──
    await injectAnalyticsTracker(distDir, params.siteId);

    // ── Inject islands script if enabled ──
    const siteIslandsEnabled = siteRow.islandsEnabled ?? false;
    if (siteIslandsEnabled) {
      const islandsUrl =
        process.env.ISLANDS_SERVER_URL ?? "https://islands.merfy.ru";
      await injectIslandsScript(distDir, params.siteId, islandsUrl);
    }

    // ── Inject real products ──
    const rpcData = await fetchStoreData(deps.productClient, params.tenantId, params.siteId);
    ctx.storeData = rpcData;

    if (rpcData.products.length > 0) {
      // Format for Astro components (same as stageFetchData)
      const formatPrice = (price: number | string | null | undefined): string => {
        if (price === null || price === undefined) return "0 ₽";
        const num = typeof price === "string" ? parseFloat(price) : price;
        return `${num.toLocaleString("ru-RU")} ₽`;
      };

      const astroProducts = rpcData.products
        .filter((p: any) => p.quantity == null || p.quantity > 0)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: formatPrice(p.price),
          oldPrice: p.compareAtPrice ? formatPrice(p.compareAtPrice) : undefined,
          image: (p.images as string[])?.[0] || "/images/placeholder.png",
          images: ((p.images as string[]) || []).filter(Boolean),
          href: `/product/${p.slug || p.id}`,
          slug: p.slug || p.id,
          quantity: p.quantity ?? null,
          sku: p.sku ?? null,
          metaTitle: p.metaTitle ?? null,
          metaDescription: p.metaDescription ?? null,
        }));

      const productsJsonPath = path.join(distDir, "data", "products.json");
      await fs.mkdir(path.dirname(productsJsonPath), { recursive: true });
      await fs.writeFile(productsJsonPath, JSON.stringify(astroProducts, null, 2), "utf8");
      logger.log(`[snapshot] Injected ${astroProducts.length} products into data/products.json`);
    }

    // ── Inject real publications ──
    const pubData = await fetchPublications(deps.db, deps.schema, params.siteId, params.tenantId);
    if (pubData.length > 0) {
      const fmtDate = (iso: string | null): string => {
        if (!iso) return "";
        return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
      };
      const astroPubs = pubData.map((p) => ({
        id: p.id, title: p.title, slug: p.slug, category: p.category,
        content: p.content, excerpt: p.excerpt,
        coverImageUrl: p.coverImageUrl || "/images/placeholder.png",
        publishedAt: p.publishedAt, dateFormatted: fmtDate(p.publishedAt),
        href: `/publications/${p.slug}`,
      }));
      const pubJsonPath = path.join(distDir, "data", "publications.json");
      await fs.mkdir(path.dirname(pubJsonPath), { recursive: true });
      await fs.writeFile(pubJsonPath, JSON.stringify(astroPubs, null, 2), "utf8");
      logger.log(`[snapshot] Injected ${astroPubs.length} publications into data/publications.json`);
    }

    // ── Zip → Upload → Deploy (reuse existing stages) ──
    emitProgress(deps, ctx, "zip", "Packaging snapshot artifact");
    await stageZip(ctx);

    // Upload with extra retry (MinIO may need warm-up)
    emitProgress(deps, ctx, "upload", "Uploading snapshot to S3");
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await stageUpload(deps, ctx);
        break;
      } catch (uploadErr) {
        if (attempt === 3) throw uploadErr;
        logger.warn(`[snapshot] Upload attempt ${attempt} failed, retrying in ${attempt}s...`);
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }

    emitProgress(deps, ctx, "deploy", "Finalizing snapshot deploy");
    await stageDeploy(deps, ctx);

    const elapsed = Date.now() - t0;
    logger.log(`[snapshot] Deployed site ${params.siteId} in ${elapsed}ms (vs full pipeline ~6500ms)`);

    return {
      buildId,
      revisionId,
      artifactUrl: ctx.artifactUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));
    logger.error(`[snapshot] Failed for site ${params.siteId}: ${message || '[no error message]'}`);
    await updateBuildStatus(deps, buildId, "failed", { error: (message || 'unknown error').slice(0, 2000) });
    throw err;
  } finally {
    // Cleanup working directory
    try {
      await fs.rm(workingDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
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
    storageSlug: null,
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

    // === Stage 4.5: VALIDATE BUILD OUTPUT ===
    const validationResult = await validateBuildOutput(ctx);
    if (validationResult) {
      emitProgress(deps, ctx, "astro_build", `Build complete. ${validationResult}`);
    }

    // === Stage 4.6: INJECT ANALYTICS TRACKER ===
    await injectAnalyticsTracker(ctx.distDir, params.siteId);

    // === Stage 4.7: INJECT ISLANDS SCRIPT ===
    if (ctx.islandsEnabled) {
      const islandsServerUrl =
        process.env.ISLANDS_SERVER_URL ?? "https://islands.merfy.ru";
      await injectIslandsScript(ctx.distDir, ctx.siteId, islandsServerUrl);
    }

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
    const message = err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));
    logger.error(`Build ${buildId} failed: ${message || '[no error message]'}`);

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
      storageSlug: schema.site.storageSlug,
      islandsEnabled: schema.site.islandsEnabled,
      branding: schema.site.branding,
      settings: schema.site.settings,
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
  ctx.storageSlug = siteRow.storageSlug;
  ctx.islandsEnabled = siteRow.islandsEnabled ?? false;
  ctx.branding = (siteRow.branding as BuildContext["branding"]) ?? undefined;
  ctx.settings = (siteRow.settings as BuildContext["settings"]) ?? undefined;

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
    const data = getDefaultRevisionData(ctx.templateId);
    await deps.db.insert(schema.siteRevision).values({
      id: revisionId,
      siteId: params.siteId,
      data,
      meta: { title: "Мой сайт", mode: ctx.mode },
      createdAt: new Date(),
    });
    logger.log(`[merge] Created initial revision ${revisionId} with default theme blocks (template: ${ctx.templateId})`);
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
  // Apply server-side migrations (e.g. catalog page → Catalog block) so build
  // pipeline sees the canonical shape regardless of when the revision was
  // saved. Idempotent — running on already-migrated revisions is a no-op.
  ctx.revisionData = migrateRevisionData(revRow?.data as Record<string, unknown> | undefined);
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
        logoPosition: comp.props.logoPosition ?? "top-left",
        stickiness: comp.props.stickiness ?? "scroll-up",
        colorScheme: comp.props.colorScheme ?? undefined,
        menuColorScheme: comp.props.menuColorScheme ?? undefined,
        padding: comp.props.padding ?? { top: 0, bottom: 0 },
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

  // Extract CheckoutSection props from page-checkout
  const checkoutContent = pagesData?.["page-checkout"]?.content;
  if (Array.isArray(checkoutContent)) {
    for (const component of checkoutContent) {
      const comp = component as { type?: string; props?: Record<string, unknown> };
      if (comp?.type === "CheckoutSection" && comp?.props) {
        siteConfig.checkout = {
          colorScheme: comp.props.colorScheme ?? undefined,
          padding: comp.props.padding ?? { top: 40, bottom: 40 },
        };
        break;
      }
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
    // Resolution order: theme-specific registry by templateId → registry.json
    // on disk → roseRegistry as last-resort fallback.
    const themeReg = pickRegistryByTemplateId(ctx.templateId);
    if (themeReg) {
      registry = themeReg;
      logger.log(
        `[generate] Using ${ctx.templateId}-specific registry (${Object.keys(registry).length} entries)`,
      );
    } else {
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
  }

  // Override product components with server-island variants when islands are enabled
  if (ctx.islandsEnabled) {
    const serverRegistry =
      ["vanilla", "satin", "flux", "bloom"].includes(ctx.templateId) ? vanillaServerRegistry : roseServerRegistry;
    for (const [name, entry] of Object.entries(serverRegistry)) {
      if (entry.kind === "server-island") {
        registry[name] = entry;
      }
    }
    logger.log(
      `[generate] Islands enabled — merged server-island registry overrides (${ctx.templateId})`,
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

  // Pages with full static implementations in theme templates — never overwrite with Puck stubs.
  // catalog: rich theme-specific template with filters/sort/pagination — keep static.
  const STATIC_TEMPLATE_PAGES = new Set([
    "cart", "catalog", "checkout", "checkout/result",
    "login", "register", "reset-password", "verify-email",
    "account", "account/orders", "account/order", "account/profile", "account/newsletter",
  ]);

  if (Array.isArray(revPages) && revPages.length > 0 && revPagesData) {
    for (const page of revPages) {
      const pageData = revPagesData[page.id];
      if (!pageData?.content || !Array.isArray(pageData.content) || pageData.content.length === 0) continue;

      // Convert slug to filename: "/" → "index.astro", "/about" → "about.astro"
      const slug = (page.slug || "/").replace(/^\/+/, "");
      const fileName = slug === "" ? "index.astro" : `${slug}.astro`;

      // Skip pages that have full static template implementations in the theme
      if (ctx.templateId && ctx.templateId !== "default" && STATIC_TEMPLATE_PAGES.has(slug)) {
        logger.log(`[generate] Skipping static template page: ${fileName} (theme: ${ctx.templateId})`);
        continue;
      }

      // Auto-inject Catalog block on /catalog page if missing — merchants
      // who haven't added a Catalog block in the constructor still get a
      // working catalog (filters + grid). Block is appended; merchant blocks
      // (Header, hero teasers, etc.) above remain editable.
      let pageContent = pageData.content as any[];
      if (slug === "catalog") {
        const hasCatalog = pageContent.some((b: any) => b?.type === "Catalog");
        if (!hasCatalog) {
          const lastFooterIdx = pageContent.findIndex(
            (b: any) => b?.type === "Footer",
          );
          const catalogBlock = {
            type: "Catalog",
            props: { padding: { top: 40, bottom: 80 } },
          };
          if (lastFooterIdx === -1) {
            pageContent = [...pageContent, catalogBlock];
          } else {
            pageContent = [
              ...pageContent.slice(0, lastFooterIdx),
              catalogBlock,
              ...pageContent.slice(lastFooterIdx),
            ];
          }
          logger.log(
            `[generate] Auto-injected Catalog block into ${fileName} (none was present)`,
          );
        }
      }

      pages.push({
        fileName,
        data: { content: pageContent },
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

  // ── Генерация страниц политик из site_policy ──
  try {
    const policies = await deps.db
      .select()
      .from(deps.schema.sitePolicy)
      .where(eq(deps.schema.sitePolicy.siteId, ctx.siteId));

    const POLICY_SLUG_MAP: Record<string, string> = {
      refund: "refund",
      privacy: "privacy",
      tos: "terms",
      shipping: "shipping-policy",
    };

    const POLICY_TITLE_MAP: Record<string, string> = {
      refund: "Политика возврата",
      privacy: "Политика конфиденциальности",
      tos: "Условия обслуживания",
      shipping: "Политика доставки",
    };

    // Берём Header/Footer из домашней страницы
    const homePage = pages.find((p) => p.fileName === "index.astro");
    const homeContent = (homePage?.data?.content as any[]) ?? [];
    const headerComponent = homeContent.find((c: any) => c?.type === "Header");
    const footerComponent = homeContent.find((c: any) => c?.type === "Footer");

    let policyPagesCount = 0;
    for (const policy of policies) {
      if (!policy.content || policy.content.trim() === "") continue;

      const slug = POLICY_SLUG_MAP[policy.type] ?? policy.type;
      const title = POLICY_TITLE_MAP[policy.type] ?? policy.type;
      const fileName = `${slug}.astro`;

      const content: any[] = [];
      if (headerComponent) content.push({ ...headerComponent });
      content.push({
        type: "MainText",
        props: {
          heading: { text: title, size: "large" },
          text: { text: policy.content },
          padding: { top: 80, bottom: 80 },
        },
      });
      if (footerComponent) content.push({ ...footerComponent });

      pages.push({ fileName, data: { content } });
      policyPagesCount++;
    }

    if (policyPagesCount > 0) {
      logger.log(`[generate] Added ${policyPagesCount} policy page(s)`);

      // Обновляем ссылки в Footer всех страниц на реальные пути политик
      const policyLinks = policies
        .filter((p) => p.content && p.content.trim() !== "")
        .map((p) => ({
          label: POLICY_TITLE_MAP[p.type] ?? p.type,
          href: `/${POLICY_SLUG_MAP[p.type] ?? p.type}`,
        }));

      if (policyLinks.length > 0) {
        for (const page of pages) {
          const content = page.data.content as any[];
          for (const component of content) {
            if (component?.type === "Footer" && component?.props) {
              // Обновляем informationColumn с реальными ссылками
              const infoCol = component.props.informationColumn;
              if (infoCol?.links && Array.isArray(infoCol.links)) {
                component.props.informationColumn = {
                  ...infoCol,
                  links: policyLinks,
                };
              } else {
                component.props.informationColumn = {
                  title: "Информация",
                  links: policyLinks,
                };
              }
            }
          }
        }
        logger.log(`[generate] Updated Footer policy links in ${pages.length} page(s)`);
      }
    }
    // ── Контактная информация компании в Footer ──
    const contactsRows = await deps.db
      .select()
      .from(deps.schema.siteContacts)
      .where(eq(deps.schema.siteContacts.siteId, ctx.siteId));

    const contacts = contactsRows[0];
    if (contacts?.fields && Array.isArray(contacts.fields) && contacts.fields.length > 0) {
      // Ищем email и телефон среди полей контактов
      const contactFields = contacts.fields as { id: string; label: string; value: string; order: number }[];
      const sortedFields = [...contactFields].sort((a, b) => a.order - b.order);

      // Формируем данные для socialColumn: контактные поля + соцсети
      for (const page of pages) {
        const content = page.data.content as any[];
        for (const component of content) {
          if (component?.type === "Footer" && component?.props) {
            const existingSocial = component.props.socialColumn ?? {};

            component.props.socialColumn = {
              ...existingSocial,
              title: existingSocial.title ?? "Контакты",
              contactFields: sortedFields.map((f) => ({
                label: f.label,
                value: f.value,
              })),
            };
          }
        }
      }
      logger.log(`[generate] Updated Footer contacts in ${pages.length} page(s) with ${sortedFields.length} field(s)`);
    }
  } catch (err) {
    logger.warn(
      `[generate] Failed to load policy pages: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (pages.length === 0) {
    logger.warn(
      `[generate] Pages array is empty for site ${ctx.siteId} — template index.astro will not be overwritten. ` +
      `Revision data keys: ${Object.keys(ctx.revisionData).join(", ") || "(empty)"}`,
    );
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

  // Inject siteUrl so RSS/sitemap can use it
  if (ctx.publicUrl) {
    (siteConfig as Record<string, unknown>).siteUrl = ctx.publicUrl;
  }

  // Inject colorSchemes from constructor theme into site-config.json
  const constructorThemeForColors =
    (ctx.revisionData as { themeSettings?: { colorSchemes?: any[] } }).themeSettings ??
    (ctx.revisionMeta as { themeSettings?: { colorSchemes?: any[] } }).themeSettings;
  if (constructorThemeForColors?.colorSchemes?.length) {
    (siteConfig as Record<string, unknown>).colorSchemes =
      constructorThemeForColors.colorSchemes;
    logger.log(
      `[generate] Injected ${constructorThemeForColors.colorSchemes.length} colorSchemes into site-config.json`,
    );
  }

  // Override header logo with branding logo if available
  if (ctx.branding?.logoUrl) {
    (siteConfig.header as Record<string, unknown>).logo = ctx.branding.logoUrl;
    logger.log(
      `[generate] Overriding header logo with branding: ${ctx.branding.logoUrl}`,
    );
  }

  // Resolve merchant settings — three paths in priority order:
  // 1. Direct merchantSettings from revision meta (legacy)
  // 2. Constructor ThemeSettings object (new: from constructor's ThemeContext)
  // 3. Theme settings schema + overrides (from theme manifest)
  let merchantSettings = (ctx.revisionMeta as { merchantSettings?: any })
    .merchantSettings;

  // Path 2: Constructor ThemeSettings → MerchantSettings
  // Constructor saves themeSettings in revision.data (not revision.meta)
  const constructorTheme =
    (ctx.revisionData as { themeSettings?: ConstructorThemeSettings }).themeSettings ??
    (ctx.revisionMeta as { themeSettings?: ConstructorThemeSettings }).themeSettings;
  if (!merchantSettings && constructorTheme?.colorSchemes?.length) {
    merchantSettings = constructorThemeToMerchantSettings(constructorTheme);
    logger.log(
      `[generate] Converted constructor ThemeSettings to merchant settings via constructor-theme-bridge`,
    );
  }

  // Path 3: Theme settings schema + overrides → MerchantSettings
  if (
    !merchantSettings &&
    params.themeSettingsSchema &&
    params.themeSettingsSchema.length > 0
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

  // Apply branding colors as FALLBACK (only if not already set by ThemeSettings)
  // Priority: ThemeSettings (constructor) > Branding (admin) > Rose defaults
  if (ctx.branding?.primaryColor || ctx.branding?.secondaryColor) {
    merchantSettings = merchantSettings ?? {};
    merchantSettings.tokens = merchantSettings.tokens ?? {};

    if (ctx.branding.primaryColor && !merchantSettings.tokens["color-primary"]) {
      merchantSettings.tokens["color-primary"] = ctx.branding.primaryColor;
      merchantSettings.tokens["color-primary-rgb"] = ctx.branding.primaryColor;
      merchantSettings.tokens["color-button"] = ctx.branding.primaryColor;
    }
    if (ctx.branding.secondaryColor && !merchantSettings.tokens["color-background"]) {
      merchantSettings.tokens["color-background"] = ctx.branding.secondaryColor;
    }

    // Also set primary color in first color scheme if not already set
    if (
      ctx.branding.primaryColor &&
      merchantSettings.colorSchemes &&
      merchantSettings.colorSchemes.length > 0
    ) {
      const scheme = merchantSettings.colorSchemes[0];
      scheme.colors = scheme.colors ?? {};
      if (!scheme.colors["primary"]) {
        scheme.colors["primary"] = ctx.branding.primaryColor;
      }
    }

    logger.log(
      `[generate] Applied branding color fallbacks: primary=${ctx.branding.primaryColor ?? "none"}, secondary→background=${ctx.branding.secondaryColor ?? "none"}`,
    );
  }

  // Theme folder name doesn't include version suffix — `theme.template_id`
  // is "rose-1.0" but `templates/astro/rose/` and `packages/theme-rose/` use
  // the bare name. Strip "-<version>" before passing to scaffold-builder.
  const bareThemeName = (ctx.templateId ?? 'default').replace(/-\d[\d.a-z]*$/, '');

  const scaffoldConfig: ScaffoldConfig = {
    outputDir: ctx.workingDir,
    siteId: ctx.siteId,
    themeName: bareThemeName,
    pages,
    registry,
    merchantSettings,
    themeDefaults: (ctx.revisionMeta as { themeDefaults?: any }).themeDefaults,
    // Preview ↔ live parity: pass the exact same themeSettings the preview
    // endpoint reads so assembleFromPackages → buildTokensCss produces
    // identical tokens.css. Preview source: loadRevisionData().data.themeSettings.
    themeSettings:
      (ctx.revisionData as { themeSettings?: Record<string, unknown> })
        .themeSettings ??
      (ctx.revisionMeta as { themeSettings?: Record<string, unknown> })
        .themeSettings,
    buildData: {
      siteData: {
        ...ctx.revisionData,
        meta: {
          ...ctx.revisionMeta,
          shopId: ctx.siteId,
          apiUrl,
          ...(ctx.settings?.requireCustomerAuth ? { requireCustomerAuth: true } : {}),
          ...(process.env.DADATA_API_KEY ? { dadataToken: process.env.DADATA_API_KEY } : {}),
          ...(ctx.branding?.favicons ? { favicons: ctx.branding.favicons } : {}),
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

  const astroProducts = products
    .filter((p: any) => p.quantity == null || p.quantity > 0)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: formatPrice(p.price),
      oldPrice: p.compareAtPrice ? formatPrice(p.compareAtPrice) : undefined,
      image: (p.images as string[])?.[0] || "/images/placeholder.png",
      images: ((p.images as string[]) || []).filter(Boolean),
      href: `/product/${p.slug || p.id}`,
      slug: p.slug || p.id,
      quantity: p.quantity ?? null,
      sku: p.sku ?? null,
      metaTitle: p.metaTitle ?? null,
      metaDescription: p.metaDescription ?? null,
      hasVariants: p.hasVariants ?? false,
      variants: (p.hasVariants && Array.isArray(p.variantCombinations))
        ? p.variantCombinations.map((v: any) => ({
            id: v.id,
            title: v.title || v.id,
            price: formatPrice(v.price || p.price || p.basePrice),
            compareAtPrice: v.compareAtPrice ? formatPrice(v.compareAtPrice) : undefined,
            available: v.available !== false,
            quantity: v.quantity ?? 0,
            options: v.options || {},
          }))
        : [],
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

  // Fetch collection → product IDs mapping
  const shopId = ctx.siteId || ctx.tenantId;
  const collectionProductsMap = ctx.storeData.collections.length > 0
    ? await fetchAllCollectionProducts(deps.productClient, ctx.storeData.collections, shopId)
    : {};

  // Write collections.json with productIds (always, even empty — so Astro import doesn't throw)
  const astroCollections = ctx.storeData.collections.map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    image: (c.images as string[])?.[0] || "/images/placeholder.png",
    slug: c.slug || c.id,
    href: `/collections/${c.slug || c.id}`,
    productIds: collectionProductsMap[c.id] || [],
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

  // Write collection-products.json — slug-keyed mapping for Astro components
  const collectionProductsBySlug: Record<string, string[]> = {};
  for (const c of ctx.storeData.collections) {
    const slug = (c as any).slug || c.id;
    collectionProductsBySlug[slug] = collectionProductsMap[c.id] || [];
  }
  const collectionProductsPath = path.join(
    ctx.workingDir,
    "src",
    "data",
    "collection-products.json",
  );
  await fs.writeFile(
    collectionProductsPath,
    JSON.stringify(collectionProductsBySlug, null, 2),
    "utf8",
  );

  // Fetch publications from local DB (same service)
  const publicationsData = await fetchPublications(deps.db, deps.schema, ctx.siteId, ctx.tenantId);

  const formatDate = (iso: string | null): string => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const astroPublications = publicationsData.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    category: p.category,
    content: p.content,
    excerpt: p.excerpt,
    coverImageUrl: p.coverImageUrl || "/images/placeholder.png",
    publishedAt: p.publishedAt,
    dateFormatted: formatDate(p.publishedAt),
    href: `/publications/${p.slug}`,
  }));

  const publicationsPath = path.join(ctx.workingDir, "src", "data", "publications.json");
  await fs.mkdir(path.dirname(publicationsPath), { recursive: true });
  await fs.writeFile(publicationsPath, JSON.stringify(astroPublications, null, 2), "utf8");

  logger.log(
    `[fetch_data] ${products.length} products, ${ctx.storeData.collections.length} collections, ${Object.keys(collectionProductsMap).length} collection-product mappings, ${publicationsData.length} publications`,
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
  let cacheExists = await fs.stat(cacheModulesDir).then(() => true).catch(() => false);
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

  let needsInstall = !cacheValid;

  if (cacheValid) {
    // Fast path: remove existing node_modules (may come from template copy), then restore from cache
    await fs.rm(buildModulesDir, { recursive: true, force: true }).catch(() => {});
    await runCommand("cp", ["-r", cacheModulesDir, buildModulesDir], ctx.workingDir, 30_000);

    // Validate: check key modules exist in restored cache
    const KEY_MODULES = ["rollup", "astro", "vite"];
    const checks = await Promise.all(
      KEY_MODULES.map(m => fs.stat(path.join(buildModulesDir, m)).then(() => true).catch(() => false)),
    );
    const missing = KEY_MODULES.filter((_, i) => !checks[i]);
    if (missing.length > 0) {
      logger.warn(`[astro_build] Cache incomplete (missing: ${missing.join(", ")}), clearing and reinstalling`);
      await fs.rm(cacheModulesDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(buildModulesDir, { recursive: true, force: true }).catch(() => {});
      needsInstall = true;
    } else {
      logger.log(`[astro_build] node_modules restored from cache (${ctx.templateId})`);
    }
  }

  if (needsInstall) {
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
 * Post-build validation: check that special pages contain expected markers.
 * Returns a summary string if there are warnings, or null if all OK / skipped.
 * Never throws — validation issues are warnings only, they do not block the build.
 */
async function validateBuildOutput(ctx: BuildContext): Promise<string | null> {
  // Only validate themed builds (rose, etc.), skip "default" or unset templates
  if (!ctx.templateId || ctx.templateId === "default") {
    return null;
  }

  const markers: Array<{ page: string; file: string; marker: string }> = [
    { page: "/cart", file: "cart/index.html", marker: "cart-page-content" },
    { page: "/catalog", file: "catalog/index.html", marker: "catalog-page" },
    { page: "/checkout", file: "checkout/index.html", marker: "<main" },
  ];

  const warnings: string[] = [];

  for (const { page, file, marker } of markers) {
    const filePath = path.join(ctx.distDir, file);
    try {
      const html = await fs.readFile(filePath, "utf8");
      if (!html.includes(marker)) {
        const msg = `[validate] ${page}: missing expected marker ${marker}`;
        logger.warn(msg);
        warnings.push(msg);
      }
    } catch {
      const msg = `[validate] ${page}: file not found (${file})`;
      logger.warn(msg);
      warnings.push(msg);
    }
  }

  if (warnings.length === 0) {
    logger.log("[validate] All special pages passed marker checks");
    return null;
  }

  return `Validation warnings: ${warnings.join("; ")}`;
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

  // Guard: if the site has not been provisioned yet (no storageSlug and no
  // publicUrl from which to derive it), refuse to publish — otherwise we
  // would upload to `sites/<siteId>/` and the subsequent real slug would
  // orphan these files. The async signup flow (`sites.reserve()`) leaves
  // this state briefly; the orphan reaper will complete provisioning and
  // the next publish attempt succeeds.
  if (!ctx.storageSlug && !ctx.publicUrl) {
    throw new Error(
      `site_still_provisioning: site ${ctx.siteId} has no storageSlug/publicUrl yet; try again shortly`,
    );
  }

  // ensureBucket with retry (transient MinIO errors)
  let bucket: string;
  try {
    bucket = await deps.s3.ensureBucket();
  } catch (e1) {
    logger.warn(`[upload] ensureBucket failed (retry in 1s): ${e1 instanceof Error ? e1.message : String(e1)}`);
    await new Promise((r) => setTimeout(r, 1000));
    bucket = await deps.s3.ensureBucket();
  }

  // Determine the site prefix for live serving
  const siteSlug = ctx.storageSlug
    ?? (ctx.publicUrl ? deps.s3.extractSubdomainSlug(ctx.publicUrl) : ctx.siteId);

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
    const sitePrefix = ctx.storageSlug
      ? `sites/${ctx.storageSlug}/`
      : ctx.publicUrl
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
