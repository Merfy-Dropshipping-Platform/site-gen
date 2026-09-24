/**
 * Сага рождения магазина как ДАННЫЕ (этап 3, кусок 3.1).
 *
 * План: merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И3:
 * «reserved → seeded → provisioned → ready, плюс failed с причиной, числом
 * попыток и временем следующей; шаги идемпотентны; один доводчик двигает всё,
 * что не ready».
 *
 * Доводчик level-triggered: следующий шаг выводится из ФАКТОВ строки магазина
 * (есть ревизия, домен, проект Coolify, маршрут хостинга), а не из записанного
 * состояния. Записанное состояние — сводка для людей и для выборки «что ещё не
 * готово». Здесь проверяется только чистая часть: таблица шагов, наблюдение и
 * расписание повторов.
 */
import {
  LEASE_MS,
  LIFECYCLE_STEPS,
  RETRY_DELAYS_MS,
  failedAttempt,
  isStateAtLeast,
  observeLifecycle,
  progressed,
  retryDelayMs,
  type LifecycleFacts,
  type LifecycleStep,
} from "../store-lifecycle";
import { COOLIFY_RPC_TIMEOUT_MS } from "../../../constants";
import { DEFAULT_DOMAIN_RPC_TIMEOUT_MS } from "../../../domain/domain.client";
import { RmqOrganizationDirectory } from "../../../user/organization-directory.client";

const none: LifecycleFacts = {
  hasRevision: false,
  hasDomain: false,
  hasProject: false,
  hasHosting: false,
};

describe("observeLifecycle: следующий шаг выводится из фактов строки", () => {
  it.each<[string, Partial<LifecycleFacts>, string, string | null]>([
    ["только строка — нужен сид", {}, "reserved", "seed"],
    [
      "есть ревизия — нужен домен и проект",
      { hasRevision: true },
      "seeded",
      "provision",
    ],
    [
      "есть ревизия и домен, нет проекта Coolify — провижининг не закончен",
      { hasRevision: true, hasDomain: true },
      "seeded",
      "provision",
    ],
    [
      "есть ревизия и проект, нет домена (упал REG.RU) — провижининг не закончен",
      { hasRevision: true, hasProject: true },
      "seeded",
      "provision",
    ],
    [
      "домен и проект есть, нет маршрута хостинга",
      { hasRevision: true, hasDomain: true, hasProject: true },
      "provisioned",
      "route",
    ],
    [
      "всё на месте — готов",
      {
        hasRevision: true,
        hasDomain: true,
        hasProject: true,
        hasHosting: true,
      },
      "ready",
      null,
    ],
    [
      "нет ревизии, но домен уже есть — первое невыполненное требование решает",
      { hasDomain: true, hasProject: true },
      "reserved",
      "seed",
    ],
  ])("%s", (_title, facts, state, next) => {
    expect(observeLifecycle({ ...none, ...facts })).toEqual({ state, next });
  });
});

describe("isStateAtLeast: порядок состояний для «остановиться после»", () => {
  it.each<[string, string, boolean]>([
    ["reserved", "seeded", false],
    ["seeded", "seeded", true],
    ["provisioned", "seeded", true],
    ["ready", "provisioned", true],
    ["seeded", "ready", false],
  ])("%s ≥ %s → %s", (state, target, expected) => {
    expect(isStateAtLeast(state as never, target as never)).toBe(expected);
  });
});

describe("повторы доводчика: нарастающая пауза с потолком, без «сдаться»", () => {
  it("пауза растёт по таблице и упирается в потолок в один час", () => {
    const delays = Array.from({ length: 10 }, (_, i) => retryDelayMs(i + 1));
    expect(delays.slice(0, RETRY_DELAYS_MS.length)).toEqual([
      ...RETRY_DELAYS_MS,
    ]);
    expect(delays[0]).toBe(30_000);
    expect(Math.max(...delays)).toBe(60 * 60_000);
    // Старый reaper ретраил каждые 10 минут бесконечно — доводчик тоже не
    // сдаётся: после таблицы попытки идут раз в час.
    expect(delays.slice(RETRY_DELAYS_MS.length)).toEqual([
      3_600_000, 3_600_000, 3_600_000,
    ]);
  });

  it("пауза монотонно не убывает", () => {
    for (let i = 1; i < RETRY_DELAYS_MS.length; i++) {
      expect(RETRY_DELAYS_MS[i]).toBeGreaterThanOrEqual(RETRY_DELAYS_MS[i - 1]);
    }
  });

  /**
   * Одна аренда покрывает весь проход: захват или вставка команды → seed →
   * provision → route. Бюджет шага — из настоящих пределов ожидания внешних
   * вызовов в коде; поднимут таймаут Coolify или domain-сервиса — тест скажет,
   * что аренду пора удлинить (иначе второй доводчик войдёт в строку посреди
   * прохода и сделает работу дважды).
   */
  it("аренда покрывает весь проход seed + provision + route с запасом ×2", () => {
    const budget: Record<LifecycleStep, number> = {
      // Локально: пакет темы с диска и запись ревизии, без сети.
      seed: 10_000,
      // Имя компании (user-сервис), затем параллельно: REG.RU (RPC, потом
      // HTTP-запасной путь с тем же пределом) и проект Coolify.
      provision:
        RmqOrganizationDirectory.TIMEOUT_MS +
        Math.max(2 * DEFAULT_DOMAIN_RPC_TIMEOUT_MS, COOLIFY_RPC_TIMEOUT_MS),
      // App Coolify (RPC) или роутер центрального прокси (файл).
      route: COOLIFY_RPC_TIMEOUT_MS,
    };
    const drive = LIFECYCLE_STEPS.reduce((sum, s) => sum + budget[s.step], 0);

    expect(LEASE_MS).toBeGreaterThanOrEqual(2 * drive);
  });
});

describe("записи исхода шага", () => {
  it("успех сбрасывает ошибку и счётчик попыток", () => {
    expect(progressed("provisioned", "keep")).toEqual({
      state: "provisioned",
      error: null,
      attempts: 0,
      nextAt: "keep",
    });
  });

  it("падение: failed + причина с именем шага + счётчик + пауза по таблице", () => {
    expect(failedAttempt(0, "provision", "REG.RU timeout")).toEqual({
      state: "failed",
      error: "provision: REG.RU timeout",
      attempts: 1,
      nextAt: { inMs: 30_000 },
    });
    expect(failedAttempt(3, "route", "coolify down")).toEqual({
      state: "failed",
      error: "route: coolify down",
      attempts: 4,
      nextAt: { inMs: RETRY_DELAYS_MS[3] },
    });
  });

  it("длинная причина обрезается — в строку магазина не попадает стек на килобайты", () => {
    const rec = failedAttempt(0, "seed", "x".repeat(5000));
    expect(rec.error!.length).toBeLessThanOrEqual(500);
  });
});
