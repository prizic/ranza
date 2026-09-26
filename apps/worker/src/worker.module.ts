import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { BusinessDayModule } from "./business-day/business-day.module";
import { OutboxModule } from "./outbox/outbox.module";

/** Scheduling, and the job modules. Nothing else belongs at this level. */
@Module({
  imports: [ScheduleModule.forRoot(), OutboxModule, BusinessDayModule],
})
export class WorkerModule {}
