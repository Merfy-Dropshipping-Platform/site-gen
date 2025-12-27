import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { DOMAIN_RMQ_SERVICE } from '../constants';

interface GeneratedSubdomain {
  id: string;
  name: string;
  status: string;
  ipAddress?: string;
}

interface RpcResponse<T> {
  success: boolean;
  domain?: T;
  error?: string;
}

/**
 * DomainClient — клиент для взаимодействия с Domain Service.
 *
 * Использует RPC через RabbitMQ как основной канал связи,
 * с fallback на HTTP при недоступности RPC.
 *
 * Domain Service отвечает за:
 * - Генерацию поддоменов *.merfy.ru с автоматическим созданием A-record в Selectel DNS
 * - Регистрацию кастомных доменов через RegRu API
 * - Управление DNS записями
 *
 * RPC паттерны:
 * - domain.generate_subdomain — генерация поддомена
 * - domain.create_custom_subdomain — создание кастомного поддомена
 * - domain.get_domain — получение информации о домене
 * - domain.health — проверка состояния сервиса
 *
 * Переменные окружения:
 * - DOMAIN_SERVICE_URL — базовый URL Domain Service для HTTP fallback (по умолчанию http://localhost:3115)
 * - DOMAIN_RPC_TIMEOUT — таймаут RPC запросов в мс (по умолчанию 10000)
 */
@Injectable()
export class DomainClient implements OnModuleInit {
  private readonly logger = new Logger(DomainClient.name);
  private readonly httpBaseUrl: string;
  private readonly rpcTimeout: number;
  private rpcAvailable = true;

  constructor(
    @Optional() @Inject(DOMAIN_RMQ_SERVICE) private readonly domainClient?: ClientProxy,
  ) {
    this.httpBaseUrl = process.env.DOMAIN_SERVICE_URL ?? 'http://localhost:3115';
    this.rpcTimeout = parseInt(process.env.DOMAIN_RPC_TIMEOUT ?? '10000', 10);
  }

  async onModuleInit() {
    // Проверяем доступность RPC при старте
    if (this.domainClient) {
      try {
        await this.domainClient.connect();
        this.logger.log('Connected to Domain Service via RabbitMQ');
      } catch (error) {
        this.logger.warn(
          `Failed to connect to Domain Service via RPC, will use HTTP fallback: ${
            error instanceof Error ? error.message : error
          }`,
        );
        this.rpcAvailable = false;
      }
    } else {
      this.logger.warn('DOMAIN_RMQ_SERVICE not injected, using HTTP only');
      this.rpcAvailable = false;
    }
  }

