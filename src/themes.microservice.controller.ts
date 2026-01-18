/**
 * RMQ‑контроллер для работы с темами.
 *
 * Обрабатывает паттерны сообщений:
 * - themes.list: получить список активных тем
 * - themes.get: получить тему по ID
 * - themes.get_by_slug: получить тему по slug
 */
import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { ThemesService } from "./themes.service";

@Controller()
export class ThemesMicroserviceController {
  private readonly logger = new Logger(ThemesMicroserviceController.name);

  constructor(private readonly themesService: ThemesService) {}

  @MessagePattern("themes.list")
  async listThemes(@Payload() data: any) {
    try {
      this.logger.log(`themes.list request: ${JSON.stringify(data)}`);
      const { isActive } = data ?? {};
      const result = await this.themesService.list({
        isActive: isActive !== false,
      });
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error("themes.list failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("themes.get")
  async getTheme(@Payload() data: any) {
    try {
      this.logger.log(`themes.get request: ${JSON.stringify(data)}`);
      const { id } = data ?? {};
      if (!id) return { success: false, message: "id is required" };
      const theme = await this.themesService.getById(id);
      if (!theme) return { success: false, message: "not_found" };
      return { success: true, theme };
    } catch (e: any) {
      this.logger.error("themes.get failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("themes.get_by_slug")
  async getThemeBySlug(@Payload() data: any) {
    try {
      this.logger.log(`themes.get_by_slug request: ${JSON.stringify(data)}`);
      const { slug } = data ?? {};
      if (!slug) return { success: false, message: "slug is required" };
      const theme = await this.themesService.getBySlug(slug);
      if (!theme) return { success: false, message: "not_found" };
      return { success: true, theme };
    } catch (e: any) {
      this.logger.error("themes.get_by_slug failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("themes.increment_view")
  async incrementView(@Payload() data: any) {
    try {
      const { id } = data ?? {};
      if (!id) return { success: false, message: "id is required" };
      await this.themesService.incrementViewCount(id);
      return { success: true };
    } catch (e: any) {
      this.logger.error("themes.increment_view failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }
}
