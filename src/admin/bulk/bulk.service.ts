import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { eq, inArray, and, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { firstValueFrom } from 'rxjs';
import {
  PG_CONNECTION,
  BILLING_RMQ_SERVICE,
  COOLIFY_RMQ_SERVICE,
  DOMAIN_RMQ_SERVICE,
} from '../../constants';
import * as schema from '../../db/schema';
import {
  BulkOperationType,
  SiteStatus,
  DeleteType,
  ExportFormat,
  ALLOWED_STATUS_TRANSITIONS,
  type BulkChangeStatusDto,
  type BulkFreezeDto,
  type BulkUnfreezeDto,
  type BulkArchiveDto,
  type BulkDeployDto,
  type BulkDeleteDto,
  type BulkExportDto,
  type BulkOperationResult,
  type BulkItemResult,
} from './bulk.dto';

type SiteRow = typeof schema.site.$inferSelect;
type SiteDomainRow = typeof schema.siteDomain.$inferSelect;
type SiteRevisionRow = typeof schema.siteRevision.$inferSelect;

const BATCH_SIZE = 25; // Reduced for complex operations with external services

@Injectable()
export class BulkOperationsService {
  private readonly logger = new Logger(BulkOperationsService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(BILLING_RMQ_SERVICE)
    private readonly billingClient: ClientProxy,
    @Inject(COOLIFY_RMQ_SERVICE)
    private readonly coolifyClient: ClientProxy,
    @Inject(DOMAIN_RMQ_SERVICE)
    private readonly domainClient: ClientProxy,
  ) {}

  /**
   * Bulk change site status with transition validation
   */
  async bulkChangeStatus(dto: BulkChangeStatusDto): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];
    const { ids, params, actorId, reason, tenantId } = dto;

    this.logger.log(
      `[AUDIT] Bulk change status started: actor=${actorId}, count=${ids.length}, newStatus=${params.status}, tenant=${tenantId}, reason=${reason ?? params.reason ?? 'none'}`,
    );

    // Fetch existing sites with tenant validation
    const whereClause = tenantId
      ? and(inArray(schema.site.id, ids), eq(schema.site.tenantId, tenantId))
      : inArray(schema.site.id, ids);

    const existing = await this.db
      .select()
      .from(schema.site)
      .where(whereClause);

    const existingMap = new Map(existing.map((s) => [s.id, s]));

    // Process in batches
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      for (const id of batch) {
        const site = existingMap.get(id);

        if (!site) {
          results.push({
            id,
            success: false,
            error: tenantId ? 'Site not found in tenant scope' : 'Site not found',
          });
          continue;
        }

        const previousStatus = site.status;

        // Skip if already in target status
        if (previousStatus === params.status) {
          results.push({
            id,
            success: true,
            previousValue: previousStatus,
            newValue: params.status,
          });
          continue;
        }

        // Validate status transition (unless skipValidation is true)
        if (!params.skipValidation) {
          const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[previousStatus];
          if (!allowedTransitions.includes(params.status)) {
            results.push({
              id,
              success: false,
              error: `Invalid status transition: ${previousStatus} -> ${params.status}`,
            });
            continue;
          }
        }

        try {
          await this.db.transaction(async (tx) => {
            const updateData: Partial<typeof schema.site.$inferInsert> = {
              status: params.status,
              updatedAt: new Date(),
              updatedBy: actorId,
            };

            // Handle status-specific fields and actions
            if (params.status === SiteStatus.PUBLISHED) {
              // Deploy site if transitioning to published
              if (params.force && previousStatus !== SiteStatus.PUBLISHED) {
                await this.deploySite(site);
              }
            } else if (params.status === SiteStatus.FROZEN) {
              updateData.frozenAt = new Date();
              updateData.prevStatus = previousStatus as any;
              // Enable maintenance mode
              await this.toggleMaintenanceMode(site, true);
            } else if (previousStatus === SiteStatus.FROZEN && params.status !== SiteStatus.FROZEN) {
              updateData.frozenAt = null;
              updateData.prevStatus = null;
              // Disable maintenance mode
              await this.toggleMaintenanceMode(site, false);
            } else if (params.status === SiteStatus.ARCHIVED) {
              // Optional: enable maintenance mode for archived sites
              await this.toggleMaintenanceMode(site, true);
            }

            await tx
              .update(schema.site)
              .set(updateData)
              .where(eq(schema.site.id, id));
          });

          results.push({
            id,
            success: true,
            previousValue: previousStatus,
            newValue: params.status,
            details: {
              tenantId: site.tenantId,
              siteSlug: site.slug,
              reason: reason ?? params.reason,
            },
          });

          this.logger.log(
            `[AUDIT] Status changed: site=${id}, ${previousStatus} -> ${params.status}, actor=${actorId}`,
          );

          // Emit event (best-effort)
          await this.emitSiteEvent('sites.site.status_changed', {
            siteId: id,
            tenantId: site.tenantId,
            fromStatus: previousStatus,
            toStatus: params.status,
            changedBy: actorId,
            reason: reason ?? params.reason,
          });
        } catch (error) {
          const err = error as Error;
          results.push({
            id,
            success: false,
            error: err.message,
          });
          this.logger.error(
            `[AUDIT] Status change failed: site=${id}, error=${err.message}`,
          );
        }
      }
    }

    return this.buildResult(BulkOperationType.CHANGE_STATUS, ids.length, results);
  }

  /**
   * Bulk freeze sites (billing freeze or admin action)
   */
  async bulkFreeze(dto: BulkFreezeDto): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];
    const { ids, params, actorId, reason, tenantId } = dto;

    this.logger.log(
      `[AUDIT] Bulk freeze started: actor=${actorId}, count=${ids.length}, tenant=${tenantId}, reason=${reason ?? params?.reason ?? 'none'}`,
    );

    return this.executeBulkStatusChange(
      ids,
      tenantId,
      SiteStatus.FROZEN,
      actorId,
      reason ?? params?.reason,
      async (site) => {
        // Enable maintenance mode and store previous status
        await this.toggleMaintenanceMode(site, params?.enableMaintenance !== false);
        return {
          frozenAt: new Date(),
          prevStatus: site.status as any,
        };
      },
    );
  }

  /**
   * Bulk unfreeze sites
   */
  async bulkUnfreeze(dto: BulkUnfreezeDto): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];
    const { ids, params, actorId, reason, tenantId } = dto;

    this.logger.log(
      `[AUDIT] Bulk unfreeze started: actor=${actorId}, count=${ids.length}, tenant=${tenantId}, reason=${reason ?? params?.reason ?? 'none'}`,
    );

    // Fetch existing sites to get prevStatus
    const whereClause = tenantId
      ? and(inArray(schema.site.id, ids), eq(schema.site.tenantId, tenantId))
      : inArray(schema.site.id, ids);

    const existing = await this.db
      .select()
      .from(schema.site)
      .where(whereClause);

    const existingMap = new Map(existing.map((s) => [s.id, s]));

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      for (const id of batch) {
        const site = existingMap.get(id);

        if (!site) {
          results.push({
            id,
            success: false,
            error: 'Site not found',
          });
          continue;
        }

        if (site.status !== SiteStatus.FROZEN) {
          results.push({
            id,
            success: false,
            error: `Site not frozen: ${site.status}`,
          });
          continue;
        }

        const targetStatus = params?.restoreToPrevStatus !== false && site.prevStatus
          ? site.prevStatus
          : SiteStatus.DRAFT;

        try {
          await this.db.transaction(async (tx) => {
            await tx
              .update(schema.site)
              .set({
                status: targetStatus as any,
                frozenAt: null,
                prevStatus: null,
                updatedAt: new Date(),
                updatedBy: actorId,
              })
              .where(eq(schema.site.id, id));

            // Disable maintenance mode
            await this.toggleMaintenanceMode(site, false);
          });

          results.push({
            id,
            success: true,
            previousValue: SiteStatus.FROZEN,
            newValue: targetStatus,
            details: {
              restoredToPrevStatus: !!site.prevStatus,
              reason: reason ?? params?.reason,
            },
          });

          this.logger.log(
            `[AUDIT] Site unfrozen: site=${id}, ${SiteStatus.FROZEN} -> ${targetStatus}, actor=${actorId}`,
          );
        } catch (error) {
          const err = error as Error;
          results.push({
            id,
            success: false,
            error: err.message,
          });
        }
      }
    }

    return this.buildResult(BulkOperationType.UNFREEZE, ids.length, results);
  }

  /**
   * Bulk archive sites
   */
  async bulkArchive(dto: BulkArchiveDto): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];
    const { ids, params, actorId, reason, tenantId } = dto;

    this.logger.log(
      `[AUDIT] Bulk archive started: actor=${actorId}, count=${ids.length}, tenant=${tenantId}, reason=${reason ?? params?.reason ?? 'none'}`,
    );

    return this.executeBulkStatusChange(
      ids,
      tenantId,
      SiteStatus.ARCHIVED,
      actorId,
      reason ?? params?.reason,
      async (site) => {
        // Enable maintenance mode for archived sites
        await this.toggleMaintenanceMode(site, true);

        // Optionally preserve data (default: true)
        if (params?.preserveData === false) {
          await this.cleanupSiteAssets(site);
        }

        return {};
      },
    );
  }

  /**
   * Bulk deploy sites (publish with build)
   */
  async bulkDeploy(dto: BulkDeployDto): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];
    const { ids, params, actorId, reason, tenantId } = dto;

    this.logger.log(
      `[AUDIT] Bulk deploy started: actor=${actorId}, count=${ids.length}, tenant=${tenantId}, forceBuild=${params?.forceBuild}, reason=${reason ?? params?.reason ?? 'none'}`,
    );

    // Fetch existing sites
    const whereClause = tenantId
      ? and(inArray(schema.site.id, ids), eq(schema.site.tenantId, tenantId))
      : inArray(schema.site.id, ids);

    const existing = await this.db
      .select()
      .from(schema.site)
      .where(whereClause);

    const existingMap = new Map(existing.map((s) => [s.id, s]));

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      for (const id of batch) {
        const site = existingMap.get(id);

        if (!site) {
          results.push({
            id,
            success: false,
            error: 'Site not found',
          });
          continue;
        }

        // Skip if site is frozen
        if (site.status === SiteStatus.FROZEN) {
          results.push({
            id,
            success: false,
            error: 'Cannot deploy frozen site',
          });
          continue;
        }

        try {
          const previousStatus = site.status;

          // Deploy the site
          const deployResult = await this.deploySite(site, params?.forceBuild);

          // Update status to published if successful
          if (deployResult.success) {
            await this.db
              .update(schema.site)
              .set({
                status: SiteStatus.PUBLISHED,
                updatedAt: new Date(),
                updatedBy: actorId,
              })
              .where(eq(schema.site.id, id));

            results.push({
              id,
              success: true,
              previousValue: previousStatus,
              newValue: SiteStatus.PUBLISHED,
              details: {
                deploymentUrl: deployResult.url,
                buildTime: deployResult.buildTime,
                reason: reason ?? params?.reason,
              },
            });

            this.logger.log(
              `[AUDIT] Site deployed: site=${id}, ${previousStatus} -> published, url=${deployResult.url}, actor=${actorId}`,
            );

            // Emit event
            await this.emitSiteEvent('sites.site.deployed', {
              siteId: id,
              tenantId: site.tenantId,
              deploymentUrl: deployResult.url,
              deployedBy: actorId,
              reason: reason ?? params?.reason,
            });
          } else {
            results.push({
              id,
              success: false,
              error: deployResult.error || 'Deployment failed',
              details: {
                buildLogs: deployResult.logs,
              },
            });
          }
        } catch (error) {
          const err = error as Error;
          results.push({
            id,
            success: false,
            error: err.message,
          });
          this.logger.error(
            `[AUDIT] Deploy failed: site=${id}, error=${err.message}`,
          );
        }
      }
    }

    return this.buildResult(BulkOperationType.DEPLOY, ids.length, results);
  }

  /**
   * Bulk delete sites (soft or hard delete)
   */
  async bulkDelete(dto: BulkDeleteDto): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];
    const { ids, params, actorId, reason, tenantId } = dto;

    this.logger.log(
      `[AUDIT] Bulk delete started: actor=${actorId}, count=${ids.length}, type=${params.type}, tenant=${tenantId}, reason=${reason ?? params?.reason ?? 'none'}`,
    );

    // Fetch existing sites
    const whereClause = tenantId
      ? and(inArray(schema.site.id, ids), eq(schema.site.tenantId, tenantId))
      : inArray(schema.site.id, ids);

    const existing = await this.db
      .select()
      .from(schema.site)
      .where(whereClause);

    const existingMap = new Map(existing.map((s) => [s.id, s]));

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      for (const id of batch) {
        const site = existingMap.get(id);

        if (!site) {
          results.push({
            id,
            success: false,
            error: 'Site not found',
          });
          continue;
        }

        try {
          if (params.type === DeleteType.HARD) {
            // Hard delete: remove all data
            await this.db.transaction(async (tx) => {
              // Delete related records first
              await tx.delete(schema.siteDomain).where(eq(schema.siteDomain.siteId, id));
              await tx.delete(schema.siteRevision).where(eq(schema.siteRevision.siteId, id));
              await tx.delete(schema.siteBuild).where(eq(schema.siteBuild.siteId, id));
              await tx.delete(schema.siteDeployment).where(eq(schema.siteDeployment.siteId, id));

              // Delete main site record
              await tx.delete(schema.site).where(eq(schema.site.id, id));

              // Cleanup external resources
              if (params.deleteAssets !== false) {
                await this.cleanupSiteAssets(site);
              }

              if (params.deleteCoolifyApp !== false && site.coolifyAppUuid) {
                await this.deleteCoolifyApp(site.coolifyAppUuid);
              }
            });

            results.push({
              id,
              success: true,
              previousValue: site.status,
              newValue: 'hard_deleted',
              details: {
                assetsDeleted: params.deleteAssets !== false,
                coolifyAppDeleted: params.deleteCoolifyApp !== false,
                reason: reason ?? params?.reason,
              },
            });
          } else {
            // Soft delete: mark as deleted
            await this.db.transaction(async (tx) => {
              await tx
                .update(schema.site)
                .set({
                  deletedAt: new Date(),
                  updatedBy: actorId,
                  updatedAt: new Date(),
                })
                .where(eq(schema.site.id, id));

              // Enable maintenance mode
              await this.toggleMaintenanceMode(site, true);
            });

            results.push({
              id,
              success: true,
              previousValue: site.status,
              newValue: 'deleted',
              details: {
                softDelete: true,
                reason: reason ?? params?.reason,
              },
            });
          }

          this.logger.log(
            `[AUDIT] Site deleted: site=${id}, type=${params.type}, actor=${actorId}`,
          );

          // Emit event
          await this.emitSiteEvent('sites.site.deleted', {
            siteId: id,
            tenantId: site.tenantId,
            deleteType: params.type,
            deletedBy: actorId,
            reason: reason ?? params?.reason,
          });
        } catch (error) {
          const err = error as Error;
          results.push({
            id,
            success: false,
            error: err.message,
          });
        }
      }
    }

    return this.buildResult(BulkOperationType.DELETE, ids.length, results);
  }

  /**
   * Bulk export sites with comprehensive data
   */
  async bulkExport(dto: BulkExportDto): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];
    const { ids, params, actorId, reason, tenantId } = dto;

    this.logger.log(
      `[AUDIT] Bulk export started: actor=${actorId}, count=${ids.length}, format=${params.format}, tenant=${tenantId}, reason=${reason ?? 'none'}`,
    );

    try {
      // Build query based on inclusion parameters
      let whereClause = inArray(schema.site.id, ids);

      if (tenantId) {
        whereClause = and(whereClause, eq(schema.site.tenantId, tenantId));
      }

      // Include/exclude deleted sites
      if (!params.includeDeleted) {
        whereClause = and(whereClause, isNull(schema.site.deletedAt));
      }

      // Fetch sites
      const sites = await this.db
        .select()
        .from(schema.site)
        .where(whereClause);

      if (sites.length === 0) {
        return {
          success: false,
          operation: BulkOperationType.EXPORT,
          totalRequested: ids.length,
          succeeded: 0,
          failed: ids.length,
          results: ids.map((id) => ({
            id,
            success: false,
            error: 'No sites found for export',
          })),
          processedAt: new Date().toISOString(),
        };
      }

      // Fetch related data if needed
      let domains: any[] = [];
      let revisions: any[] = [];
      let deployments: any[] = [];

      if (params.includeDomains) {
        domains = await this.db
          .select()
          .from(schema.siteDomain)
          .where(inArray(schema.siteDomain.siteId, ids));
      }

      if (params.includeRevisions) {
        revisions = await this.db
          .select({
            siteId: schema.siteRevision.siteId,
            revisionCount: schema.siteRevision.id, // Will be counted later
            latestRevision: schema.siteRevision.createdAt,
          })
          .from(schema.siteRevision)
          .where(inArray(schema.siteRevision.siteId, ids));
      }

      if (params.includeDeployments) {
        deployments = await this.db
          .select()
          .from(schema.siteDeployment)
          .where(inArray(schema.siteDeployment.siteId, ids));
      }

      // Generate export data
      let exportData: any;
      let filename = params.filename || `sites_export_${new Date().toISOString().split('T')[0]}`;

      switch (params.format) {
        case ExportFormat.CSV:
          exportData = this.generateSitesCSV(sites, domains, revisions, deployments, params);
          filename += '.csv';
          break;

        case ExportFormat.EXCEL:
          exportData = await this.generateSitesExcel(sites, domains, revisions, deployments, params);
          filename += '.xlsx';
          break;

        case ExportFormat.JSON:
          exportData = this.generateSitesJSON(sites, domains, revisions, deployments, params);
          filename += '.json';
          break;

        default:
          throw new BadRequestException(`Unsupported export format: ${params.format}`);
      }

      // Mark all as successful
      sites.forEach((site) => {
        results.push({
          id: site.id,
          success: true,
          previousValue: null,
          newValue: 'exported',
        });
      });

      this.logger.log(
        `[AUDIT] Export completed: actor=${actorId}, count=${sites.length}, format=${params.format}`,
      );

      return {
        success: true,
        operation: BulkOperationType.EXPORT,
        totalRequested: ids.length,
        succeeded: sites.length,
        failed: 0,
        results,
        processedAt: new Date().toISOString(),
        data: {
          filename,
          format: params.format,
          content: exportData,
          count: sites.length,
        },
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`[AUDIT] Export failed: actor=${actorId}, error=${err.message}`);

      return {
        success: false,
        operation: BulkOperationType.EXPORT,
        totalRequested: ids.length,
        succeeded: 0,
        failed: ids.length,
        results: ids.map((id) => ({
          id,
          success: false,
          error: err.message,
        })),
        processedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Helper: Execute bulk status change with custom logic
   */
  private async executeBulkStatusChange(
    ids: string[],
    tenantId: string | undefined,
    targetStatus: SiteStatus,
    actorId: string,
    reason?: string,
    customLogic?: (site: SiteRow) => Promise<Partial<typeof schema.site.$inferInsert>>,
  ): Promise<BulkOperationResult> {
    const results: BulkItemResult[] = [];

    // Fetch existing sites
    const whereClause = tenantId
      ? and(inArray(schema.site.id, ids), eq(schema.site.tenantId, tenantId))
      : inArray(schema.site.id, ids);

    const existing = await this.db
      .select()
      .from(schema.site)
      .where(whereClause);

    const existingMap = new Map(existing.map((s) => [s.id, s]));

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      for (const id of batch) {
        const site = existingMap.get(id);

        if (!site) {
          results.push({
            id,
            success: false,
            error: 'Site not found',
          });
          continue;
        }

        try {
          await this.db.transaction(async (tx) => {
            let additionalUpdates = {};

            if (customLogic) {
              additionalUpdates = await customLogic(site);
            }

            await tx
              .update(schema.site)
              .set({
                status: targetStatus,
                updatedAt: new Date(),
                updatedBy: actorId,
                ...additionalUpdates,
              })
              .where(eq(schema.site.id, id));
          });

          results.push({
            id,
            success: true,
            previousValue: site.status,
            newValue: targetStatus,
            details: {
              tenantId: site.tenantId,
              reason,
            },
          });

          this.logger.log(
            `[AUDIT] Status changed: site=${id}, ${site.status} -> ${targetStatus}, actor=${actorId}`,
          );
        } catch (error) {
          const err = error as Error;
          results.push({
            id,
            success: false,
            error: err.message,
          });
        }
      }
    }

    return this.buildResult(BulkOperationType.CHANGE_STATUS, ids.length, results);
  }

  /**
   * Deploy a single site
   */
  private async deploySite(site: SiteRow, forceBuild = false): Promise<{
    success: boolean;
    url?: string;
    buildTime?: number;
    error?: string;
    logs?: string;
  }> {
    try {
      const startTime = Date.now();

      // Call generator service to build and deploy
      const deployResult = await firstValueFrom(
        this.coolifyClient.send('coolify.deploy_site', {
          siteId: site.id,
          tenantId: site.tenantId,
          forceBuild,
        }),
      );

      const buildTime = Date.now() - startTime;

      if (deployResult.success) {
        return {
          success: true,
          url: site.publicUrl || deployResult.url,
          buildTime,
        };
      } else {
        return {
          success: false,
          error: deployResult.error || 'Deployment failed',
          logs: deployResult.logs,
        };
      }
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Toggle maintenance mode for a site
   */
  private async toggleMaintenanceMode(site: SiteRow, enabled: boolean): Promise<void> {
    if (!site.coolifyAppUuid) {
      this.logger.warn(`No Coolify app UUID for site ${site.id}, skipping maintenance toggle`);
      return;
    }

    try {
      await firstValueFrom(
        this.coolifyClient.send('coolify.toggle_maintenance', {
          appUuid: site.coolifyAppUuid,
          enabled,
        }),
      );
      this.logger.debug(`Maintenance mode ${enabled ? 'enabled' : 'disabled'} for site ${site.id}`);
    } catch (error) {
      this.logger.error(`Failed to toggle maintenance mode for site ${site.id}: ${error}`);
      // Don't throw - this is not critical for the main operation
    }
  }

  /**
   * Cleanup site assets from S3/MinIO
   */
  private async cleanupSiteAssets(site: SiteRow): Promise<void> {
    try {
      // Call storage service to remove site assets
      // This would typically involve removing the S3 prefix: sites/{subdomain}/
      this.logger.debug(`Would cleanup assets for site ${site.id} (${site.slug})`);
      // TODO: Implement actual S3 cleanup call
    } catch (error) {
      this.logger.error(`Failed to cleanup assets for site ${site.id}: ${error}`);
      // Don't throw - this is best effort
    }
  }

  /**
   * Delete Coolify application
   */
  private async deleteCoolifyApp(coolifyAppUuid: string): Promise<void> {
    try {
      await firstValueFrom(
        this.coolifyClient.send('coolify.delete_application', {
          appUuid: coolifyAppUuid,
        }),
      );
      this.logger.debug(`Deleted Coolify app ${coolifyAppUuid}`);
    } catch (error) {
      this.logger.error(`Failed to delete Coolify app ${coolifyAppUuid}: ${error}`);
      // Don't throw - this is best effort
    }
  }

  /**
   * Generate CSV export for sites
   */
  private generateSitesCSV(sites: any[], domains: any[], revisions: any[], deployments: any[], params: any): string {
    const defaultFields = ['id', 'name', 'slug', 'status', 'tenantId', 'publicUrl', 'createdAt'];
    const exportFields = params.fields || defaultFields;

    // Header
    const header = exportFields.join(',');

    // Rows
    const rows = sites.map((site) => {
      return exportFields.map((field) => {
        const value = this.getNestedValue(site, field);
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(',');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Generate Excel export for sites
   */
  private async generateSitesExcel(sites: any[], domains: any[], revisions: any[], deployments: any[], params: any): Promise<any> {
    const sheets = [{
      name: 'Sites',
      headers: params.fields || ['id', 'name', 'slug', 'status', 'publicUrl'],
      data: sites,
    }];

    if (params.includeDomains && domains.length > 0) {
      sheets.push({
        name: 'Domains',
        headers: ['siteId', 'domain', 'status', 'verificationToken'],
        data: domains,
      });
    }

    if (params.includeDeployments && deployments.length > 0) {
      sheets.push({
        name: 'Deployments',
        headers: ['siteId', 'status', 'url', 'createdAt'],
        data: deployments,
      });
    }

    return { sheets };
  }

  /**
   * Generate JSON export for sites
   */
  private generateSitesJSON(sites: any[], domains: any[], revisions: any[], deployments: any[], params: any): any {
    if (params.includeDomains || params.includeDeployments || params.includeRevisions) {
      // Return enriched sites with related data
      return sites.map((site) => ({
        ...site,
        ...(params.includeDomains && {
          domains: domains.filter(d => d.siteId === site.id),
        }),
        ...(params.includeDeployments && {
          deployments: deployments.filter(d => d.siteId === site.id),
        }),
        ...(params.includeRevisions && {
          revisionCount: revisions.filter(r => r.siteId === site.id).length,
        }),
      }));
    }

    // Return filtered fields if specified
    if (params.fields) {
      return sites.map((site) => {
        const filtered: any = {};
        params.fields.forEach((field: string) => {
          filtered[field] = this.getNestedValue(site, field);
        });
        return filtered;
      });
    }

    return sites;
  }

  /**
   * Get nested property value
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Build standardized result object
   */
  private buildResult(
    operation: BulkOperationType,
    totalRequested: number,
    results: BulkItemResult[],
  ): BulkOperationResult {
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      success: failed === 0,
      operation,
      totalRequested,
      succeeded,
      failed,
      results,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Emit site event (best-effort)
   */
  private async emitSiteEvent(
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      // TODO: Implement event emitting via EventsService
      // await this.eventsService.emit(event, data);
      this.logger.debug(`Would emit event ${event}`, data);
    } catch (error) {
      this.logger.error(`Failed to emit event ${event}: ${error}`);
      // Don't throw - events are best-effort
    }
  }
}