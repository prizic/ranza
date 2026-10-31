import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { BusinessDayModule } from "./business-day/business-day.module";
import { DataExportModule } from "./export/data-export.module";
import { OutboxModule } from "./outbox/outbox.module";
import { PaymentPlansModule } from "./payment-plans/payment-plans.module";
import { WebhookDeliveryModule } from "./webhooks/webhook-delivery.module";

/** Scheduling, and the job modules. Nothing else belongs at this level. */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    OutboxModule,
    BusinessDayModule,
    PaymentPlansModule,
    DataExportModule,
    WebhookDeliveryModule,
  ],
})
export class WorkerModule {}
