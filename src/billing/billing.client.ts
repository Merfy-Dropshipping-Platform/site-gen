/**
 * BillingClient — RPC клиент для взаимодействия с Billing Service.
 *
 * Позволяет получать информацию о подписке и лимитах тенанта:
 * - shopsLimit — максимальное количество сайтов по тарифу
 * - staffLimit — лимит сотрудников
 * - frozen — заморожен ли аккаунт
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom, timeout, catchError, of } from "rxjs";
import { BILLING_RMQ_SERVICE } from "../constants";

export interface BillingEntitlements {
  shopsLimit: number;
  staffLimit: number;
  frozen: boolean;
  planName?: string;
  status?: string;
}

@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name);

  constructor(
    @Inject(BILLING_RMQ_SERVICE)
    private readonly billingClient: ClientProxy,
  ) {}

  /**
   * Получает entitlements (лимиты) для тенанта.
   *
   * @param tenantId - UUID организации/тенанта
   * @returns Entitlements с лимитами и статусом
   */
  async getEntitlements(tenantId: string): Promise<BillingEntitlements> {
    try {
      const result = await firstValueFrom(
        this.billingClient.send("billing.get_entitlements", { tenantId }).pipe(
          timeout(5000),
          catchError((err) => {
            this.logger.warn(
              `Failed to get entitlements for tenant ${tenantId}: ${err.message}`,
            );
            // Возвращаем дефолтные значения при ошибке (graceful degradation)
            return of(this.getDefaultEntitlements());
          }),
        ),
      );

      return {
        shopsLimit: result?.shopsLimit ?? 1,
        staffLimit: result?.staffLimit ?? 1,
        frozen: result?.frozen ?? false,
        planName: result?.planName,
        status: result?.status,
      };
    } catch (e) {
      this.logger.error(
        `getEntitlements error for tenant ${tenantId}: ${e instanceof Error ? e.message : e}`,
      );
      return this.getDefaultEntitlements();
    }
  }

  /**
   * Проверяет, может ли тенант создать ещё один сайт.
   *
   * @param tenantId - UUID тенанта
   * @param currentSiteCount - текущее количество сайтов
   * @returns true если можно создать сайт
   */
  async canCreateSite(
    tenantId: string,
    currentSiteCount: number,
  ): Promise<{ allowed: boolean; limit: number; reason?: string }> {
    const entitlements = await this.getEntitlements(tenantId);

    if (entitlements.frozen) {
      return {
        allowed: false,
        limit: entitlements.shopsLimit,
        reason: "account_frozen",
      };
    }

    if (currentSiteCount >= entitlements.shopsLimit) {
      return {
        allowed: false,
        limit: entitlements.shopsLimit,
        reason: "shops_limit_reached",
      };
    }

    return {
      allowed: true,
      limit: entitlements.shopsLimit,
    };
  }

  /**
   * Дефолтные entitlements при недоступности Billing Service.
   * Разрешаем 1 сайт — минимальный уровень для работы.
   */
  private getDefaultEntitlements(): BillingEntitlements {
    return {
      shopsLimit: 1,
      staffLimit: 1,
      frozen: false,
    };
  }
}
