import { Module } from "@nestjs/common";
import type { Composition } from "../composition";
import { CompositionModule } from "../composition.module";
import { COMPOSITION } from "../tokens";
import { OutboxDispatcherService } from "./outbox.dispatcher";
import { subscriptions } from "./subscriptions";
import { OUTBOX_DISPATCHER, SUBSCRIPTIONS } from "./tokens";

/**
 * Wiring, and nothing else.
 *
 * Every provider here either returns something the composition root built or
 * returns a constant. Nest is the container; it is not where anything is
 * decided (ADR 0016).
 */
@Module({
  imports: [CompositionModule],
  providers: [
    {
      provide: OUTBOX_DISPATCHER,
      useFactory: (composition: Composition) => composition.outbox,
      inject: [COMPOSITION],
    },
    {
      provide: SUBSCRIPTIONS,
      useValue: subscriptions,
    },
    OutboxDispatcherService,
  ],
})
export class OutboxModule {}
