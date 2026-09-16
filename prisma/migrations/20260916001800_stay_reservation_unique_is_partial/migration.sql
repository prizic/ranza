-- Makes the Reservation unique index partial, so a withdrawn check-in can arrive
-- again. Why it is partial rather than total is ADR 0022 and issue #34.
--
-- Safe to apply anywhere: the new index is weaker than the one it replaces, so
-- no existing row can violate it, and `if exists` means a database that never
-- received the total index is not a failure.

-- DropIndex
DROP INDEX IF EXISTS "stays_reservation_id_property_id_organization_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "stays_reservation_id_property_id_organization_id_key" ON "stays"("reservation_id", "property_id", "organization_id") WHERE ("status" != 'cancelled');
