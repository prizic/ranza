import { Module } from "@nestjs/common";
import type { Composition } from "../composition";
import { CompositionModule } from "../composition.module";
import { COMPOSITION } from "../tokens";
import { ImportSweeperService } from "./import-sweeper.service";
import { IMPORT_SWEEPER } from "./tokens";

/** Wiring, and nothing else (ADR 0016). */
@Module({
  imports: [CompositionModule],
  providers: [
    {
      provide: IMPORT_SWEEPER,
      useFactory: (composition: Composition) => composition.imports,
      inject: [COMPOSITION],
    },
    ImportSweeperService,
  ],
})
export class ImportsModule {}
