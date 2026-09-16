import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { OutboxModule } from "./outbox/outbox.module";

/** Scheduling, and the job modules. Nothing else belongs at this level. */
@Module({
  imports: [ScheduleModule.forRoot(), OutboxModule],
})
export class WorkerModule {}
