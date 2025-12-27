/**
 * Health Check Controller
 *
 * Предоставляет эндпоинты для проверки состояния сервиса:
 * - GET /health — базовая проверка живости (liveness)
 * - GET /health/ready — расширенная проверка готовности (readiness)
 *
 * Используется оркестраторами (Coolify, Docker, Kubernetes) для healthcheck.
 */
import { Controller, Get, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { sql } from 'drizzle-orm';
import { PG_CONNECTION, BILLING_RMQ_SERVICE } from './constants';
import { DomainClient } from './domain/domain.client';
import { CoolifyProvider } from './deployments/coolify.provider';

interface HealthCheck {
  name: string;
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: any,
    @Inject(BILLING_RMQ_SERVICE) private readonly billingClient: ClientProxy,
    private readonly domainClient: DomainClient,
    private readonly coolify: CoolifyProvider,
  ) {}

  /**
   * Базовая проверка живости (liveness probe)
   * Возвращает 200 если сервис запущен
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'sites-service',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Расширенная проверка готовности (readiness probe)
   * Проверяет подключение к зависимостям:
   * - PostgreSQL (обязательно)
   * - RabbitMQ/Billing (обязательно)
   * - Domain Service (опционально)
   * - Coolify API (опционально, только в http mode)
   */
  @Get('health/ready')
  async readiness() {
    const checks: HealthCheck[] = [];
    let healthy = true;

    // 1. Проверка PostgreSQL
    const dbCheck = await this.checkDatabase();
    checks.push(dbCheck);
    if (dbCheck.status === 'down') {
      healthy = false;
    }

    // 2. Проверка RabbitMQ через Billing Service
    const rmqCheck = await this.checkRabbitMQ();
    checks.push(rmqCheck);
    if (rmqCheck.status === 'down') {
      healthy = false;
    }

    // 3. Проверка Domain Service (опционально)
    const domainCheck = await this.checkDomainService();
    checks.push(domainCheck);
    // Domain Service не критичен — есть HTTP fallback

    // 4. Проверка Coolify (опционально, только в http mode)
    if (process.env.COOLIFY_MODE === 'http') {
      const coolifyCheck = await this.checkCoolify();
      checks.push(coolifyCheck);
      // Coolify не критичен для базовой работы
    }

    return {
      status: healthy ? 'ok' : 'degraded',
      service: 'sites-service',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.db.execute(sql`SELECT 1`);
      return {
        name: 'postgresql',
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      this.logger.error(`Database health check failed: ${error}`);
      return {
        name: 'postgresql',
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async checkRabbitMQ(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Ping billing service через RPC
      const response = await firstValueFrom(
        this.billingClient.send('billing.get_plans', {}).pipe(
          timeout(3000),
          catchError(() => of(null)),
        ),
      );

      if (response) {
        return {
          name: 'rabbitmq',
          status: 'up',
          latencyMs: Date.now() - start,
        };
      }

      return {
        name: 'rabbitmq',
        status: 'down',
        latencyMs: Date.now() - start,
        error: 'no_response',
      };
    } catch (error) {
      this.logger.error(`RabbitMQ health check failed: ${error}`);
      return {
        name: 'rabbitmq',
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async checkDomainService(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const isHealthy = await this.domainClient.healthCheck();
      return {
        name: 'domain-service',
        status: isHealthy ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        name: 'domain-service',
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async checkCoolify(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Простая проверка — попытка получить список приложений
      // В реальности CoolifyProvider не имеет метода health, делаем best-effort
      // Проверяем что API URL и token настроены
      const apiUrl = process.env.COOLIFY_API_URL;
      const apiToken = process.env.COOLIFY_API_TOKEN;

      if (!apiUrl || !apiToken) {
        return {
          name: 'coolify',
          status: 'down',
          latencyMs: Date.now() - start,
          error: 'not_configured',
        };
      }

      // Пинг API
      const res = await fetch(`${apiUrl}/api/v1/`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(3000),
      });

      return {
        name: 'coolify',
        status: res.ok ? 'up' : 'down',
        latencyMs: Date.now() - start,
        error: res.ok ? undefined : `http_${res.status}`,
      };
    } catch (error) {
      return {
        name: 'coolify',
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }
}
