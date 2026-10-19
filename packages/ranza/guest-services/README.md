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
- `updateRequest(requestId, input)`: Updates status (`new`, `in_progress`, `resolved`, `cancelled`), priority, assignee, cancellation reason, or resolution notes. A write that changes no row throws `ServiceRequestUnavailableError` (the update policy matches nothing and Postgres calls that success), and the lifecycle trigger's refusals throw `ServiceRequestStateError` with the rule that said no; a policy or foreign-key refusal is `ServiceRequestRefusedError`.
- `access(userId, propertyId)`: What the viewer may do (`mayCreate`, `mayManage`), for a screen to draw only the controls that will work.
- `assignees(userId, propertyId)`: The Staff Members who reach the Property and hold the permission to manage requests, who are the only ones a request can usefully be given to.

`createRequest` records the Stay and the Guest in house in the named Unit, read in the same statement; the form never names them.

## Rules

- Receives its client; never reads the environment (ADR 0006).
- Row-level security enforces tenant boundaries and permissions (`guest_services.create_request`, `guest_services.manage_requests`).
- Sequential request numbers (`number`) and timestamps are stamped by the database trigger.
