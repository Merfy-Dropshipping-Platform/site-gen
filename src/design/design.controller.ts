/**
 * RPC «Дизайна по ссылке» в sites_queue (контракт reports/vizi-design-copy/contract.md, раздел 3; договор —
 * design.contract.ts). Каждый вход проверяется схемой; не по форме — success: false с текстом, а не исключение. Сбой
 * базы — тоже success: false: шлюз отвечает мерчанту понятной ошибкой.
 */
import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { z } from "zod";
import {
  CONFIRM_OWNED_PATTERN,
  ConfirmOwnedSchema,
  FIND_RECENT_PATTERN,
  FindRecentSchema,
  GET_LOOK_PATTERN,
  GetLookSchema,
  IS_OWNED_PATTERN,
  IsOwnedSchema,
  SAVE_LOOK_PATTERN,
  SaveLookSchema,
  type DesignRpcReply,
  type StoredLook,
} from "./design.contract";
import { DesignStore } from "./design.store";

export const NOT_FOUND = "look-not-found";

const failure = (error: string): { success: false; error: string } => ({
  success: false,
  error,
});

@Controller()
export class DesignController {
  private readonly logger = new Logger(DesignController.name);

  constructor(private readonly store: DesignStore) {}

  /** Разобрать вход схемой и выполнить; любой отказ — ответ, а не исключение. */
  private async handle<S extends z.ZodType, T>(
    pattern: string,
    schema: S,
    data: unknown,
    work: (input: z.infer<S>) => Promise<DesignRpcReply<T>>,
  ): Promise<DesignRpcReply<T>> {
    const input = schema.safeParse(data);
    if (!input.success)
      return failure(`invalid: ${z.prettifyError(input.error)}`);
    try {
      return await work(input.data);
    } catch (error) {
      this.logger.error(`${pattern} не выполнен: ${String(error)}`);
      return failure("internal_error");
    }
  }

  @MessagePattern(SAVE_LOOK_PATTERN)
  saveLook(@Payload() data: unknown): Promise<DesignRpcReply<{ id: string }>> {
    return this.handle(
      SAVE_LOOK_PATTERN,
      SaveLookSchema,
      data,
      async (input) => {
        const id = await this.store.save(input);
        this.logger.log(
          `снимок дизайна ${id}: магазин ${input.siteId}, ${new URL(input.url).host}, ${input.tool}/${input.outlineTool}, ${input.ms} мс`,
        );
        return { success: true, data: { id } };
      },
    );
  }

  @MessagePattern(GET_LOOK_PATTERN)
  getLook(@Payload() data: unknown): Promise<DesignRpcReply<StoredLook>> {
    return this.handle(GET_LOOK_PATTERN, GetLookSchema, data, async (input) => {
      const look = await this.store.get(input.siteId, input.lookId);
      return look === null ? failure(NOT_FOUND) : { success: true, data: look };
    });
  }

  @MessagePattern(FIND_RECENT_PATTERN)
  findRecent(
    @Payload() data: unknown,
  ): Promise<DesignRpcReply<StoredLook | null>> {
    return this.handle(
      FIND_RECENT_PATTERN,
      FindRecentSchema,
      data,
      async (input) => ({
        success: true,
        data: await this.store.findRecent(
          input.siteId,
          input.url,
          input.maxAgeMs,
        ),
      }),
    );
  }

  @MessagePattern(CONFIRM_OWNED_PATTERN)
  confirmOwned(
    @Payload() data: unknown,
  ): Promise<DesignRpcReply<{ ok: true }>> {
    return this.handle(
      CONFIRM_OWNED_PATTERN,
      ConfirmOwnedSchema,
      data,
      async (input) => {
        await this.store.confirmOwned(input.siteId, input.domain, input.userId);
        this.logger.log(
          `«сайт мой»: магазин ${input.siteId}, домен ${input.domain}`,
        );
        return { success: true, data: { ok: true } };
      },
    );
  }

  @MessagePattern(IS_OWNED_PATTERN)
  isOwned(
    @Payload() data: unknown,
  ): Promise<DesignRpcReply<{ owned: boolean }>> {
    return this.handle(
      IS_OWNED_PATTERN,
      IsOwnedSchema,
      data,
      async (input) => ({
        success: true,
        data: { owned: await this.store.isOwned(input.siteId, input.domain) },
      }),
    );
  }
}
