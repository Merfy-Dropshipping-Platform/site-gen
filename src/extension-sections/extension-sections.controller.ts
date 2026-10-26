/**
 * Секции и глобальные скрипты расширений (блок 12 «Секций и SDK», 12.6, 12.7,
 * 12.10) — вход сервиса extensions по sites_queue. Договор —
 * extension-sections.contract.ts (копия — в extensions, src/sites/).
 *
 * - sites.extension.section.accept — сохранить секцию способом extension:
 *   файлы уходят сборщику витрин (POST /sections/extension), его ответ —
 *   в ответ RPC.
 * - sites.extension.toggled — расширение включили или выключили: событие
 *   extension-toggle сборщику; StorefrontHandoff шлёт его только магазину
 *   новой темы, пять тем не пересобираются.
 */
import { Controller, Logger } from "@nestjs/common";
import { EventPattern, MessagePattern, Payload } from "@nestjs/microservices";
import { z } from "zod";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";
import {
  StorefrontBuilderClient,
  type BuilderAnswer,
} from "../storefront-preview/storefront-builder.client";
import {
  EXTENSION_TOGGLED_PATTERN,
  ExtensionToggledSchema,
  SECTION_ACCEPT_PATTERN,
  SectionAcceptRequestSchema,
  type FailureCode,
  type SectionAcceptReply,
} from "./extension-sections.contract";

export const EXTENSION_SECTION_PATH = "/sections/extension";
// Сборка секции и два пробных рендера — до 10 с; запас — как у «сохранить» блока 14 (Р14-18).
export const BUILDER_TIMEOUT_MS = 30_000;
export const EXTENSION_TOGGLE_EVENT = "extension-toggle";
const REFUSED_TEXT = "секция не прошла проверку";

const problemSchema = z.object({
  code: z.string().min(1),
  file: z.string(),
  line: z.number().int().positive().nullable(),
  column: z.number().int().positive().nullable(),
  message: z.string().min(1),
});
const savedSchema = z.object({
  ok: z.literal(true),
  status: z.enum(["accepted", "unchanged"]),
  name: z.string().min(1),
  id: z.string().min(1),
});
const refusedSchema = z.object({
  ok: z.literal(false),
  problems: z.array(problemSchema).min(1),
});
const toolErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});
// Коды ToolError сборщика → коды договора; остальные — tool-failed.
const TOOL_CODES: Partial<Record<string, FailureCode>> = {
  "body-invalid": "body-invalid",
  "name-invalid": "body-invalid",
  "uploads-closed": "uploads-closed",
};

const failure = (code: FailureCode, message: string): SectionAcceptReply => ({
  success: false,
  error: { code, message },
});

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Ответ сборщика → ответ RPC по договору. */
export function replyOf(answer: BuilderAnswer): SectionAcceptReply {
  const body = jsonOf(answer.body);
  const saved = savedSchema.safeParse(body);
  if (answer.status === 200 && saved.success) {
    const { status, name, id } = saved.data;
    return { success: true, data: { status, name, id } };
  }
  const refused = refusedSchema.safeParse(body);
  if (answer.status === 422 && refused.success) {
    return {
      success: false,
      error: {
        code: "refused",
        message: REFUSED_TEXT,
        problems: refused.data.problems,
      },
    };
  }
  const tool = toolErrorSchema.safeParse(body);
  if (tool.success) {
    return failure(
      TOOL_CODES[tool.data.error.code] ?? "tool-failed",
      tool.data.error.message,
    );
  }
  const text = answer.body.slice(0, 200);
  return failure(
    "builder-unavailable",
    text === "" ? `сборщик ответил ${answer.status}` : text,
  );
}

@Controller()
export class ExtensionSectionsController {
  private readonly logger = new Logger(ExtensionSectionsController.name);

  constructor(
    private readonly builder: StorefrontBuilderClient,
    private readonly handoff: StorefrontHandoff,
  ) {}

  @MessagePattern(SECTION_ACCEPT_PATTERN)
  async accept(@Payload() data: unknown): Promise<SectionAcceptReply> {
    const request = SectionAcceptRequestSchema.safeParse(data);
    if (!request.success)
      return failure("body-invalid", z.prettifyError(request.error));
    const { extensionId, release, kind, name, files } = request.data;
    const query = { extension: extensionId, release, kind, name };
    const answer = await this.builder.call(
      EXTENSION_SECTION_PATH,
      query,
      JSON.stringify({ files }),
      BUILDER_TIMEOUT_MS,
    );
    const reply = replyOf(answer);
    const outcome = reply.success ? reply.data.status : reply.error.code;
    this.logger.log(
      `секция ${extensionId}:${name}@${release} (${kind}): ${outcome}`,
    );
    return reply;
  }

  @EventPattern(EXTENSION_TOGGLED_PATTERN)
  async toggled(@Payload() data: unknown): Promise<void> {
    const message = ExtensionToggledSchema.safeParse(data);
    if (!message.success) {
      this.logger.warn(
        `sites.extension.toggled не по договору: ${z.prettifyError(message.error)}`,
      );
      return;
    }
    const { shopId, extensionId, state } = message.data;
    this.logger.log(
      `расширение ${extensionId} ${state} у магазина ${shopId} — пересборка`,
    );
    await this.handoff.notify(
      shopId,
      "extension-toggle",
      EXTENSION_TOGGLED_PATTERN,
    );
  }
}
