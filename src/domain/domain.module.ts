import { Module } from '@nestjs/common';
import { DomainClient } from './domain.client';

@Module({
  providers: [DomainClient],
  exports: [DomainClient],
})
export class DomainModule {}
