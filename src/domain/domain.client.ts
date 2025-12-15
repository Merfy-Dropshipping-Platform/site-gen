import { Injectable, Logger } from '@nestjs/common';

interface GeneratedSubdomain {
  id: string;
  name: string;
  status: string;
  ipAddress?: string;
}

/**
 * DomainClient — HTTP клиент для взаимодействия с Domain Service.
 *
 * Domain Service отвечает за:
 * - Генерацию поддоменов *.merfy.ru с автоматическим созданием A-record в Selectel DNS
 * - Регистрацию кастомных доменов через RegRu API
 * - Управление DNS записями
 *
 * Переменные окружения:
 * - DOMAIN_SERVICE_URL — базовый URL Domain Service (по умолчанию http://localhost:3115)
 */
@Injectable()
export class DomainClient {
  private readonly logger = new Logger(DomainClient.name);
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.DOMAIN_SERVICE_URL ?? 'http://localhost:3115';
  }

  /**
   * Генерирует уникальный поддомен вида xxx.merfy.ru.
   *
   * Domain Service автоматически:
   * 1. Генерирует случайный 12-символьный slug
   * 2. Создаёт A-record в Selectel DNS → MERFY_ZONE_IP
   * 3. Возвращает домен со статусом ACTIVE
   *
   * @returns Сгенерированный поддомен с id и именем
   */
  async generateSubdomain(): Promise<GeneratedSubdomain> {
    const url = `${this.baseUrl}/domains/generate-subdomain`;

    this.logger.log(`Generating subdomain via ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        this.logger.error(`Domain service error ${res.status}: ${errorText}`);
        throw new Error(`domain_service_error_${res.status}`);
      }

      const data = await res.json();

      this.logger.log(`Generated subdomain: ${data.name} (id: ${data.id})`);

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
      this.logger.error(`Failed to generate subdomain: ${e instanceof Error ? e.message : e}`);
      throw new Error('domain_service_unavailable');
    }
  }

  /**
   * Проверяет доступность Domain Service.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
