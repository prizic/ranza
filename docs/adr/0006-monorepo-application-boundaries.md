# Use three web deployables in one monorepo

Ranza will keep three deployable web applications in one monorepo: the public Storefront, Product Web containing the Student App and Operator Dashboard, and the internal Prizic Control Plane. They share domain, database, UI, localization, and configuration packages. A native mobile application may be added to the monorepo only after the PWA proves a distribution or device-capability need. This separates public, customer, and internal release/security boundaries without duplicating the Student and Operator domain implementation.
