/**
 * RPC-вход команд и запросов магазина (этап 3, порт П3 StoreCommands).
 *
 *   sites.cmd.create_store    — `CreateStore` (кусок 3.2)
 *   sites.cmd.set_theme       — `SetTheme` (кусок 3.3)
 *   sites.query.store_status  — вид магазина с состоянием рождения (И3)
 *
 * Ответ команды — эффект (`{ success: true, data }`) или отказ с машинным
 * `code` и деталями (`{ success: false, code, message, …}`), см.
 * commands/command-result.ts. Старые `sites.create_site` / `sites.update_site`
 * работают как раньше — шлюз переедет на команды отдельным куском (3.5).
 */
import { Controller, Inject, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { z } from "zod";
import { CreateStoreCommand } from "./commands/create-store.command";
import { SetThemeCommand } from "./theme-switch/set-theme.command";
import {
  ok,
  refused,
  toRpcResponse,
  type CommandResult,
} from "./commands/command-result";
import {
  LIFECYCLE_REPOSITORY,
  type LifecycleRepository,
} from "./lifecycle/lifecycle.repository";
import { toStoreView, type StoreView } from "./store-view";
import { issuesOf } from "./shared/input-issues";
import { errorMessage } from "./shared/error-message";

export const StoreStatusInputSchema = z.object({
  tenantId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
});

function failure(code: string, message = code) {
  return { success: false, code, message };
}

@Controller()
export class StoreCommandsController {
  private readonly logger = new Logger(StoreCommandsController.name);

  constructor(
    @Inject(CreateStoreCommand)
    private readonly createStoreCommand: Pick<CreateStoreCommand, "execute">,
    @Inject(SetThemeCommand)
    private readonly setThemeCommand: Pick<SetThemeCommand, "execute">,
    @Inject(LIFECYCLE_REPOSITORY)
    private readonly lifecycle: Pick<LifecycleRepository, "readOwned">,
  ) {}

  @MessagePattern("sites.cmd.create_store")
  async createStore(@Payload() data: unknown) {
    return this.run("create_store", () =>
      this.createStoreCommand.execute(data),
    );
  }

  @MessagePattern("sites.cmd.set_theme")
  async setTheme(@Payload() data: unknown) {
    return this.run("set_theme", () => this.setThemeCommand.execute(data));
  }

  @MessagePattern("sites.query.store_status")
  async storeStatus(@Payload() data: unknown) {
    return this.run("store_status", () => this.findStore(data));
  }

  private async findStore(data: unknown): Promise<CommandResult<StoreView>> {
    const parsed = StoreStatusInputSchema.safeParse(data);
    if (!parsed.success)
      return refused("invalid_input", { issues: issuesOf(parsed.error) });
    const row = await this.lifecycle.readOwned(
      parsed.data.tenantId,
      parsed.data.siteId,
    );
    // Чужой магазин неотличим от несуществующего: граница тенанта — в запросе.
    return row ? ok(toStoreView(row)) : refused("site_not_found");
  }

  private async run<E>(
    name: string,
    work: () => Promise<CommandResult<E>>,
  ): Promise<Record<string, unknown>> {
    try {
      return toRpcResponse(await work());
    } catch (e) {
      const message = errorMessage(e);
      this.logger.error(`sites.cmd.${name} failed: ${message}`);
      return failure("internal_error", message);
    }
  }
}
