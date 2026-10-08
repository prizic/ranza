import { Module } from "@nestjs/common";
import type { Composition } from "../composition";
import { CompositionModule } from "../composition.module";
import { COMPOSITION } from "../tokens";
import { DataExportService } from "./data-export.service";
import { DATA_EXPORT } from "./tokens";

@Module({
  imports: [CompositionModule],
  providers: [
    {
      provide: DATA_EXPORT,
      useFactory: (composition: Composition) => composition.dataExport,
      inject: [COMPOSITION],
    },
    DataExportService,
  ],
})
export class DataExportModule {}
