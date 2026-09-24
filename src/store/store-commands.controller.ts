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
import { CreateStoreCommand } from "./commands/create-store.command";
import { SetThemeCommand } from "./theme-switch/set-theme.command";
import { toRpcResponse, type CommandResult } from "./commands/command-result";
import {
  LIFECYCLE_REPOSITORY,
  type LifecycleRepository,
} from "./lifecycle/lifecycle.repository";
import { toStoreView } from "./store-view";

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
    private readonly lifecycle: Pick<LifecycleRepository, "read">,
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
    const { tenantId, siteId } = (data ?? {}) as {
      tenantId?: string;
      siteId?: string;
    };
    if (!tenantId || !siteId)
      return failure("invalid_input", "tenantId and siteId are required");
    const row = await this.lifecycle.read(siteId);
    // Граница тенанта: чужой магазин неотличим от несуществующего.
    if (!row || row.tenantId !== tenantId || row.deletedAt)
      return failure("site_not_found");
    return { success: true, data: toStoreView(row) };
  }

  private async run<E>(
    name: string,
    work: () => Promise<CommandResult<E>>,
  ): Promise<Record<string, unknown>> {
    try {
      return toRpcResponse(await work());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`sites.cmd.${name} failed: ${message}`);
      return failure("internal_error", message);
    }
  }
}
