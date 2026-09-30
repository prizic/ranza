# @ranza/guest-services

Guest and Resident services (blueprint 5.5, 4.3). Service requests, request queue,
prioritization, categories, status lifecycle, staff assignment, cancellation and resolution.

## What this module owns

The `service_requests` table, its constraints, triggers and row-level security policies — in
[`prisma/migrations/20260916009900_guest_service_requests`](../../../prisma/migrations/20260916009900_guest_service_requests/migration.sql).

## Contract

```ts
import { createGuestServicesModule } from "@ranza/guest-services";

const guestServices = createGuestServicesModule({ db });
await guestServices.requests(propertyId);
await guestServices.createRequest(data);
await guestServices.updateRequest(id, patch);
```

- `requests(propertyId)`: Returns service requests at a Property, ordered by creation time descending.
- `createRequest(input)`: Logs a new request with number stamped by database trigger.
- `updateRequest(requestId, input)`: Updates status (`new`, `in_progress`, `resolved`, `cancelled`), priority, assignee, cancellation reason, or resolution notes.

## Rules

- Receives its client; never reads the environment (ADR 0006).
- Row-level security enforces tenant boundaries and permissions (`guest_services.create_request`, `guest_services.manage_requests`).
- Sequential request numbers (`number`) and timestamps are stamped by the database trigger.
