/**
 * Схемы Drizzle для сервиса «Сайты».
 *
 * Таблицы:
 * - site — метаданные сайта в границах тенанта (organization) и его статус
 * - site_domain — подключённые домены и сведения о верификации
 * - site_revision — JSON‑структура (совместима с Puck) и SEO/метаданные
 * - site_build — жизненный цикл сборки и ссылки на артефакты
 * - site_deployment — снимок деплоя (ID приложения/окружения провайдера и публичный URL)
 */
import { pgEnum, pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const siteStatusEnum = pgEnum('site_status', [
  'draft',
  'published',
  'frozen',
  'archived',
]);

export const site = pgTable('site', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug'),
  // Возможные статусы: draft|published|frozen|archived (см. siteStatusEnum)
  status: siteStatusEnum('status').default('draft').notNull(),
  // Предыдущий статус (для корректного unfreeze)
  prevStatus: siteStatusEnum('prev_status'),
  theme: jsonb('theme'),
  currentRevisionId: text('current_revision_id'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  deletedAt: timestamp('deleted_at'),
  frozenAt: timestamp('frozen_at'),
});

export const siteDomain = pgTable('site_domain', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  domain: text('domain').notNull(),
  // Возможные статусы: pending|verified|failed (string для гибкости, не enum)
  status: text('status').default('pending').notNull(),
  verificationToken: text('verification_token'),
  verificationType: text('verification_type'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  verifiedAt: timestamp('verified_at'),
});

export const siteRevision = pgTable('site_revision', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  data: jsonb('data'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  createdBy: text('created_by'),
});

export const siteBuildStatusEnum = pgEnum('site_build_status', [
  'queued',
  'running',
  'failed',
  'uploaded',
]);

export const siteBuild = pgTable('site_build', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  revisionId: text('revision_id').notNull(),
  // Статусы сборки: queued|running|failed|uploaded — простая машина состояний
  status: siteBuildStatusEnum('status').default('queued').notNull(),
  artifactUrl: text('artifact_url'),
  s3Bucket: text('s3_bucket'),
  s3KeyPrefix: text('s3_key_prefix'),
  logUrl: text('log_url'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  completedAt: timestamp('completed_at'),
  error: text('error'),
});

export const siteDeploymentStatusEnum = pgEnum('site_deployment_status', [
  'provisioning',
  'deployed',
  'disabled',
  'failed',
]);

export const siteDeployment = pgTable('site_deployment', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  buildId: text('build_id').notNull(),
  coolifyAppId: text('coolify_app_id'),
  coolifyEnvId: text('coolify_env_id'),
  // Статусы деплоя: provisioning|deployed|disabled|failed
  status: siteDeploymentStatusEnum('status').default('provisioning').notNull(),
  url: text('url'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull(),
});
