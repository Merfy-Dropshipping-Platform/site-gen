import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BulkOperationsService } from './bulk.service';
import type {
  BulkChangeStatusDto,
  BulkFreezeDto,
  BulkUnfreezeDto,
  BulkArchiveDto,
  BulkDeployDto,
  BulkDeleteDto,
  BulkExportDto,
} from './bulk.dto';

@Controller()
export class BulkOperationsController {
  constructor(private readonly bulkService: BulkOperationsService) {}

  /**
   * Bulk change site status (draft, published, archived)
   * RPC: admin.bulk.sites.change_status
   */
  @MessagePattern('admin.bulk.sites.change_status')
  async bulkChangeStatus(@Payload() data: BulkChangeStatusDto) {
    return this.bulkService.bulkChangeStatus(data);
  }

  /**
   * Bulk freeze sites (enable maintenance mode)
   * RPC: admin.bulk.sites.freeze
   */
  @MessagePattern('admin.bulk.sites.freeze')
  async bulkFreeze(@Payload() data: BulkFreezeDto) {
    return this.bulkService.bulkFreeze(data);
  }

  /**
   * Bulk unfreeze sites (disable maintenance mode)
   * RPC: admin.bulk.sites.unfreeze
   */
  @MessagePattern('admin.bulk.sites.unfreeze')
  async bulkUnfreeze(@Payload() data: BulkUnfreezeDto) {
    return this.bulkService.bulkUnfreeze(data);
  }

  /**
   * Bulk archive sites (move to archived status)
   * RPC: admin.bulk.sites.archive
   */
  @MessagePattern('admin.bulk.sites.archive')
  async bulkArchive(@Payload() data: BulkArchiveDto) {
    return this.bulkService.bulkArchive(data);
  }

  /**
   * Bulk deploy sites (trigger deployment)
   * RPC: admin.bulk.sites.deploy
   */
  @MessagePattern('admin.bulk.sites.deploy')
  async bulkDeploy(@Payload() data: BulkDeployDto) {
    return this.bulkService.bulkDeploy(data);
  }

  /**
   * Bulk delete sites (soft or hard delete)
   * RPC: admin.bulk.sites.delete
   */
  @MessagePattern('admin.bulk.sites.delete')
  async bulkDelete(@Payload() data: BulkDeleteDto) {
    return this.bulkService.bulkDelete(data);
  }

  /**
   * Bulk export sites data (CSV, Excel, JSON)
   * RPC: admin.bulk.sites.export
   */
  @MessagePattern('admin.bulk.sites.export')
  async bulkExport(@Payload() data: BulkExportDto) {
    return this.bulkService.bulkExport(data);
  }
}