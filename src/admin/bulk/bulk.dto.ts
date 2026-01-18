import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Bulk operation types for sites
 */
export enum BulkOperationType {
  CHANGE_STATUS = 'change_status',
  FREEZE = 'freeze',
  UNFREEZE = 'unfreeze',
  ARCHIVE = 'archive',
  DEPLOY = 'deploy',
  DELETE = 'delete',
  EXPORT = 'export',
}

/**
 * Site status values (matches schema enum)
 */
export enum SiteStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  FROZEN = 'frozen',
  ARCHIVED = 'archived',
}

/**
 * Export formats for bulk export
 */
export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  JSON = 'json',
}

/**
 * Delete types for sites
 */
export enum DeleteType {
  SOFT = 'soft',
  HARD = 'hard',
}

/**
 * Result for individual item in bulk operation
 */
export interface BulkItemResult {
  id: string;
  success: boolean;
  error?: string;
  previousValue?: unknown;
  newValue?: unknown;
  details?: Record<string, unknown>;
}

/**
 * Response for bulk operation
 */
export interface BulkOperationResult {
  success: boolean;
  operation: BulkOperationType;
  totalRequested: number;
  succeeded: number;
  failed: number;
  results: BulkItemResult[];
  processedAt: string;
  data?: Record<string, unknown>;
}

/**
 * Allowed status transitions for sites
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<SiteStatus, SiteStatus[]> = {
  [SiteStatus.DRAFT]: [SiteStatus.PUBLISHED, SiteStatus.ARCHIVED],
  [SiteStatus.PUBLISHED]: [SiteStatus.DRAFT, SiteStatus.FROZEN, SiteStatus.ARCHIVED],
  [SiteStatus.FROZEN]: [SiteStatus.DRAFT, SiteStatus.PUBLISHED], // unfrozen to prevStatus
  [SiteStatus.ARCHIVED]: [SiteStatus.DRAFT], // can restore archived sites
};

/**
 * Params for change_status operation
 */
export class ChangeStatusParams {
  @IsEnum(SiteStatus)
  status!: SiteStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  skipValidation?: boolean; // For emergency admin operations

  @IsOptional()
  @IsBoolean()
  force?: boolean; // Force deployment if changing to published
}

/**
 * Params for freeze operation
 */
export class FreezeParams {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  enableMaintenance?: boolean; // Default: true - show maintenance page
}

/**
 * Params for unfreeze operation
 */
export class UnfreezeParams {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  restoreToPrevStatus?: boolean; // Default: true - restore to prevStatus
}

/**
 * Params for archive operation
 */
export class ArchiveParams {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  preserveData?: boolean; // Default: true - keep S3 assets for restore
}

/**
 * Params for deploy operation (publish sites)
 */
export class DeployParams {
  @IsOptional()
  @IsBoolean()
  forceBuild?: boolean; // Default: false - rebuild even if no changes

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  skipCoolifyRestart?: boolean; // Default: false - restart Coolify apps
}

/**
 * Params for delete operation
 */
export class DeleteParams {
  @IsEnum(DeleteType)
  type!: DeleteType;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  deleteAssets?: boolean; // Default: true for hard delete, false for soft

  @IsOptional()
  @IsBoolean()
  deleteCoolifyApp?: boolean; // Default: false - keep for restore
}

/**
 * Params for export operation
 */
export class ExportParams {
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsBoolean()
  includeDeleted?: boolean; // Include soft-deleted sites

  @IsOptional()
  @IsBoolean()
  includeDomains?: boolean; // Include custom domains

  @IsOptional()
  @IsBoolean()
  includeRevisions?: boolean; // Include revision count/latest

  @IsOptional()
  @IsBoolean()
  includeDeployments?: boolean; // Include deployment history

  @IsOptional()
  @IsBoolean()
  includeMetrics?: boolean; // Include view counts, health status
}

/**
 * Base DTO for bulk operations
 */
export class BulkOperationBaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50) // Reduced limit for sites due to complex operations
  @IsString({ each: true })
  ids!: string[];

  @IsString()
  actorId!: string;

  @IsOptional()
  @IsString()
  tenantId?: string; // Optional - can be inferred from sites

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * DTO for bulk change status
 */
export class BulkChangeStatusDto extends BulkOperationBaseDto {
  @ValidateNested()
  @Type(() => ChangeStatusParams)
  params!: ChangeStatusParams;
}

/**
 * DTO for bulk freeze sites
 */
export class BulkFreezeDto extends BulkOperationBaseDto {
  @ValidateNested()
  @Type(() => FreezeParams)
  params!: FreezeParams;
}

/**
 * DTO for bulk unfreeze sites
 */
export class BulkUnfreezeDto extends BulkOperationBaseDto {
  @ValidateNested()
  @Type(() => UnfreezeParams)
  params!: UnfreezeParams;
}

/**
 * DTO for bulk archive sites
 */
export class BulkArchiveDto extends BulkOperationBaseDto {
  @ValidateNested()
  @Type(() => ArchiveParams)
  params!: ArchiveParams;
}

/**
 * DTO for bulk deploy sites
 */
export class BulkDeployDto extends BulkOperationBaseDto {
  @ValidateNested()
  @Type(() => DeployParams)
  params!: DeployParams;
}

/**
 * DTO for bulk delete sites
 */
export class BulkDeleteDto extends BulkOperationBaseDto {
  @ValidateNested()
  @Type(() => DeleteParams)
  params!: DeleteParams;
}

/**
 * DTO for bulk export sites
 */
export class BulkExportDto extends BulkOperationBaseDto {
  @ValidateNested()
  @Type(() => ExportParams)
  params!: ExportParams;
}