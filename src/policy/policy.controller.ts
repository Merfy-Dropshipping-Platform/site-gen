/**
 * RMQ-контроллер для политик и контактов магазина.
 *
 * Обрабатывает паттерны сообщений:
 * - sites.policy.get -- получить все политики сайта
 * - sites.policy.update -- создать или обновить политику
 * - sites.contacts.get -- получить контакты сайта
 * - sites.contacts.update -- создать или обновить контакты
 */
import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { PolicyService } from "./policy.service";
import { ContactsService } from "./contacts.service";

@Controller()
export class PolicyController {
  private readonly logger = new Logger(PolicyController.name);

  constructor(
    private readonly policyService: PolicyService,
    private readonly contactsService: ContactsService,
  ) {}

  /**
   * Получить все политики сайта.
   */
  @MessagePattern("sites.policy.get")
  async getPolicies(@Payload() data: any) {
    try {
      this.logger.log(`policy.get request: ${JSON.stringify(data)}`);
      const { siteId } = data ?? {};

      if (!siteId) {
        return { success: false, message: "siteId is required" };
      }

      const policies = await this.policyService.getBySiteId(siteId);
      return { success: true, data: policies };
    } catch (e: any) {
      this.logger.error("policy.get failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  /**
   * Создать или обновить политику.
   */
  @MessagePattern("sites.policy.update")
  async updatePolicy(@Payload() data: any) {
    try {
      this.logger.log(`policy.update request: ${JSON.stringify(data)}`);
      const { siteId, type, content } = data ?? {};

      if (!siteId || !type) {
        return { success: false, message: "siteId and type are required" };
      }

      const policy = await this.policyService.upsert(
        siteId,
        type,
        content ?? "",
      );
      return { success: true, data: policy };
    } catch (e: any) {
      this.logger.error("policy.update failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  /**
   * Получить контакты сайта.
   */
  @MessagePattern("sites.contacts.get")
  async getContacts(@Payload() data: any) {
    try {
      this.logger.log(`contacts.get request: ${JSON.stringify(data)}`);
      const { siteId } = data ?? {};

      if (!siteId) {
        return { success: false, message: "siteId is required" };
      }

      const contacts = await this.contactsService.getBySiteId(siteId);
      return { success: true, data: contacts };
    } catch (e: any) {
      this.logger.error("contacts.get failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  /**
   * Создать или обновить контакты.
   */
  @MessagePattern("sites.contacts.update")
  async updateContacts(@Payload() data: any) {
    try {
      this.logger.log(`contacts.update request: ${JSON.stringify(data)}`);
      const { siteId, fields } = data ?? {};

      if (!siteId) {
        return { success: false, message: "siteId is required" };
      }

      const contacts = await this.contactsService.upsert(
        siteId,
        fields ?? [],
      );
      return { success: true, data: contacts };
    } catch (e: any) {
      this.logger.error("contacts.update failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }
}
