/**
 * DeploymentsService
 *
 * Оркестрирует деплой через провайдера (Coolify). Сохраняет снимок `site_deployment`
 * для аудита и отслеживания, возвращает публичный URL.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { PG_CONNECTION } from '../constants';
import { CoolifyProvider } from './coolify.provider';

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly coolify: CoolifyProvider,
  ) {}

  async deploy(params: { tenantId: string; siteId: string; buildId: string; artifactUrl: string }) {
    const ensure = await this.coolify.ensureApp(params.siteId);
    const { url } = await this.coolify.deployBuild({
      siteId: params.siteId,
      buildId: params.buildId,
      artifactUrl: params.artifactUrl,
    });

    const id = randomUUID();
    const now = new Date();
    await this.db.insert(schema.siteDeployment).values({
      id,
      siteId: params.siteId,
      buildId: params.buildId,
      coolifyAppId: ensure.appId,
      coolifyEnvId: ensure.envId,
      status: 'deployed',
      url,
      createdAt: now,
      updatedAt: now,
    });
    return { deploymentId: id, url };
  }
}
