export enum SiteHealthStatus {
  Healthy = "healthy",
  Degraded = "degraded",
  Failed = "failed",
  Timeout = "timeout",
}

export interface SiteCheckResult {
  siteId: string;
  tenantId: string;
  publicUrl: string;
  storageSlug: string;
  siteStatusCode: number;
  healthStatusCode: number;
  status: SiteHealthStatus;
}

export interface HealthCheckSummary {
  total: number;
  healthy: number;
  degraded: number;
  failed: number;
  timeout: number;
  repairsTriggered: number;
  repairsSkippedLimit: number;
  repairsSkippedGrace: number;
}
