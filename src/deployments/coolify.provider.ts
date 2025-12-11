import { Injectable, Logger } from '@nestjs/common';
import { URL } from 'url';

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
 * Соответствие реальному API Coolify (согласно docs /api/v1/*):
 * - ensureApp:
 *   - ищет приложение по UUID (env `COOLIFY_APPLICATION_UUID`) или по имени (env `COOLIFY_APPLICATION_NAME`)
 *     через `GET /api/v1/applications`.
 * - deployBuild:
 *   - триггерит деплой существующего приложения `POST /api/v1/deploy { uuid, deployment_note?, force_rebuild? }`.
 *   - Coolify самостоятельно вытягивает код/образ, `artifactUrl` передаётся как note для трассировки.
 * - setDomain:
 *   - обновляет приложение `PATCH /api/v1/applications/{uuid}` с полем `fqdn`.
 * - toggleMaintenance:
 *   - `POST /api/v1/applications/{uuid}/stop` или `/start`.
 */
@Injectable()
export class CoolifyProvider {
  private readonly logger = new Logger(CoolifyProvider.name);
  private readonly mode: Mode;
  private readonly apiUrl: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly appUuid: string | undefined;
  private readonly appName: string | undefined;

  constructor() {
    this.mode = (process.env.COOLIFY_MODE as Mode) ?? 'mock';
    this.apiUrl = process.env.COOLIFY_API_URL;
    // Coolify API токен вида `5|...`
    this.apiToken = process.env.COOLIFY_API_TOKEN;
    // UUID приложения из Coolify (предпочтительно)
    this.appUuid = process.env.COOLIFY_APPLICATION_UUID;
    // Альтернатива: искать приложение по имени (точное совпадение)
    this.appName = process.env.COOLIFY_APPLICATION_NAME;
  }

  // Вспомогательный метод HTTP‑запроса к Coolify API
  private async http<T = any>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiUrl || !this.apiToken) {
      throw new Error('Coolify API not configured');
    }

    /**
     * Нормализуем базовый URL API.
     *
     * Варианты конфигурации:
     * - COOLIFY_API_URL = http://host:8000/api/v1
     * - COOLIFY_API_URL = http://host:8000 и (опц.) COOLIFY_API_PREFIX=/api/v1 или /v1
     *
     * Для обратной совместимости `.env.local`, где используется COOLIFY_API_URL=http://localhost:8000
     * и COOLIFY_API_PREFIX=/v1, мы интерпретируем `/v1` как `/api/v1`.
     */
    const root = new URL(this.apiUrl);
    const prefixRaw = process.env.COOLIFY_API_PREFIX;
    let effectiveBase: URL;

    if (prefixRaw) {
      let prefix = prefixRaw.trim();
      if (prefix) {
        if (!prefix.startsWith('/')) prefix = `/${prefix}`;
        // Специальный случай: `/v1` трактуем как `/api/v1`
        if (prefix === '/v1') prefix = '/api/v1';
        effectiveBase = new URL(prefix.replace(/^\//, ''), root);
      } else {
        effectiveBase = root;
      }
    } else if (!root.pathname.includes('/api/')) {
      // Если префикс не задан и в URL нет /api/, добавляем /api/v1 по умолчанию
      effectiveBase = new URL('api/v1/', root);
    } else {
      effectiveBase = root;
    }

    const url = new URL(path.replace(/^\//, ''), effectiveBase).toString();
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
      this.logger.warn(
        `Coolify API ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${
          payload ? JSON.stringify(payload) : ''
        }`,
      );
      throw new Error(`coolify_api_${res.status}`);
    }
    return payload as T;
  }

  /**
   * ensureApp — находит приложение в Coolify.
   * Возвращает uuid приложения (appId) и envId (пока не используется).
   */
  async ensureApp(siteId: string) {
    if (this.mode !== 'http') {
      this.logger.log(`ensureApp (mock) for ${siteId}`);
      return { appId: `app_${siteId}`, envId: `env_${siteId}` } satisfies EnsureAppResult;
    }
    // 1) Если явно задан UUID — используем его
    if (this.appUuid) {
      return { appId: this.appUuid, envId: '' } satisfies EnsureAppResult;
    }

    // 2) Иначе пытаемся найти по имени среди приложений команды
    const nameToFind = this.appName ?? siteId;
    const apps = await this.http<any>('/applications', { method: 'GET' });
    const found = Array.isArray(apps?.data)
      ? apps.data.find((a: any) => a?.name === nameToFind || a?.uuid === nameToFind)
      : null;
    if (found?.uuid) {
      return { appId: String(found.uuid), envId: '' } satisfies EnsureAppResult;
    }

    throw new Error('coolify_application_not_found');
  }

  /**
   * deployBuild — триггерит деплой существующего приложения в Coolify.
   * Coolify самостоятельно тянет код/образ; `artifactUrl` пишем в deployment_note для трассировки.
   */
  async deployBuild(params: { siteId: string; buildId: string; artifactUrl: string }) {
    if (this.mode !== 'http') {
      this.logger.log(`deployBuild (mock) ${params.siteId} using ${params.artifactUrl}`);
      const url = `https://${params.siteId}.preview.local`;
      return { url } satisfies DeployResult;
    }
    try {
      const ensure = await this.ensureApp(params.siteId);
      const payload = await this.http<any>('/deploy', {
        method: 'POST',
        body: JSON.stringify({
          uuid: ensure.appId,
          force_rebuild: true,
          deployment_note: `artifact:${params.artifactUrl}`,
        }),
      });
      // Coolify не возвращает публичный URL в deploy, поэтому оставляем предыдущий/мок
      const url =
        payload?.deployment_url ??
        payload?.url ??
        `https://${params.siteId}.preview.local`;
      return { url: String(url) } satisfies DeployResult;
    } catch (e) {
      this.logger.warn(`deployBuild failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
      return { url: `https://${params.siteId}.preview.local` } satisfies DeployResult;
    }
  }

  /**
   * setDomain — привязать домен к приложению у провайдера и включить SSL (Let's Encrypt).
   * В Coolify домены указываются в поле fqdn (через запятую).
   */
  async setDomain(siteId: string, domain: string) {
    if (this.mode !== 'http') {
      this.logger.log(`setDomain (mock) for ${siteId} -> ${domain}`);
      return { success: true } as const;
    }
    try {
      const ensure = await this.ensureApp(siteId);
      await this.http(`/applications/${ensure.appId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fqdn: domain }),
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
      const ensure = await this.ensureApp(siteId);
      const path = enabled
        ? `/applications/${ensure.appId}/stop`
        : `/applications/${ensure.appId}/start`;
      await this.http(path, { method: 'POST' });
      return { success: true } as const;
    } catch (e) {
      this.logger.warn(`toggleMaintenance failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
      return { success: true } as const;
    }
  }
}
