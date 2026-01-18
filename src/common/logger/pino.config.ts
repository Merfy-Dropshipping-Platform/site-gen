import { Params } from "nestjs-pino";

export const pinoConfig: Params = {
  pinoHttp: {
    // Development: красивый цветной вывод
    // Production: JSON формат для Loki
    ...(process.env.NODE_ENV !== "production" && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          levelFirst: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
          singleLine: false,
          messageFormat: "{req.method} {req.url} {msg}",
        },
      },
    }),

    level: process.env.LOG_LEVEL || "info",

    // Форматирование
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },

    // Метаданные
    base: {
      service: process.env.SERVICE_NAME || "sites-service",
      env: process.env.NODE_ENV || "development",
    },

    // Correlation ID для трейсинга
    genReqId: (req) => req.headers["x-correlation-id"] || req.id,

    // Игнорировать /health и /metrics
    autoLogging: {
      ignore: (req) =>
        req.url === "/health" ||
        req.url === "/api/health" ||
        req.url === "/metrics",
    },

    // Фильтрация RabbitMQ ошибок (аналог FilteredLogger)
    customLogLevel: (req, res, err) => {
      // Глушим ошибки RabbitMQ транспорта
      if (err && "context" in err && (err as any).context === "Server") {
        return "silent";
      }

      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },

    // Сериализация
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        headers: {
          "user-agent": req.headers["user-agent"],
          "x-correlation-id": req.headers["x-correlation-id"],
        },
      }),
      res: (res) => ({ statusCode: res.statusCode }),
      err: (err) => ({
        type: err.type,
        message: err.message,
        stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
      }),
    },
  },
};
