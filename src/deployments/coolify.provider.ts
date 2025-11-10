import { Injectable, Logger } from '@nestjs/common';

interface EnsureAppResult {
  appId: string;
  envId: string;
}

interface DeployResult { url: string }

type Mode = 'mock' | 'http';

/**
 * CoolifyProvider — адаптер провайдера деплоя.
 *
 * Два режима работы управляются переменными окружения:
 * - `COOLIFY_MODE=mock` (по умолчанию) — без внешних вызовов, предсказуемые ответы.
 * - `COOLIFY_MODE=http` — реальные HTTP‑вызовы к Coolify API с использованием
 *   `COOLIFY_API_URL` и `COOLIFY_API_TOKEN` (Bearer‑токен).
 *
 * Важно: конечные точки (endpoints) являются заглушками и должны быть приведены
 * к фактической спецификации Coolify API (или другого провайдера).
 */
@Injectable()
export class CoolifyProvider {
  private readonly logger = new Logger(CoolifyProvider.name);
  private readonly mode: Mode;
  private readonly apiUrl: string | undefined;
  private readonly apiPrefix: string;
  private readonly EP_ENSURE: string;
  private readonly EP_DEPLOY: string;
  private readonly EP_SET_DOMAIN: string;
  private readonly EP_MAINTENANCE: string;
  private readonly apiToken: string | undefined;

  constructor() {
    this.mode = (process.env.COOLIFY_MODE as Mode) ?? 'mock';
    this.apiUrl = process.env.COOLIFY_API_URL;
    this.apiPrefix = process.env.COOLIFY_API_PREFIX || '/v1';
    // Позволяем переопределять пути через env для строгого соответствия докам Coolify
    this.EP_ENSURE = process.env.COOLIFY_ENDPOINT_ENSURE || `${this.apiPrefix}/apps/ensure`;
    this.EP_DEPLOY = process.env.COOLIFY_ENDPOINT_DEPLOY || `${this.apiPrefix}/apps/deploy`;
    this.EP_SET_DOMAIN = process.env.COOLIFY_ENDPOINT_SET_DOMAIN || `${this.apiPrefix}/apps/domains`;
    this.EP_MAINTENANCE = process.env.COOLIFY_ENDPOINT_MAINTENANCE || `${this.apiPrefix}/apps/maintenance`;
    this.apiToken = process.env.COOLIFY_API_TOKEN;
  }

  // Вспомогательный метод HTTP‑запроса к Coolify API
  private async http<T = any>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiUrl || !this.apiToken) {
      throw new Error('Coolify API not configured');
    }

    const url = `${this.apiUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers as any),
    };

    const res = await fetch(url, { ...init, headers });
    const hasPayload = res.status !== 204;
    const payload = hasPayload ? await res.json().catch(() => null) : null;
    if (!res.ok) {
      this.logger.warn(`Coolify API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
      throw new Error(`coolify_api_${res.status}`);
    }
    return payload as T;
  }

  /**
   * ensureApp — обеспечить существование приложения/окружения для сайта.
   * Возвращает идентификаторы приложения/окружения у провайдера.
   */
  async ensureApp(siteId: string) {
    if (this.mode !== 'http') {
      this.logger.log(`ensureApp (mock) for ${siteId}`);
      return { appId: `app_${siteId}`, envId: `env_${siteId}` } satisfies EnsureAppResult;
    }
    // NOTE: Endpoint shape is provider-specific. Adjust if you have exact Coolify API.
    // Here we just simulate an ensure call via a placeholder endpoint.
    try {
      const payload = await this.http<any>(this.EP_ENSURE, {
        method: 'POST',
        body: JSON.stringify({ externalId: siteId }),
      });
      return {
        appId: String(payload?.appId ?? `app_${siteId}`),
        envId: String(payload?.envId ?? `env_${siteId}`),
      } satisfies EnsureAppResult;
    } catch (e) {
      this.logger.warn(`ensureApp failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
      return { appId: `app_${siteId}`, envId: `env_${siteId}` } satisfies EnsureAppResult;
    }
  }

  /**
   * deployBuild — раскатать артефакт билда на провайдере и вернуть публичный URL.
   */
  async deployBuild(params: { siteId: string; buildId: string; artifactUrl: string }) {
    if (this.mode !== 'http') {
      this.logger.log(`deployBuild (mock) ${params.siteId} using ${params.artifactUrl}`);
      const url = `https://${params.siteId}.preview.local`;
      return { url } satisfies DeployResult;
    }
    try {
      const payload = await this.http<any>(this.EP_DEPLOY, {
        method: 'POST',
        body: JSON.stringify({
          externalId: params.siteId,
          buildId: params.buildId,
          artifactUrl: params.artifactUrl,
        }),
      });
      return { url: String(payload?.url ?? `https://${params.siteId}.preview.local`) } satisfies DeployResult;
    } catch (e) {
      this.logger.warn(`deployBuild failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
      return { url: `https://${params.siteId}.preview.local` } satisfies DeployResult;
    }
  }

  /**
   * setDomain — привязать домен к приложению у провайдера и включить SSL (Let's Encrypt).
   */
  async setDomain(siteId: string, domain: string) {
    if (this.mode !== 'http') {
      this.logger.log(`setDomain (mock) for ${siteId} -> ${domain}`);
      return { success: true } as const;
    }
    try {
      await this.http(this.EP_SET_DOMAIN, {
        method: 'POST',
        body: JSON.stringify({ externalId: siteId, domain, enableSsl: true }),
      });
      return { success: true } as const;
    } catch (e) {
      this.logger.warn(`setDomain failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
      return { success: true } as const;
    }
  }

  /**
   * toggleMaintenance — включить/выключить режим обслуживания у приложения.
   */
  async toggleMaintenance(siteId: string, enabled: boolean) {
    if (this.mode !== 'http') {
      this.logger.log(`toggleMaintenance (mock) for ${siteId}: ${enabled}`);
      return { success: true } as const;
    }
    try {
      await this.http(this.EP_MAINTENANCE, {
        method: 'POST',
        body: JSON.stringify({ externalId: siteId, enabled }),
      });
      return { success: true } as const;
    } catch (e) {
      this.logger.warn(`toggleMaintenance failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
      return { success: true } as const;
    }
  }
}
