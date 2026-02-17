/**
 * BillingEventsConsumer
 *
 * Подключается к RabbitMQ fanout exchange `billing.events` и слушает
 * события billing для синхронизации состояния сайтов.
 *
 * События:
 * - billing.subscription.updated: заморозка/разморозка сайтов
 * - sites.unfreeze_tenant: явная команда на разморозку
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel, ConsumeMessage } from "amqplib";
import { ClientProxy } from "@nestjs/microservices";
import { USER_RMQ_SERVICE } from "../constants";
import { SitesDomainService } from "../sites.service";

const BILLING_EVENTS_EXCHANGE = "billing.events";
const SITES_BILLING_QUEUE = "sites_billing_events";

interface SubscriptionUpdatedPayload {
  event?: string;
  subscriptionId?: string;
  accountId?: string;
  tenantId?: string;
  status?: string;
  previousStatus?: string;
  shopsLimit?: number;
  planName?: string;
  timestamp?: string;
}

interface UnfreezeTenantPayload {
  tenantId: string;
  accountId?: string;
}

@Injectable()
export class BillingEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingEventsConsumer.name);
  private connection: amqp.AmqpConnectionManager | null = null;
  private channelWrapper: ChannelWrapper | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(USER_RMQ_SERVICE)
    private readonly userClient: ClientProxy,
    private readonly sites: SitesDomainService,
  ) {}

  async onModuleInit() {
    const rabbitmqUrl = this.configService.get<string>("RABBITMQ_URL");
    if (!rabbitmqUrl) {
      this.logger.warn(
        "RABBITMQ_URL not configured, billing events consumer disabled",
      );
      return;
    }

    try {
      this.connection = amqp.connect([rabbitmqUrl]);

      this.connection.on("connect", () => {
        this.logger.log("BillingEventsConsumer connected to RabbitMQ");
      });

      this.connection.on("disconnect", (params: { err?: Error }) => {
        this.logger.warn(
          `BillingEventsConsumer disconnected: ${params.err?.message ?? "unknown"}`,
        );
      });

      this.channelWrapper = this.connection.createChannel({
        setup: async (channel: Channel) => {
          // Создаём/проверяем exchange (должен уже существовать от publisher)
          await channel.assertExchange(BILLING_EVENTS_EXCHANGE, "fanout", {
            durable: true,
          });

          // Создаём уникальную очередь для sites service
          const q = await channel.assertQueue(SITES_BILLING_QUEUE, {
            durable: true,
            // autoDelete: false - очередь сохраняется при перезапуске
          });

          // Привязываем очередь к exchange (для fanout routing key игнорируется)
          await channel.bindQueue(q.queue, BILLING_EVENTS_EXCHANGE, "");

          // Начинаем потребление сообщений
          await channel.consume(
            q.queue,
            (msg: ConsumeMessage | null) => this.handleMessage(msg, channel),
            { noAck: false },
          );

          this.logger.log(
            `Listening to ${BILLING_EVENTS_EXCHANGE} exchange via ${SITES_BILLING_QUEUE} queue`,
          );
        },
      });

      await this.channelWrapper.waitForConnect();
    } catch (error) {
      this.logger.error(
        `Failed to initialize BillingEventsConsumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.channelWrapper) {
        await this.channelWrapper.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      this.logger.warn(
        `Error closing BillingEventsConsumer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async handleMessage(msg: ConsumeMessage | null, channel: Channel) {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      const eventName = content.event ?? msg.fields.routingKey;

      this.logger.debug(`Received event: ${eventName}`);

      switch (eventName) {
        case "billing.subscription.updated":
          await this.handleSubscriptionUpdated(content);
          break;
        case "sites.unfreeze_tenant":
          await this.handleUnfreezeTenant(content);
          break;
        default:
          this.logger.debug(`Ignoring unknown event: ${eventName}`);
      }

      // Подтверждаем обработку сообщения
      channel.ack(msg);
    } catch (error) {
      this.logger.error(
        `Error processing message: ${error instanceof Error ? error.message : error}`,
      );
      // При ошибке - отклоняем сообщение без requeue (чтобы избежать infinite loop)
      channel.nack(msg, false, false);
    }
  }

  /**
   * Обрабатывает событие обновления подписки.
   * Заморозка/разморозка сайтов в зависимости от статуса.
   */
  private async handleSubscriptionUpdated(payload: SubscriptionUpdatedPayload) {
    try {
      // Получаем tenantId из payload или через user service
      let tenantId = payload?.tenantId;

      if (!tenantId && payload?.accountId) {
        tenantId = await this.getTenantIdByAccountId(payload.accountId);
      }

      if (!tenantId) {
        this.logger.warn(
          `billing.subscription.updated: cannot determine tenantId for accountId=${payload?.accountId}`,
        );
        return;
      }

      const status = String(payload?.status ?? "").toLowerCase();
      const previousStatus = String(
        payload?.previousStatus ?? "",
      ).toLowerCase();

      // Определяем нужно ли заморозить или разморозить
      const freezeStatuses = ["past_due", "frozen", "canceled"];
      const shouldFreeze = freezeStatuses.includes(status);
      const wasFreeze = freezeStatuses.includes(previousStatus);

      if (shouldFreeze && !wasFreeze) {
        const result = await this.sites.freezeTenant(tenantId);
        this.logger.log(
          `Tenant ${tenantId} frozen by billing event (status=${status}), affected=${result.affected}`,
        );
      } else if (!shouldFreeze && wasFreeze) {
        const result = await this.sites.unfreezeTenant(tenantId);
        this.logger.log(
          `Tenant ${tenantId} unfrozen by billing event (status=${status}), affected=${result.affected}`,
        );
      } else {
        this.logger.debug(
          `No freeze/unfreeze action for tenant ${tenantId} (status=${status}, previousStatus=${previousStatus})`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Failed to process billing.subscription.updated: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * Обрабатывает явную команду на разморозку сайтов tenant'а.
   */
  private async handleUnfreezeTenant(payload: UnfreezeTenantPayload) {
    try {
      const tenantId = payload.tenantId;
      if (!tenantId) {
        this.logger.warn("sites.unfreeze_tenant: tenantId is missing");
        return;
      }

      const result = await this.sites.unfreezeTenant(tenantId);
      this.logger.log(
        `Tenant ${tenantId} unfrozen by explicit command, affected=${result.affected}`,
      );
    } catch (e) {
      this.logger.error(
        `Failed to process sites.unfreeze_tenant: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * Получает tenantId по accountId через user service.
   */
  private async getTenantIdByAccountId(
    accountId: string,
  ): Promise<string | undefined> {
    try {
      const res: any = await new Promise((resolve, reject) => {
        const sub = this.userClient
          .send("user.get_active_organization", { accountId })
          .subscribe({
            next: (v) => resolve(v),
            error: reject,
            complete: () => sub.unsubscribe(),
          });
      });
      return res?.organizationId ?? undefined;
    } catch (e) {
      this.logger.warn(
        `Failed to get tenantId for accountId ${accountId}: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }
}
