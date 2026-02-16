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
import { S3StorageService } from "../storage/s3.service";

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
  /** Component registry for page generation */
  registry?: Record<string, ComponentRegistryEntry>;
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
  const archive = archiver("zip", { zlib: { level: 9 } });
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
  };

  // Transition to running
  await updateBuildStatus(deps, buildId, "running");

  try {
    // === Stage 1: MERGE ===
    emitProgress(deps, ctx, "merge", "Loading revision and site data");
    await stageMerge(deps, params, ctx);

    // === Stage 2: GENERATE ===
    emitProgress(deps, ctx, "generate", "Generating Astro project");
    await stageGenerate(deps, params, ctx);

    // === Stage 3: FETCH_DATA ===
    emitProgress(deps, ctx, "fetch_data", "Fetching products and collections");
    await stageFetchData(deps, ctx);

    // === Stage 4: ASTRO_BUILD ===
    emitProgress(deps, ctx, "astro_build", "Running astro build");
    await stageAstroBuild(ctx);

    // === Stage 5: ZIP ===
    emitProgress(deps, ctx, "zip", "Packaging artifact");
    await stageZip(ctx);

    // === Stage 6: UPLOAD ===
    emitProgress(deps, ctx, "upload", "Uploading to S3");
    await stageUpload(deps, ctx);

    // === Stage 7: DEPLOY ===
    emitProgress(deps, ctx, "deploy", "Finalizing build");
    await stageDeploy(deps, ctx);

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
 * Stage 2: GENERATE — Scaffold the Astro project using the scaffold-builder.
 */
async function stageGenerate(
  deps: BuildDependencies,
  params: BuildParams,
  ctx: BuildContext,
): Promise<void> {
  const registry = params.registry ?? {};

  // Build page entries from revision content
  const content = (ctx.revisionData as { content?: unknown[] }).content;
  const pages: PageEntry[] = [];

  if (Array.isArray(content) && content.length > 0) {
    pages.push({
      fileName: "index.astro",
      data: { content: content as any[] },
    });
  }

  const apiUrl = process.env.API_GATEWAY_URL ?? "https://gateway.merfy.ru/api";

  const scaffoldConfig: ScaffoldConfig = {
    outputDir: ctx.workingDir,
    themeName: ctx.templateId,
    pages,
    registry,
    merchantSettings: (ctx.revisionMeta as { merchantSettings?: any })
      .merchantSettings,
    themeDefaults: (ctx.revisionMeta as { themeDefaults?: any }).themeDefaults,
    buildData: {
      siteData: {
        ...ctx.revisionData,
        meta: ctx.revisionMeta,
      },
    },
    dynamicPages: {
      apiUrl,
      shopId: ctx.siteId,
    },
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
  const rpcData = await fetchStoreData(deps.productClient, ctx.tenantId);

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

  // Write products.json for Astro build-time consumption
  const productsPath = path.join(
    ctx.workingDir,
    "src",
    "data",
    "products.json",
  );
  await fs.mkdir(path.dirname(productsPath), { recursive: true });
  await fs.writeFile(productsPath, JSON.stringify(products, null, 2), "utf8");

  // Write collections.json
  if (ctx.storeData.collections.length > 0) {
    const collectionsPath = path.join(
      ctx.workingDir,
      "src",
      "data",
      "collections.json",
    );
    await fs.writeFile(
      collectionsPath,
      JSON.stringify(ctx.storeData.collections, null, 2),
      "utf8",
    );
  }

  logger.log(
    `[fetch_data] ${products.length} products, ${ctx.storeData.collections.length} collections`,
  );
}

/**
 * Stage 4: ASTRO_BUILD — Install dependencies and run `astro build`.
 */
async function stageAstroBuild(ctx: BuildContext): Promise<void> {
  // npm install
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
