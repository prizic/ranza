# Applications

Four separately deployable applications (blueprint section 4). Each is its own
package; none may import another — `.dependency-cruiser.cjs` enforces that.

| Directory             | Audience                             | Purpose                                                                                                                                                                                                           |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storefront/`         | Visitors                             | Public marketing, module discovery, demo requests, approved public pricing. Shares no authenticated route with the product apps.                                                                                  |
| `operator-workspace/` | Organization owners, managers, Staff | The main authenticated application. Desktop-heavy back office plus role-adaptive mobile modes for housekeeping, maintenance, F&B and stock. Installable as a PWA.                                                 |
| `guest-portal/`       | Guests and Residents                 | Mobile-first PWA. Capabilities depend on Entitlements and Property configuration. Must never expose staff controls or Prizic operations.                                                                          |
| `control-plane/`      | Prizic staff only                    | Organization and Property lifecycle, plans, Entitlements, white-label domains, service health, audited support actions. High-risk actions require strong authentication, a reason, and an immutable audit record. |

Prizic Control Plane permissions and Organization staff permissions are separate
systems and must never be mixed (blueprint section 14).

Applications hold no business rules. They compose module contracts, handle
transport and rendering, and enforce authorization at the server boundary — with
row-level security underneath as the boundary that survives an application defect.

Directories are currently placeholders. The walking skeleton builds
`operator-workspace` first; the rest return from the `v0-pilot-archive` tag or
get built fresh as slices need them.
