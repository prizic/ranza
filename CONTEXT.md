# Ranza Domain Context

Ranza is a vertical SaaS product for independent private student-dormitory operators of any size in Turkey. It is operated by Prizic as a focused recurring-revenue product and launches in Turkish, English, and Arabic.

## Language

**Dormitory Operator**:
An independent private student-accommodation business that subscribes to Ranza and manages one or more Branches. It holds one subscription and receives one invoice covering all of its Branches.
_Avoid_: Tenant, client, branch

**Branch**:
A physical student residence or building managed by a Dormitory Operator. Separate male and female residences can be represented as different Branches under the same Operator.
_Avoid_: Customer, tenant, deployment

**Manager**:
A staff member who manages one or more assigned Branches for a Dormitory Operator. Operator-wide owners and authorized Managers can access every Branch, while Branch staff are limited to their assignments.
_Avoid_: Platform operator, customer

**Student**:
A person residing in one active home Branch who uses the student-facing parts of Ranza but does not buy the subscription. A Branch transfer changes the active assignment while preserving the Student's history.
_Avoid_: Customer, tenant

**Subscription**:
The commercial agreement and entitlement set held by one Dormitory Operator across all of its Branches. It produces one consolidated invoice even when Branch-level breakdowns are shown.
_Avoid_: Branch plan, per-building subscription

## Product Surfaces

**Student App**:
The mobile-first responsive web application used by Students. The pilot version is installable as a progressive web app, uses Operator-issued activation codes and Student PINs, and is not a native iOS or Android application.
_Avoid_: Native app, customer dashboard

**Operator Dashboard**:
The responsive web application used by Dormitory Operator owners, Managers, and Branch staff.
_Avoid_: Admin app, Prizic dashboard

**Prizic Control Plane**:
The internal surface used to create or suspend Operators, manage Branches, entitlements, and supported feature configurations, inspect service health, and perform audited support actions.
_Avoid_: Operator Dashboard, analytics platform

**Storefront**:
The public one-page Ranza marketing site that explains the outcome and collects contact or demonstration requests. The pilot Storefront does not offer self-service purchase or onboarding.
_Avoid_: Marketplace, ecommerce store

## Pilot Modules

**Nightly Attendance**:
A Student declaration for one date at their active home Branch with exactly one state: Staying, Away, or Unconfirmed. Away is an operational declaration, not an approved Overnight Leave Request.
_Avoid_: Live presence, permission request, check-in

**Attendance Snapshot**:
The Branch's nightly attendance record created at its local cutoff. Authorized staff may correct or reopen it only with a recorded reason.
_Avoid_: Live occupancy

**Meal Offering**:
The fixed set of breakfast, lunch, or dinner opportunities published by a Branch for the following day, each governed by a Branch-local deadline.
_Avoid_: Menu order, food delivery order

**Meal Selection**:
A Student's explicit opt-in to an offered meal. The selections at cutoff form the kitchen count, and later staff corrections require a recorded reason.
_Avoid_: Default meal, free-form order

**Announcement Acknowledgment**:
An explicit action by a Student confirming an Announcement. It is stronger than opening or receiving the Announcement but does not prove comprehension or legal agreement.
_Avoid_: View, delivery receipt, consent

**Student Balance**:
The recorded amount a Student owes a Dormitory Operator, including installments, partial payments, credits, and the remaining balance. The pilot records these facts but does not process or transfer money.
_Avoid_: Payment Status, payment processing

**Wi-Fi Access Information**:
Branch-scoped network details whose visibility follows a supported Branch configuration: Protected access for active Students and assigned staff, or Public/QR access without sign-in.
_Avoid_: Per-Student network identity

**Entitlement**:
Permission granted by Prizic for a Dormitory Operator to use a product module or supported configuration mode under its Subscription.
_Avoid_: Source-code customization, customer fork

**Feature Configuration**:
A supported behavioral mode or value for an entitled Operator or Branch, such as protected versus Public/QR Wi-Fi visibility. Prizic governs available capabilities and modes; Operator owners manage permitted settings, and Prizic support overrides are audited.
_Avoid_: Bespoke feature, fork

**Core Plan**:
The Subscription level containing the validated pilot suite. Later substantial modules are sold as separate Entitlements, and pricing scales primarily with the Operator's total Billable Beds.
_Avoid_: Free plan, custom fork

**Billable Bed**:
An available bed in an active Branch, whether occupied or vacant. The Operator's Billable Bed total is the primary stable quantity used to price the Core Plan.
_Avoid_: Active Student, occupied bed

## Identity and Data

**Activation Code**:
A one-time credential issued by a Dormitory Operator to connect a Student with a pre-created roster record. It is replaced by the Student's PIN after successful activation.
_Avoid_: Password, reusable invitation code

**Student PIN**:
The Student-controlled secret used to return to the Student App after activation. Recovery is an audited staff action and does not create a new Student identity.
_Avoid_: Activation Code, phone OTP

**Operator Data**:
Operational and personal information held by Ranza for a Dormitory Operator. The Operator can export it; Ranza archives and retains it under a documented contract and legal policy before deletion or anonymization.
_Avoid_: Prizic-owned data, permanent history

## Commercial Language

**Founding Offer**:
The paid Core Plan price and success-triggered billing start agreed with a pilot Operator before the formal 14-day evaluation. Public self-service pricing remains deferred until three Operators are paying.
_Avoid_: Free pilot, public launch price

**Successful Pilot**:
Fourteen consecutive days in which at least 85% of active Students submit nightly attendance before cutoff, management uses Ranza as its primary operational record, the kitchen relies on Ranza's final meal counts, no unresolved critical data error remains, and the Dormitory Operator agrees to continue on a paid Subscription.
_Avoid_: Positive feedback, demo completion

**Ranza**:
The single multi-tenant SaaS product shared by all Dormitory Operators. Customer differences are expressed through configuration and entitlements rather than source-code forks.
_Avoid_: Template, customer fork
