import { Module } from '@nestjs/common';
import { BulkOperationsController } from './bulk.controller';
import { BulkOperationsService } from './bulk.service';

@Module({
  controllers: [BulkOperationsController],
  providers: [BulkOperationsService],
  exports: [BulkOperationsService],
})
export class BulkModule {}