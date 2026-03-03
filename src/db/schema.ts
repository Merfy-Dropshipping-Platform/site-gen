/**
 * Схемы Drizzle для сервиса «Сайты».
 *
 * Таблицы:
 * - theme — каталог тем для магазинов
 * - site — метаданные сайта в границах тенанта (organization) и его статус
 * - site_domain — подключённые домены и сведения о верификации
 * - site_revision — JSON‑структура (совместима с Puck) и SEO/метаданные
 * - site_build — жизненный цикл сборки и ссылки на артефакты
 * - site_deployment — снимок деплоя (ID приложения/окружения провайдера и публичный URL)
 */
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const siteStatusEnum = pgEnum("site_status", [
  "draft",
  "published",
  "frozen",
  "archived",
]);

/**
 * Каталог тем для магазинов.
 * Темы предопределены и управляются через миграции.
 */
export const theme = pgTable("theme", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  previewDesktop: text("preview_desktop"),
  previewMobile: text("preview_mobile"),
  templateId: text("template_id").notNull(),
  price: integer("price").default(0),
  tags: jsonb("tags").$type<string[]>(),
  badge: text("badge"),
  author: text("author").default("merfy"),
  viewCount: integer("view_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

export const site = pgTable("site", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug"),
  // Возможные статусы: draft|published|frozen|archived (см. siteStatusEnum)
  status: siteStatusEnum("status").default("draft").notNull(),
  // Предыдущий статус (для корректного unfreeze)
  prevStatus: siteStatusEnum("prev_status"),
  // Ссылка на выбранную тему
  themeId: text("theme_id"),
  // @deprecated: Старое JSONB поле theme будет удалено после миграции
  theme: jsonb("theme"),
  currentRevisionId: text("current_revision_id"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  deletedAt: timestamp("deleted_at"),
  frozenAt: timestamp("frozen_at"),
  // Coolify интеграция
  coolifyAppUuid: text("coolify_app_uuid"),
  coolifyProjectUuid: text("coolify_project_uuid"),
  // Domain Service интеграция
  domainId: text("domain_id"),
  // Публичный URL сайта (например, abc123.merfy.ru)
  publicUrl: text("public_url"),
  // Флаг включения server-islands (smart revalidation)
  islandsEnabled: boolean("islands_enabled").default(false).notNull(),
  // Брендинг: логотип и цвета магазина
  branding: jsonb("branding").$type<{
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
  }>(),
});

export const siteDomain = pgTable("site_domain", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  domain: text("domain").notNull(),
  // Возможные статусы: pending|verified|failed (string для гибкости, не enum)
  status: text("status").default("pending").notNull(),
  verificationToken: text("verification_token"),
  verificationType: text("verification_type"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  verifiedAt: timestamp("verified_at"),
});

export const siteRevision = pgTable("site_revision", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  data: jsonb("data"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  createdBy: text("created_by"),
});

export const siteBuildStatusEnum = pgEnum("site_build_status", [
  "queued",
  "running",
  "failed",
  "uploaded",
]);

export const siteBuild = pgTable("site_build", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  revisionId: text("revision_id").notNull(),
  // Статусы сборки: queued|running|failed|uploaded — простая машина состояний
  status: siteBuildStatusEnum("status").default("queued").notNull(),
  artifactUrl: text("artifact_url"),
  s3Bucket: text("s3_bucket"),
  s3KeyPrefix: text("s3_key_prefix"),
  logUrl: text("log_url"),
  // Build progress tracking
  stage: text("stage"),
  percent: integer("percent").default(0),
  message: text("message"),
  // DLX retry tracking
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

export const siteDeploymentStatusEnum = pgEnum("site_deployment_status", [
  "provisioning",
  "deployed",
  "disabled",
  "failed",
]);

export const siteDeployment = pgTable("site_deployment", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  buildId: text("build_id").notNull(),
  coolifyAppId: text("coolify_app_id"),
  coolifyEnvId: text("coolify_env_id"),
  // Статусы деплоя: provisioning|deployed|disabled|failed
  status: siteDeploymentStatusEnum("status").default("provisioning").notNull(),
  url: text("url"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

/**
 * Локальные товары сайта.
 * Используются для генерации статических страниц без интеграции с Product Service.
 * Альтернатива полноценному каталогу — простые товары для одностраничников.
 */
export const siteProduct = pgTable("site_product", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull().default(0), // в копейках
  compareAtPrice: integer("compare_at_price"), // старая цена (зачёркнутая)
  images: jsonb("images").$type<string[]>().default([]),
  slug: text("slug"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

/**
 * История доменов сайта.
 * Отслеживает смену доменов (generated → purchased → external).
 * При переключении домена предыдущий помечается inactive.
 */
export const siteDomainHistory = pgTable("site_domain_history", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  domainName: text("domain_name").notNull(),
  domainId: text("domain_id"), // ID from domain service (nullable for external)
  type: text("type").notNull(), // 'generated' | 'purchased' | 'external'
  status: text("status").notNull(), // 'active' | 'inactive'
  attachedAt: timestamp("attached_at")
    .$defaultFn(() => new Date())
    .notNull(),
  detachedAt: timestamp("detached_at"),
});

/**
 * Маппинг тенантов на Coolify Projects.
 * Каждый тенант = отдельный проект в Coolify.
 * Используется для изоляции сайтов разных компаний.
 */
export const tenantProject = pgTable("tenant_project", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().unique(),
  coolifyProjectUuid: text("coolify_project_uuid").notNull(),
  coolifyProjectName: text("coolify_project_name"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});
