import { Module } from "@nestjs/common";
import type { Composition } from "../composition";
import { CompositionModule } from "../composition.module";
import { COMPOSITION } from "../tokens";
import { InstalmentPosterService } from "./instalment.poster";
import { INSTALMENT_POSTER } from "./tokens";

/** Wiring, and nothing else (ADR 0016). */
@Module({
  imports: [CompositionModule],
  providers: [
    {
      provide: INSTALMENT_POSTER,
      useFactory: (composition: Composition) => composition.instalments,
      inject: [COMPOSITION],
    },
    InstalmentPosterService,
  ],
})
export class PaymentPlansModule {}
