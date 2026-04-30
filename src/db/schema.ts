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
 * - site_policy — тексты политик магазина (доставка, возврат, конфиденциальность, условия)
 * - site_contacts — контактная информация компании
 */
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const publicationStatusEnum = pgEnum("publication_status", [
  "draft",
  "scheduled",
  "published",
  "archived",
]);

export const publicationCategoryEnum = pgEnum("publication_category", [
  "news",
  "blog",
  "articles",
]);

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
  // Phase 2e: theme becomes a full preset — design tokens, default Puck content,
  // and a list of Google Fonts to preload live alongside the display metadata.
  // `tokens` follows W3C Design Tokens shape (same as packages/theme-*/tokens.json).
  tokens: jsonb("tokens"),
  // `content` is a full Puck JSON (shape matches siteRevision.data) used as the
  // starting state when a tenant applies this theme to a site.
  content: jsonb("content"),
  // Google Fonts families to preload in the storefront `<head>` for this theme.
  fontsPreload: jsonb("fonts_preload").$type<string[]>(),
  // Bump when preset schema changes in a breaking way. Seed loader compares.
  presetVersion: integer("preset_version").default(1).notNull(),
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
  // Публичный URL сайта (например, abc123.merfy.ru или merfy24.shop)
  publicUrl: text("public_url"),
  // Неизменяемый slug для S3-хранилища (задаётся один раз при создании, например cdf63de393ab)
  storageSlug: text("storage_slug"),
  // Флаг включения server-islands (smart revalidation)
  islandsEnabled: boolean("islands_enabled").default(false).notNull(),
  // Брендинг: логотип и цвета магазина
  branding: jsonb("branding").$type<{
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    favicons?: {
      universal?: string;
      dark?: string;
      light?: string;
      apple?: string;
    };
  }>(),
  // Настройки магазина (checkout, регистрация и т.д.)
  settings: jsonb("settings").$type<{
    requireCustomerAuth?: boolean;
  }>(),
  // Закреплённая версия темы (e.g. "1.2.0"). Null = использовать latest.
  themeVersion: text("theme_version"),
  // Флаг необходимости перестроить сайт после смены темы/версии
  needsRebuild: boolean("needs_rebuild").default(false).notNull(),
  // Phase 2e: per-tenant overrides of theme-level tokens. When present, these
  // take precedence over packages/theme-<name>/tokens.json during the build.
  // Shape: W3C Design Tokens (partial — only overridden keys).
  customTokens: jsonb("custom_tokens"),
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

/**
 * Live media slots — merchant uploads from the constructor keyed by
 * (site_id, block_id). Live storefront fetches the current URL at runtime
 * via `/api/sites/:id/blocks/:blockId/media`, so changing a video or
 * image does NOT require rebuilding the Astro artifact or writing a new
 * site_revision row. The constructor writes to this table directly
 * whenever a file is uploaded — Save/Publish stay pure workflow steps
 * for structural changes (block order, copy, etc.), not for media refresh.
 */
export const siteMedia = pgTable("site_media", {
  siteId: text("site_id").notNull(),
  blockId: text("block_id").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type"),
  coverImage: text("cover_image"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
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

/**
 * Публикации сайта (новости, блог, статьи).
 * Tenant isolation через organizationId.
 * Slug уникален в рамках одного siteId.
 */
export const publications = pgTable(
  "publications",
  {
    id: text("id").primaryKey(),
    organizationId: varchar("organization_id", { length: 255 }).notNull(),
    siteId: text("site_id").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    category: publicationCategoryEnum("category").default("news").notNull(),
    content: text("content").default("").notNull(),
    excerpt: varchar("excerpt", { length: 500 }).default(""),
    coverImageUrl: text("cover_image_url"),
    status: publicationStatusEnum("status").default("draft").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    orgIdx: index("idx_publications_org").on(table.organizationId),
    siteIdx: index("idx_publications_site").on(table.siteId),
    statusIdx: index("idx_publications_status").on(table.status),
    slugSiteUniq: uniqueIndex("idx_publications_slug_site").on(
      table.slug,
      table.siteId,
    ),
  }),
);

// ── Политики и контакты магазина ──

export const policyTypeEnum = pgEnum("policy_type", [
  "refund",
  "privacy",
  "tos",
  "shipping",
]);

/**
 * Тексты политик магазина.
 * Каждый сайт может иметь по одному тексту каждого типа.
 * При билде генерируются статические страницы /refund, /privacy, /terms, /shipping.
 */
export const sitePolicy = pgTable("site_policy", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  type: policyTypeEnum("type").notNull(),
  content: text("content").default(""),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

/**
 * Контактная информация компании.
 * Пользователь может добавлять произвольные поля (телефон, email, адрес и т.д.)
 * с возможностью перетаскивания для изменения порядка.
 */
export const siteContacts = pgTable("site_contacts", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().unique(),
  fields: jsonb("fields")
    .$type<{ id: string; label: string; value: string; order: number }[]>()
    .default([]),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ── Health Monitor: Auto-Repair Log ──

export const repairActionEnum = pgEnum("repair_action", [
  "rebuild_queued",
  "skipped_limit",
  "skipped_grace_period",
  "skipped_minio_down",
]);

export const repairResultEnum = pgEnum("repair_result", [
  "success",
  "failure",
  "pending",
]);

/**
 * Лог автоматического восстановления сайтов.
 * Записывается при каждом обнаружении деградации и каждом действии.
 * Retry counter вычисляется как COUNT(action='rebuild_queued') за последние 24ч.
 */
export const siteRepairLog = pgTable(
  "site_repair_log",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    detectedAt: timestamp("detected_at")
      .$defaultFn(() => new Date())
      .notNull(),
    action: repairActionEnum("action").notNull(),
    siteStatusCode: integer("site_status_code"),
    healthStatusCode: integer("health_status_code"),
    buildId: text("build_id"),
    result: repairResultEnum("result"),
    resolvedAt: timestamp("resolved_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    siteIdx: index("idx_repair_log_site_id").on(table.siteId),
    detectedIdx: index("idx_repair_log_detected_at").on(table.detectedAt),
  }),
);

// ── Theme System: Migration Audit Trail ──

/**
 * Аудит-лог миграций тем (смена темы или версии темы для сайта).
 * Записывается при каждом переключении theme/theme_version на сайте.
 * `report` хранит JSON с деталями diff-а (что изменилось в настройках/данных).
 */
export const siteThemeMigrations = pgTable(
  "site_theme_migrations",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    fromTheme: text("from_theme").notNull(),
    fromVersion: text("from_version").notNull(),
    toTheme: text("to_theme").notNull(),
    toVersion: text("to_version").notNull(),
    report: jsonb("report").notNull(),
    timestamp: timestamp("timestamp")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    siteIdx: index("idx_site_theme_migrations_site_id").on(table.siteId),
    timestampIdx: index("idx_site_theme_migrations_timestamp").on(
      table.timestamp,
    ),
  }),
);

export type SiteThemeMigration = typeof siteThemeMigrations.$inferSelect;
export type NewSiteThemeMigration = typeof siteThemeMigrations.$inferInsert;
