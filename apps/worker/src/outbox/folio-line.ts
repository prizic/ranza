import {
  postFolioLineToLedgerWithin,
  type FolioLineSnapshot,
} from "@ranza/adapter-ranza-finance";
import type { OutboxSubscription } from "@ranza/platform-outbox";

/**
 * A posted Folio line produces a balanced journal entry in the general ledger (blueprint 5.10).
 *
 * It holds no business rules of its own (ADR 0016). The mapping of Folio lines onto
 * balanced double-entry accounting records belongs in @ranza/adapter-ranza-finance.
 */

/** Stable forever: `outbox.deliveries` is keyed on it (ADR 0017). */
const CONSUMER = "finance.postFolioLineToLedger";

export const folioLinePostedSubscription: OutboxSubscription = {
  consumer: CONSUMER,
  eventType: "folio.line_posted",
  async handle(tx, event) {
    const payload = event.payload as FolioLineSnapshot | undefined;
    const lineId = payload?.lineId;
    if (!lineId) return;
    await postFolioLineToLedgerWithin(tx as never, lineId, payload);
  },
};
