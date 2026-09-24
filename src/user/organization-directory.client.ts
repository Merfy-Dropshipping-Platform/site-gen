/**
 * Справочник организаций (user-сервис) для sites.
 *
 * Этап 3, И2: имя компании для проекта Coolify решает sites, один раз, а не
 * шлюз. Раньше шлюз перед `sites.create_site` сам звал
 * `user.get_organization_info` (`api-gateway/src/auth/auth.service.ts`,
 * `getOrganizationName`) и передавал `companyName` в теле RPC. Здесь тот же
 * RPC, те же правила: нет имени / сбой / таймаут — `null`.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom, of, timeout, catchError } from "rxjs";
import { USER_RMQ_SERVICE } from "../constants";

export interface OrganizationDirectory {
  /** Имя организации (тенанта) или `null`, если user-сервис его не дал. */
  nameOf(tenantId: string): Promise<string | null>;
}

export const ORGANIZATION_DIRECTORY = Symbol("ORGANIZATION_DIRECTORY");

type OrganizationInfo = { success?: boolean; name?: unknown } | null;

@Injectable()
export class RmqOrganizationDirectory implements OrganizationDirectory {
  static readonly TIMEOUT_MS = 3_000;
  private readonly logger = new Logger(RmqOrganizationDirectory.name);

  constructor(
    @Inject(USER_RMQ_SERVICE) private readonly userClient: ClientProxy,
  ) {}

  async nameOf(tenantId: string): Promise<string | null> {
    const info = await firstValueFrom(
      this.userClient
        .send<OrganizationInfo>("user.get_organization_info", {
          organizationId: tenantId,
        })
        .pipe(
          timeout(RmqOrganizationDirectory.TIMEOUT_MS),
          catchError((err: unknown) => {
            this.logger.warn(
              `user.get_organization_info failed for ${tenantId}: ${err instanceof Error ? err.message : err}`,
            );
            return of(null);
          }),
        ),
    );
    const name =
      info?.success && typeof info.name === "string" ? info.name.trim() : "";
    return name || null;
  }
}
