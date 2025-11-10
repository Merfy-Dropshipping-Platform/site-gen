/**
 * DatabaseModule
 *
 * Предоставляет единый инстанс Drizzle NodePgDatabase под токеном PG_CONNECTION.
 * Другие сервисы внедряют его для чтения/записи доменных таблиц.
 */
import { Module } from '@nestjs/common';
import { PG_CONNECTION } from '../constants';
import { db } from './db';

@Module({
  providers: [
    {
      provide: PG_CONNECTION,
      useValue: db,
    },
  ],
  exports: [PG_CONNECTION],
})
export class DatabaseModule {}
