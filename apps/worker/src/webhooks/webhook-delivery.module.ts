import { Module } from "@nestjs/common";
import type { Composition } from "../composition";
import { CompositionModule } from "../composition.module";
import { COMPOSITION } from "../tokens";
import { WEBHOOK_DELIVERY } from "./tokens";
import { WebhookDeliveryService } from "./webhook-delivery.service";

@Module({
  imports: [CompositionModule],
  providers: [
    {
      provide: WEBHOOK_DELIVERY,
      useFactory: (composition: Composition) => composition.webhooks,
      inject: [COMPOSITION],
    },
    WebhookDeliveryService,
  ],
})
export class WebhookDeliveryModule {}