  /**
   * Генерирует уникальный поддомен вида xxx.merfy.ru.
   *
   * Пытается использовать RPC, при неудаче переключается на HTTP.
   *
   * @param tenantId - UUID тенанта для генерации детерминированного поддомена
   * @returns Сгенерированный поддомен с id и именем
   */
  async generateSubdomain(tenantId: string): Promise<GeneratedSubdomain> {
    this.logger.log(`Generating subdomain for tenant ${tenantId}`);

    // Пробуем RPC
    if (this.rpcAvailable && this.domainClient) {
      try {
        const result = await this.generateSubdomainViaRpc(tenantId);
        if (result) {
          return result;
        }
      } catch (error) {
        this.logger.warn(
          `RPC failed, falling back to HTTP: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Fallback на HTTP
    return this.generateSubdomainViaHttp(tenantId);
  }

  /**
   * RPC вызов для генерации поддомена
   */
  private async generateSubdomainViaRpc(tenantId: string): Promise<GeneratedSubdomain | null> {
    if (!this.domainClient) {
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.domainClient.send<RpcResponse<GeneratedSubdomain>>('domain.generate_subdomain', { tenantId }).pipe(
          timeout(this.rpcTimeout),
          catchError((err) => {
            this.logger.warn(`RPC domain.generate_subdomain error: ${err.message}`);
            return of(null);
          }),
        ),
      );

      if (!response) {
        return null;
      }

      if (!response.success) {
        throw new Error(response.error ?? 'rpc_error');
      }

      const domain = response.domain;
      if (!domain) {
        throw new Error('domain_not_returned');
      }

      this.logger.log(`RPC: Generated subdomain: ${domain.name} (id: ${domain.id}) for tenant ${tenantId}`);

      return {
        id: domain.id,
        name: domain.name,
        status: domain.status ?? 'ACTIVE',
        ipAddress: domain.ipAddress,
      };
    } catch (error) {
      this.logger.warn(`RPC generateSubdomain failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  /**
   * HTTP вызов для генерации поддомена (fallback)
   */
  private async generateSubdomainViaHttp(tenantId: string): Promise<GeneratedSubdomain> {
    const url = `${this.httpBaseUrl}/domains/generate-subdomain`;

    this.logger.log(`HTTP fallback: Generating subdomain for tenant ${tenantId} via ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ tenantId }),
        signal: AbortSignal.timeout(this.rpcTimeout),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        this.logger.error(`Domain service HTTP error ${res.status}: ${errorText}`);
        throw new Error(`domain_service_error_${res.status}`);
      }

      const data = await res.json();

      this.logger.log(`HTTP: Generated subdomain: ${data.name} (id: ${data.id}) for tenant ${tenantId}`);

      return {
        id: data.id,
        name: data.name,
        status: data.status ?? 'ACTIVE',
        ipAddress: data.ipAddress,
      };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('domain_service_error')) {
        throw e;
      }
      this.logger.error(`HTTP generateSubdomain failed: ${e instanceof Error ? e.message : e}`);
      throw new Error('domain_service_unavailable');
    }
  }

  /**
   * Создаёт кастомный поддомен (например, myshop.merfy.ru)
   *
   * @param subdomain - Желаемое имя поддомена (без .merfy.ru)
   * @returns Созданный поддомен
   */
  async createCustomSubdomain(subdomain: string): Promise<GeneratedSubdomain> {
    this.logger.log(`Creating custom subdomain: ${subdomain}`);

    // Пробуем RPC
    if (this.rpcAvailable && this.domainClient) {
      try {
        const response = await firstValueFrom(
          this.domainClient
            .send<RpcResponse<GeneratedSubdomain>>('domain.create_custom_subdomain', { subdomain })
            .pipe(
              timeout(this.rpcTimeout),
              catchError((err) => {
                this.logger.warn(`RPC domain.create_custom_subdomain error: ${err.message}`);
                return of(null);
              }),
            ),
        );

        if (response?.success && response.domain) {
          this.logger.log(`RPC: Created custom subdomain: ${response.domain.name}`);
          return {
            id: response.domain.id,
            name: response.domain.name,
            status: response.domain.status ?? 'ACTIVE',
            ipAddress: response.domain.ipAddress,
          };
        }
      } catch (error) {
        this.logger.warn(
          `RPC createCustomSubdomain failed, falling back to HTTP: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Fallback на HTTP
    const url = `${this.httpBaseUrl}/domains/create-custom-subdomain`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ subdomainName: subdomain }),
      signal: AbortSignal.timeout(this.rpcTimeout),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      this.logger.error(`Domain service HTTP error ${res.status}: ${errorText}`);
      throw new Error(`domain_service_error_${res.status}`);
    }

    const data = await res.json();

    this.logger.log(`HTTP: Created custom subdomain: ${data.name}`);

    return {
      id: data.id,
      name: data.name,
      status: data.status ?? 'ACTIVE',
      ipAddress: data.ipAddress,
    };
  }

  /**
   * Получает информацию о домене
   *
   * @param domainName - Имя домена
   * @returns Информация о домене
   */
  async getDomain(domainName: string): Promise<GeneratedSubdomain | null> {
    this.logger.log(`Getting domain info: ${domainName}`);

    // Пробуем RPC
    if (this.rpcAvailable && this.domainClient) {
      try {
        const response = await firstValueFrom(
          this.domainClient.send<RpcResponse<GeneratedSubdomain>>('domain.get_domain', { domainName }).pipe(
            timeout(this.rpcTimeout),
            catchError((err) => {
              this.logger.warn(`RPC domain.get_domain error: ${err.message}`);
              return of(null);
            }),
          ),
        );

        if (response?.success && response.domain) {
          return {
            id: response.domain.id,
            name: response.domain.name,
            status: response.domain.status ?? 'ACTIVE',
            ipAddress: response.domain.ipAddress,
          };
        }
      } catch (error) {
        this.logger.warn(
          `RPC getDomain failed, falling back to HTTP: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Fallback на HTTP
    try {
      const res = await fetch(`${this.httpBaseUrl}/domains/${encodeURIComponent(domainName)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.rpcTimeout),
      });

      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        throw new Error(`domain_service_error_${res.status}`);
      }

      const data = await res.json();

      return {
        id: data.id,
        name: data.name,
        status: data.status ?? 'ACTIVE',
        ipAddress: data.ipAddress,
      };
    } catch (e) {
      this.logger.warn(`HTTP getDomain failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /**
   * Проверяет доступность Domain Service.
   */
  async healthCheck(): Promise<boolean> {
    // Пробуем RPC
    if (this.rpcAvailable && this.domainClient) {
      try {
        const response = await firstValueFrom(
          this.domainClient.send<{ success: boolean }>('domain.health', {}).pipe(
            timeout(3000),
            catchError(() => of(null)),
          ),
        );

        if (response?.success) {
          return true;
        }
      } catch {
        // Продолжаем с HTTP
      }
    }

    // Fallback на HTTP
    try {
      const res = await fetch(`${this.httpBaseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
