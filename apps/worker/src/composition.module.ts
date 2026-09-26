import { Module } from "@nestjs/common";
import { createComposition } from "./composition";
import { COMPOSITION } from "./tokens";

/**
 * The composition root, provided once for every job module that imports it.
 *
 * `createComposition` is the async factory, so a worker whose role turns out to
 * be privileged fails during module initialisation and the process never
 * reaches its first interval.
 */
@Module({
  providers: [{ provide: COMPOSITION, useFactory: createComposition }],
  exports: [COMPOSITION],
})
export class CompositionModule {}
