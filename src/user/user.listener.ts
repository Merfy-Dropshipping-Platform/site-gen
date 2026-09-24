/**
 * UserListenerController
 *
 * Подписывается на события от user service для асинхронной обработки.
 * - user.registered: создает дефолтный сайт для нового пользователя
 *
 * Этап 3 (merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И1/И2):
 * магазин при регистрации создаёт та же команда `CreateStore`, что кабинет и
 * cron «пользователи без магазина». Листенер сам ничего не решает: лимит
 * тарифа и «у тенанта уже есть магазин» (`ifNoStores`) проверяет команда один
 * раз под блокировкой тенанта; домен и проект Coolify доводит сага. Раньше
 * листенер отдельно спрашивал биллинг и список магазинов, а `reserve()`
 * проверял лимит второй раз.
 */
import { Controller, Inject, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { CreateStoreCommand } from "../store/commands/create-store.command";

interface UserRegisteredPayload {
  userId: string;
  tenantId: string;
  accountId: string;
}

/** Имя магазина, который получает новый пользователь. */
export const REGISTRATION_STORE_NAME = "Мой сайт";

@Controller()
export class UserListenerController {
  private readonly logger = new Logger(UserListenerController.name);

  constructor(
    @Inject(CreateStoreCommand)
    private readonly createStore: Pick<CreateStoreCommand, "execute">,
  ) {}

  @EventPattern("user.registered")
  async handleUserRegistered(
    @Payload() payload: UserRegisteredPayload,
    @Ctx() _ctx: RmqContext,
  ) {
    const { userId, tenantId } = payload ?? ({} as UserRegisteredPayload);
    if (!userId || !tenantId) {
      this.logger.warn("user.registered event missing userId or tenantId");
      return;
    }

    try {
      const result = await this.createStore.execute({
        tenantId,
        actorUserId: userId,
        name: REGISTRATION_STORE_NAME,
        ifNoStores: true,
        wait: false,
        source: "registration",
      });
      if (!result.ok) {
        this.logger.log(
          `Skipping site creation for tenantId=${tenantId}: ${result.error.code}`,
        );
        return;
      }
      this.logger.log(
        result.effect.created
          ? `Default site reserved: siteId=${result.effect.store?.id} tenantId=${tenantId}, provisioning by the store lifecycle`
          : `Skipping site creation for tenantId=${tenantId}: ${result.effect.reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process user.registered event: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
