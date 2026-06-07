/**
 * PagesModule — CRUD над custom user pages в revision.data.pages.
 *
 * Контроллер PagesController будет подключён в Task 29.
 */
import { Module } from "@nestjs/common";
import { PagesService } from "./pages.service";
// import { PagesController } from "./pages.controller";  // Task 29 — add when file exists
import { DatabaseModule } from "../db/database.module";

@Module({
  imports: [DatabaseModule],
  controllers: [
    /* PagesController */
  ], // wire in Task 29
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
