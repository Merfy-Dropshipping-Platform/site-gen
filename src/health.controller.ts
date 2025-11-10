// Простой HTTP‑эндпоинт для проверки живости сервиса
// Используется оркестраторами (Coolify, Docker, Kubernetes) для healthcheck
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'sites-service',
      timestamp: new Date().toISOString(),
    };
  }
}
