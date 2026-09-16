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

`operator-workspace` and `guest-portal` are built. `storefront` and
`control-plane` are still placeholders; they return from the `v0-pilot-archive`
tag or get built fresh as slices need them.

The two live applications share a Better Auth instance and share nothing else.
They compose different modules, reach different rows, and have one funnel each —
which is what makes "the Portal must never expose staff controls" structural
rather than a matter of what each one renders. See
[ADR 0008](../docs/adr/0008-a-resident-reaches-their-own-stay-not-an-organization.md).
