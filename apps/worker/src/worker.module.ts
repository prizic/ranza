import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { BusinessDayModule } from "./business-day/business-day.module";
import { DataExportModule } from "./export/data-export.module";
import { OutboxModule } from "./outbox/outbox.module";

/** Scheduling, and the job modules. Nothing else belongs at this level. */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    OutboxModule,
    BusinessDayModule,
    DataExportModule,
  ],
})
export class WorkerModule {}
