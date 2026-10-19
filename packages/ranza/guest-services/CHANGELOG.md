# @ranza/guest-services

## Unreleased

### Added

- The `service_requests` table, sequential request numbers per property, status lifecycle, categories, priorities, cancellation with reason, and resolution notes.
- Row-level security policies enforcing property reach, capability checks, and permissions (`guest_services.create_request`, `guest_services.manage_requests`).
- `requests(propertyId)`: queries service requests for a Property.
- `createRequest(input)`: logs a new request with number stamped by database trigger.
- `updateRequest(requestId, input)`: updates status, priority, category, assignee, cancellation reason, or resolution notes.
- `access(userId, propertyId)` and `assignees(userId, propertyId)`: what the viewer may do, and who a request can be given to.
- `ServiceRequestUnavailableError`, `ServiceRequestStateError` and `ServiceRequestRefusedError`, so a write that landed nowhere, a lifecycle refusal and a policy refusal are told apart.

### Changed

- `createRequest` takes the Stay and Guest from the Unit's in-house Stay instead of the caller.
- `updateRequest` returns the changed row or throws; it no longer reports success for an update the policy matched nothing for.
