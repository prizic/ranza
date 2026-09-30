# @ranza/guest-services

## Unreleased

### Added

- The `service_requests` table, sequential request numbers per property, status lifecycle, categories, priorities, cancellation with reason, and resolution notes.
- Row-level security policies enforcing property reach, capability checks, and permissions (`guest_services.create_request`, `guest_services.manage_requests`).
- `requests(propertyId)`: queries service requests for a Property.
- `createRequest(input)`: logs a new request with number stamped by database trigger.
- `updateRequest(requestId, input)`: updates status, priority, category, assignee, cancellation reason, or resolution notes.
