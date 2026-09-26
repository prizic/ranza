import { Module } from "@nestjs/common";
import type { Composition } from "../composition";
import { CompositionModule } from "../composition.module";
import { COMPOSITION } from "../tokens";
import { BusinessDayCloserService } from "./business-day.closer";
import { DAY_CLOSER } from "./tokens";

/** Wiring, and nothing else (ADR 0016). */
@Module({
  imports: [CompositionModule],
  providers: [
    {
      provide: DAY_CLOSER,
      useFactory: (composition: Composition) => composition.closer,
      inject: [COMPOSITION],
    },
    BusinessDayCloserService,
  ],
})
export class BusinessDayModule {}
