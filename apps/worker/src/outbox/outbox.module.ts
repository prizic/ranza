import { Module } from "@nestjs/common";
import { createComposition, type Composition } from "../composition";
import { OutboxDispatcherService } from "./outbox.dispatcher";
import { subscriptions } from "./subscriptions";
import { COMPOSITION, OUTBOX_DISPATCHER, SUBSCRIPTIONS } from "./tokens";

/**
 * Wiring, and nothing else.
 *
 * Every provider here either returns something the composition root built or
 * returns a constant. Nest is the container; it is not where anything is
 * decided (ADR 0016).
 *
 * `createComposition` is the async factory, so a worker whose role turns out to
 * be privileged fails during module initialisation and the process never
 * reaches its first interval.
 */
@Module({
  providers: [
    {
      provide: COMPOSITION,
      useFactory: createComposition,
    },
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
