import { Injectable, Logger } from "@nestjs/common";
import { URL } from "url";

interface EnsureAppResult {
  appId: string;
  envId: string;
}

interface DeployResult {
  url: string;
}

interface CreateApplicationResult {
  uuid: string;
  fqdn: string;
}

interface CreateApplicationParams {
  name: string;
  siteSlug: string;
  dockerImage?: string;
  port?: number;
}

/**
 * CoolifyProvider — адаптер провайдера деплоя.
 *
 * Использует HTTP-вызовы к Coolify API с использованием
 * `COOLIFY_API_URL` и `COOLIFY_API_TOKEN` (Bearer‑токен).
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
  private readonly apiUrl: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly appUuid: string | undefined;
  private readonly appName: string | undefined;

  // Настройки для автоматического создания приложений
  private readonly serverUuid: string | undefined;
  private readonly projectUuid: string | undefined;
  private readonly environmentName: string;
  private readonly wildcardDomain: string;

  constructor() {
    this.apiUrl = process.env.COOLIFY_API_URL;
    // Coolify API токен вида `5|...`
    this.apiToken = process.env.COOLIFY_API_TOKEN;
    // UUID приложения из Coolify (предпочтительно)
    this.appUuid = process.env.COOLIFY_APPLICATION_UUID;
    // Альтернатива: искать приложение по имени (точное совпадение)
    this.appName = process.env.COOLIFY_APPLICATION_NAME;
    // Для создания новых приложений
    this.serverUuid = process.env.COOLIFY_SERVER_UUID;
    this.projectUuid = process.env.COOLIFY_PROJECT_UUID;
    this.environmentName = process.env.COOLIFY_ENVIRONMENT_NAME ?? "production";
    this.wildcardDomain = process.env.COOLIFY_WILDCARD_DOMAIN ?? "merfy.ru";
  }

  // Вспомогательный метод HTTP‑запроса к Coolify API
  private async http<T = any>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiUrl || !this.apiToken) {
      throw new Error("Coolify API not configured");
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
        if (!prefix.startsWith("/")) prefix = `/${prefix}`;
        // Специальный случай: `/v1` трактуем как `/api/v1`
        if (prefix === "/v1") prefix = "/api/v1";
        effectiveBase = new URL(prefix.replace(/^\//, ""), root);
      } else {
        effectiveBase = root;
      }
    } else if (!root.pathname.includes("/api/")) {
      // Если префикс не задан и в URL нет /api/, добавляем /api/v1 по умолчанию
      effectiveBase = new URL("api/v1/", root);
    } else {
      effectiveBase = root;
    }

    const url = new URL(path.replace(/^\//, ""), effectiveBase).toString();
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as any),
    };

    const res = await fetch(url, { ...init, headers });
    const hasPayload = res.status !== 204;
    const payload = hasPayload ? await res.json().catch(() => null) : null;
    if (!res.ok) {
      this.logger.warn(
        `Coolify API ${init?.method ?? "GET"} ${path} failed: ${res.status} ${
          payload ? JSON.stringify(payload) : ""
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
    // 1) Если явно задан UUID — используем его
    if (this.appUuid) {
      return { appId: this.appUuid, envId: "" } satisfies EnsureAppResult;
    }

    // 2) Иначе пытаемся найти по имени среди приложений команды
    const nameToFind = this.appName ?? siteId;
    const apps = await this.http<any>("/applications", { method: "GET" });
    const found = Array.isArray(apps?.data)
      ? apps.data.find(
          (a: any) => a?.name === nameToFind || a?.uuid === nameToFind,
        )
      : null;
    if (found?.uuid) {
      return { appId: String(found.uuid), envId: "" } satisfies EnsureAppResult;
    }

    throw new Error("coolify_application_not_found");
  }

  /**
   * deployBuild — триггерит деплой существующего приложения в Coolify.
   * Coolify самостоятельно тянет код/образ; `artifactUrl` пишем в deployment_note для трассировки.
   */
  async deployBuild(params: {
    siteId: string;
    buildId: string;
    artifactUrl: string;
  }) {
    try {
      const ensure = await this.ensureApp(params.siteId);
      const payload = await this.http<any>("/deploy", {
        method: "POST",
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
      this.logger.warn(
        `deployBuild failed: ${e instanceof Error ? e.message : e}`,
      );
      return {
        url: `https://${params.siteId}.preview.local`,
      } satisfies DeployResult;
    }
  }

  /**
   * setDomain — привязать домен к приложению у провайдера и включить SSL (Let's Encrypt).
   * В Coolify домены указываются в поле fqdn (через запятую).
   */
  async setDomain(siteId: string, domain: string) {
    try {
      const ensure = await this.ensureApp(siteId);
      await this.http(`/applications/${ensure.appId}`, {
        method: "PATCH",
        body: JSON.stringify({ fqdn: domain }),
      });
      return { success: true } as const;
    } catch (e) {
      this.logger.warn(
        `setDomain failed: ${e instanceof Error ? e.message : e}`,
      );
      return { success: true } as const;
    }
  }

  /**
   * toggleMaintenance — включить/выключить режим обслуживания у приложения.
   */
  async toggleMaintenance(siteId: string, enabled: boolean) {
    try {
      const ensure = await this.ensureApp(siteId);
      const path = enabled
        ? `/applications/${ensure.appId}/stop`
        : `/applications/${ensure.appId}/start`;
      await this.http(path, { method: "POST" });
      return { success: true } as const;
    } catch (e) {
      this.logger.warn(
        `toggleMaintenance failed: ${e instanceof Error ? e.message : e}`,
      );
      return { success: true } as const;
    }
  }

  /**
   * createApplication — создаёт новое приложение в Coolify для сайта.
   *
   * Использует Docker Image build pack. Приложение получает домен вида:
   * https://{siteSlug}.{wildcardDomain}
   */
  async createApplication(
    params: CreateApplicationParams,
  ): Promise<CreateApplicationResult> {
    const { name, siteSlug, dockerImage = "nginx:alpine", port = 80 } = params;
    const fqdn = `https://${siteSlug}.${this.wildcardDomain}`;

    if (!this.serverUuid || !this.projectUuid) {
      throw new Error(
        "COOLIFY_SERVER_UUID and COOLIFY_PROJECT_UUID are required",
      );
    }

    try {
      // Создаём приложение из Docker Image
      const appPayload = {
        project_uuid: this.projectUuid,
        server_uuid: this.serverUuid,
        environment_name: this.environmentName,
        name,
        description: `Merfy site: ${name}`,
        docker_registry_image_name: dockerImage.split(":")[0],
        docker_registry_image_tag: dockerImage.split(":")[1] || "latest",
        ports_exposes: String(port),
        domains: fqdn,
        instant_deploy: true,
      };

      this.logger.log(
        `Creating Coolify application: ${JSON.stringify(appPayload)}`,
      );

      const result = await this.http<any>("/applications/dockerimage", {
        method: "POST",
        body: JSON.stringify(appPayload),
      });

      const appUuid = result?.uuid;
      if (!appUuid) {
        throw new Error("Application UUID not returned");
      }

      this.logger.log(
        `Created Coolify application ${appUuid} with fqdn ${fqdn}`,
      );
      return { uuid: appUuid, fqdn };
    } catch (e) {
      this.logger.error(
        `createApplication failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  /**
   * getOrCreateApp — находит существующее приложение по имени или создаёт новое.
   */
  async getOrCreateApp(
    params: CreateApplicationParams,
  ): Promise<CreateApplicationResult> {
    try {
      // Пробуем найти по имени
      const apps = await this.http<any>("/applications");
      const found = Array.isArray(apps)
        ? apps.find((a: any) => a?.name === params.name)
        : null;

      if (found?.uuid) {
        this.logger.log(`Found existing application: ${found.uuid}`);
        return {
          uuid: found.uuid,
          fqdn:
            found.fqdn || `https://${params.siteSlug}.${this.wildcardDomain}`,
        };
      }

      // Не нашли — создаём
      return this.createApplication(params);
    } catch (e) {
      this.logger.warn(
        `getOrCreateApp search failed, creating new: ${e instanceof Error ? e.message : e}`,
      );
      return this.createApplication(params);
    }
  }

  /**
   * startApplication — запускает приложение.
   */
  async startApplication(appUuid: string) {
    try {
      await this.http(`/applications/${appUuid}/start`, { method: "POST" });
      return { success: true };
    } catch (e) {
      this.logger.error(
        `startApplication failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  /**
   * restartApplication — перезапускает приложение для применения изменений.
   */
  async restartApplication(appUuid: string) {
    try {
      await this.http(`/applications/${appUuid}/restart`, { method: "POST" });
      return { success: true };
    } catch (e) {
      this.logger.error(
        `restartApplication failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  /**
   * deleteApplication — удаляет приложение из Coolify.
   */
  async deleteApplication(appUuid: string) {
    try {
      await this.http(`/applications/${appUuid}`, { method: "DELETE" });
      return { success: true };
    } catch (e) {
      this.logger.error(
        `deleteApplication failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  /**
   * getOrCreateProject — находит или создаёт Project в Coolify для компании/tenant.
   *
   * Project в Coolify — это логическая группировка приложений.
   * Один Project соответствует одной компании (tenantId).
   *
   * @param tenantId - идентификатор компании
   * @param companyName - название компании (используется при создании)
   * @returns UUID проекта
   */
  async getOrCreateProject(
    tenantId: string,
    companyName: string,
  ): Promise<string> {
    try {
      // Получаем список проектов
      const projects = await this.http<any[]>("/projects");

      // Ищем проект по имени (tenantId или companyName)
      const found = Array.isArray(projects)
        ? projects.find(
            (p: any) =>
              p?.name === tenantId ||
              p?.name === companyName ||
              p?.description?.includes(tenantId),
          )
        : null;

      if (found?.uuid) {
        this.logger.log(
          `Found existing project ${found.uuid} for tenant ${tenantId}`,
        );
        return found.uuid;
      }

      // Создаём новый проект
      const result = await this.http<any>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: companyName || tenantId,
          description: `Company: ${companyName} (tenant: ${tenantId})`,
        }),
      });

      if (!result?.uuid) {
        throw new Error("Project UUID not returned");
      }

      this.logger.log(`Created project ${result.uuid} for tenant ${tenantId}`);
      return result.uuid;
    } catch (e) {
      this.logger.error(
        `getOrCreateProject failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  /**
   * createSiteApplication — создаёт приложение для сайта с указанным поддоменом.
   *
   * В отличие от createApplication, этот метод:
   * - Принимает projectUuid для группировки по компании
   * - Использует переданный subdomain (из Domain Service) вместо генерации
   * - Оптимизирован для flow sites.create()
   *
   * @param params - параметры создания
   * @returns UUID и URL приложения
   */
  async createSiteApplication(params: {
    projectUuid: string;
    name: string;
    subdomain: string;
    dockerImage?: string;
    port?: number;
  }): Promise<{ uuid: string; url: string }> {
    const {
      projectUuid,
      name,
      subdomain,
      dockerImage = "nginx:alpine",
      port = 80,
    } = params;
    const fqdn = subdomain.startsWith("http")
      ? subdomain
      : `http://${subdomain}`;

    if (!this.serverUuid) {
      throw new Error("COOLIFY_SERVER_UUID is required");
    }

    try {
      const appPayload = {
        project_uuid: projectUuid,
        server_uuid: this.serverUuid,
        environment_name: this.environmentName,
        name,
        description: `Merfy site: ${name}`,
        docker_registry_image_name: dockerImage.split(":")[0],
        docker_registry_image_tag: dockerImage.split(":")[1] || "latest",
        ports_exposes: String(port),
        domains: fqdn,
        instant_deploy: true,
      };

      this.logger.log(
        `Creating Coolify site application: ${JSON.stringify(appPayload)}`,
      );

      const result = await this.http<any>("/applications/dockerimage", {
        method: "POST",
        body: JSON.stringify(appPayload),
      });

      const appUuid = result?.uuid;
      if (!appUuid) {
        throw new Error("Application UUID not returned");
      }

      this.logger.log(
        `Created Coolify site application ${appUuid} with URL ${fqdn}`,
      );
      return { uuid: appUuid, url: fqdn };
    } catch (e) {
      this.logger.error(
        `createSiteApplication failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  /**
   * updateApplicationDomain — обновляет домен приложения.
   *
   * Используется когда нужно изменить домен после создания приложения.
   */
  async updateApplicationDomain(
    appUuid: string,
    domain: string,
  ): Promise<void> {
    const fqdn = domain.startsWith("http") ? domain : `http://${domain}`;

    try {
      await this.http(`/applications/${appUuid}`, {
        method: "PATCH",
        body: JSON.stringify({ domains: fqdn }),
      });
      this.logger.log(`Updated application ${appUuid} domain to ${fqdn}`);
    } catch (e) {
      this.logger.error(
        `updateApplicationDomain failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }

  /**
   * createStaticSiteApp — создаёт Coolify приложение для статического сайта.
   *
   * Использует nginx-minio-proxy из GitHub репо для проксирования к MinIO.
   * Каждый сайт получает своё Coolify приложение с настроенными env vars.
   *
   * @param params - параметры создания
   * @returns UUID приложения и публичный URL
   */
  async createStaticSiteApp(params: {
    projectUuid: string;
    name: string;
    subdomain: string; // abc123.merfy.ru
    sitePath: string; // sites/abc123
  }): Promise<{ uuid: string; url: string }> {
    const { projectUuid, name, subdomain, sitePath } = params;
    const fqdn = `https://${subdomain}`;
    // Используем публичный URL MinIO для nginx (не внутренний S3_ENDPOINT)
    const minioUrl =
      process.env.S3_PUBLIC_ENDPOINT ||
      process.env.MINIO_PUBLIC_ENDPOINT ||
      process.env.S3_ENDPOINT ||
      "https://minio.example.com";
    const bucket = process.env.S3_BUCKET || "merfy-sites";
    const nginxProxyRepo =
      process.env.NGINX_PROXY_REPO ||
      "https://github.com/Merfy-Dropshipping-Platform/nginx-minio-proxy";

    if (!this.serverUuid) {
      throw new Error("COOLIFY_SERVER_UUID is required");
    }

    try {
      // 1. Создаём приложение из публичного GitHub репо
      const appPayload = {
        project_uuid: projectUuid,
        server_uuid: this.serverUuid,
        environment_name: this.environmentName,
        name,
        git_repository: nginxProxyRepo,
        git_branch: "main",
        build_pack: "dockerfile",
        ports_exposes: "80",
        domains: fqdn,
        instant_deploy: false, // Сначала добавим env vars
      };

      this.logger.log(`Creating static site app: ${name} -> ${fqdn}`);

      const result = await this.http<any>("/applications/public", {
        method: "POST",
        body: JSON.stringify(appPayload),
      });

      const appUuid = result?.uuid;
      if (!appUuid) {
        throw new Error("Application UUID not returned");
      }

      // 2. Добавляем environment variables
      const envVars = {
        data: [
          { key: "MINIO_URL", value: minioUrl },
          { key: "BUCKET", value: bucket },
          { key: "SITE_PATH", value: sitePath },
        ],
      };

      await this.http(`/applications/${appUuid}/envs/bulk`, {
        method: "PATCH",
        body: JSON.stringify(envVars),
      });

      // 3. Устанавливаем домен (API может не установить его при создании)
      await this.http(`/applications/${appUuid}`, {
        method: "PATCH",
        body: JSON.stringify({ domains: fqdn }),
      });

      // 4. Запускаем деплой
      await this.http(`/applications/${appUuid}/start`, { method: "POST" });

      this.logger.log(
        `Created static site app ${appUuid}: ${fqdn} -> ${minioUrl}/${bucket}/${sitePath}`,
      );
      return { uuid: appUuid, url: fqdn };
    } catch (e) {
      this.logger.error(
        `createStaticSiteApp failed: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }
}
