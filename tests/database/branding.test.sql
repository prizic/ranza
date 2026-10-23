-- An Organization's brand: one colour and one logo (RANZ-47, BR-S1-*).
--
-- Every assertion carries the id of the edge-case row it proves
-- (docs/features/branding/edge-cases.csv), followed by what it asserts, and
-- tests/unit/branding-edge-cases.test.ts reads the table against this file.
--
-- Written after the migration it tests, and then each boundary was broken to
-- see it go red. Each break below was applied as DDL in the same transaction as
-- this suite (the suite's own ROLLBACK undoes it), after printing the
-- definition it changed, and the assertions named are the ones that went red,
-- by what they say.
--
--   a  branding.manage out of the UPDATE policies of both tables
--        BR-S1-13: a Manager who is also staying at the Organization still
--        writes nothing, nor the logo
--   b  whole-Organization reach out of the UPDATE policies
--        BR-S1-14: a holder who reaches one Property writes nothing, nor the logo
--   c  the commercial gates out of the UPDATE policies
--        BR-S1-15: no Configuration capability and no platform_core
--        Entitlement each write nothing (the suspended Subscription's own
--        assertion is not among them: see below)
--   d  `updated_by = app.current_user_id()` out of the UPDATE policies
--        BR-S1-16: a write names the acting user as its author
--   m  branding.manage out of the INSERT policies of both tables
--        BR-S1-13: a member without it inserts no logo and no brand
--   n  whole-Organization reach out of the INSERT policies
--        BR-S1-14: a holder who reaches one Property inserts no logo, no brand
--   o  the commercial gates out of the INSERT policies
--        BR-S1-15: a suspended Subscription, no capability and no Entitlement
--        each insert no logo and no brand
--   p  the author out of the INSERT policies
--        BR-S1-16: a logo and a brand name the acting user as their author
--      (m, n and p also turn the Owner's first-insert assertions red, only
--      because the refused member's insert went in first and the Owner's then
--      collides with it.)
--   e  both Resident read policies widened to `using (true)`
--        BR-S1-17, BR-S1-20, BR-S1-21, BR-S1-22: fourteen assertions, among them
--        another Organization's brand read, a departed Resident's, and a front
--        desk member's
--   f  app.resident_organization_ids() loses its status filter
--        BR-S1-20: a departed Resident and a cancelled one read nothing
--        (its next run, with the gates also gone, is w below)
--   w  app.resident_organization_ids() loses the Portal's capability gate
--        BR-S1-36: a Resident of a suspended Organization and one at a
--        Property with the Portal off read no brand and no logo
--   l  branding.manage out of the Staff read policies
--        BR-S1-22: a member without the permission, and a Manager, read no brand
--   u  whole-Organization reach out of the Staff read policies
--        BR-S1-41: a holder who reaches one Property reads no brand and no logo
--   v  the commercial gates out of the Staff read policies
--        BR-S1-41: a holder who reaches everything reads no brand where the
--        Configuration capability is off
--   x  SELECT granted on both tables at table level
--        BR-S1-39: the columns the application role may read are exactly the
--        ones the Portal draws (both assertions)
--   q  organization_brand_logos_size dropped
--        BR-S1-07: a logo over 512 KB is refused by the table
--   r  organization_brand_logos_dimensions dropped
--        BR-S1-08: under 128 px tall, and over 4096 px wide
--   s  organization_brand_logos_size_is_the_bytes dropped
--        BR-S1-10: a size that is not the bytes' own
--   t  UPDATE granted on organization_id of both tables
--        BR-S1-18: a brand cannot be moved to another Organization, even by
--        somebody who administers both, nor a logo. With the grant, the update
--        reaches the primary key of the other Organization's row and fails
--        there, 23505 and not 42501, which is why the assertions are red
--   g  organization_brands_primary_color_format dropped
--        BR-S1-02: a colour that is not #rrggbb, one in capitals, the short form
--   h  organization_brand_logos_type_is_the_bytes dropped
--        BR-S1-09: a type the bytes do not bear out, and bytes the type does not
--   i  organization_brand_logos_hash_is_the_bytes dropped
--        BR-S1-10: a hash that is not the bytes' own
--   j  DELETE granted on organization_brands
--        BR-S1-12: the application role cannot delete a brand
--        BR-S1-18: neither table grants a write at table level
--
-- Not red, and why:
--   k  organization_brand_logos_type dropped, on its own
--        none: an SVG is also refused by the signature check, which has no
--        branch for it. BR-S1-06 holds on either; the constraint is the one
--        that says why.
--   a, b, c on the first run, against the assertions as first written
--        none: an update has to read the row it changes, and the Staff read
--        policy asks for the same permission, reach and gates as the update.
--        For a member who is only Staff, deleting the clause from the update
--        policy changes nothing. A Resident's read policy asks for none of them,
--        so the assertions for a Manager, a scoped Owner and the Owners of three
--        lapsed Organizations who are also staying at them are the ones that
--        tell the two apart, and they are what went red above.
--   c, the suspended Subscription: the Resident path now asks the Portal's
--        gates too (BR-S1-36), a suspended Subscription denies it, and so the
--        Owner of a suspended Organization who is also staying there reads
--        nothing as a Resident either. Gate 1 is therefore asked by both read
--        paths and no assertion can tell the update policy's copy of it from
--        theirs: a missing Entitlement and a missing capability are the gates
--        that can, and are what c turns red. Gate 1 is held by the update policy
--        and stands on the read policies for its test.
--   BR-S1-10, the size half: a size that is not the bytes' own is also refused
--      by organization_brand_logos_size_is_the_bytes; i drops the hash check
--      alone, so the size assertion holds on its other constraint.
begin;
select plan(93);

-- ---------------------------------------------------------------------------
-- Fixtures: six Organizations, because each commercial gate needs one of its own
-- ---------------------------------------------------------------------------

-- A is the Organization under test. B is somebody else's. S is suspended, P is
-- past due, N has no Configuration capability at any Property, E has no
-- platform_core Entitlement.
insert into public.users (id, email) values
  ('bb000001-0000-4000-8000-000000000001', 'brand-owner-a@example.test'),
  ('bb000001-0000-4000-8000-000000000002', 'brand-owner-b@example.test'),
  ('bb000001-0000-4000-8000-000000000003', 'brand-owner-a-scoped@example.test'),
  ('bb000001-0000-4000-8000-000000000004', 'brand-front-desk-a@example.test'),
  ('bb000001-0000-4000-8000-000000000005', 'brand-manager-a@example.test'),
  ('bb000001-0000-4000-8000-000000000006', 'brand-composed-a@example.test'),
  ('bb000001-0000-4000-8000-000000000007', 'brand-composed-scoped-a@example.test'),
  ('bb000001-0000-4000-8000-000000000008', 'brand-resident-one@example.test'),
  ('bb000001-0000-4000-8000-000000000009', 'brand-resident-departed@example.test'),
  ('bb000001-0000-4000-8000-000000000010', 'brand-resident-both@example.test'),
  ('bb000001-0000-4000-8000-000000000011', 'brand-owner-s@example.test'),
  ('bb000001-0000-4000-8000-000000000012', 'brand-owner-p@example.test'),
  ('bb000001-0000-4000-8000-000000000013', 'brand-owner-n@example.test'),
  ('bb000001-0000-4000-8000-000000000014', 'brand-owner-e@example.test'),
  ('bb000001-0000-4000-8000-000000000015', 'brand-resident-cancelled@example.test'),
  ('bb000001-0000-4000-8000-000000000016', 'brand-resident-reserved@example.test'),
  ('bb000001-0000-4000-8000-000000000017', 'brand-manager-resident-a@example.test'),
  ('bb000001-0000-4000-8000-000000000018', 'brand-owner-of-a-and-b@example.test'),
  ('bb000001-0000-4000-8000-000000000019', 'brand-owner-a-scoped-no-stay@example.test'),
  ('bb000001-0000-4000-8000-000000000020', 'brand-owner-n-no-stay@example.test'),
  ('bb000001-0000-4000-8000-000000000021', 'brand-resident-suspended@example.test'),
  ('bb000001-0000-4000-8000-000000000022', 'brand-resident-portal-off@example.test'),
  ('bb000001-0000-4000-8000-000000000023', 'brand-resident-past-due@example.test');

insert into public.organizations (id, name, status) values
  ('ba000001-0000-4000-8000-00000000000a', 'Brand Org A', 'active'),
  ('ba000001-0000-4000-8000-00000000000b', 'Brand Org B', 'active'),
  ('ba000001-0000-4000-8000-0000000000a5', 'Brand Org S', 'active'),
  ('ba000001-0000-4000-8000-0000000000a6', 'Brand Org P', 'active'),
  ('ba000001-0000-4000-8000-0000000000a7', 'Brand Org N', 'active'),
  ('ba000001-0000-4000-8000-0000000000a8', 'Brand Org E', 'active');

insert into public.properties (id, organization_id, name) values
  ('bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'Brand A One'),
  ('bc000001-0000-4000-8000-0000000000a2', 'ba000001-0000-4000-8000-00000000000a', 'Brand A Two'),
  ('bc000001-0000-4000-8000-0000000000b1', 'ba000001-0000-4000-8000-00000000000b', 'Brand B One'),
  ('bc000001-0000-4000-8000-0000000000c5', 'ba000001-0000-4000-8000-0000000000a5', 'Brand S One'),
  ('bc000001-0000-4000-8000-0000000000c6', 'ba000001-0000-4000-8000-0000000000a6', 'Brand P One'),
  ('bc000001-0000-4000-8000-0000000000c7', 'ba000001-0000-4000-8000-0000000000a7', 'Brand N One'),
  ('bc000001-0000-4000-8000-0000000000c8', 'ba000001-0000-4000-8000-0000000000a8', 'Brand E One');

insert into public.subscriptions (organization_id, status) values
  ('ba000001-0000-4000-8000-00000000000a', 'active'),
  ('ba000001-0000-4000-8000-00000000000b', 'active'),
  ('ba000001-0000-4000-8000-0000000000a5', 'suspended'),
  ('ba000001-0000-4000-8000-0000000000a6', 'past_due'),
  ('ba000001-0000-4000-8000-0000000000a7', 'active'),
  ('ba000001-0000-4000-8000-0000000000a8', 'active');

-- E has the Front Office Entitlement its Residents' Stays need and no
-- platform_core, which is the one the brand is gated by.
insert into public.entitlements (organization_id, module_key) values
  ('ba000001-0000-4000-8000-00000000000a', 'platform_core'),
  ('ba000001-0000-4000-8000-00000000000b', 'platform_core'),
  ('ba000001-0000-4000-8000-0000000000a5', 'platform_core'),
  ('ba000001-0000-4000-8000-0000000000a6', 'platform_core'),
  ('ba000001-0000-4000-8000-0000000000a7', 'platform_core'),
  ('ba000001-0000-4000-8000-0000000000a8', 'front_office'),
  -- The Portal is a Front Office capability, which a Resident's Stay is asked
  -- for as well (ADR 0009): every Organization a Resident stays at has it.
  ('ba000001-0000-4000-8000-00000000000a', 'front_office'),
  ('ba000001-0000-4000-8000-00000000000b', 'front_office'),
  ('ba000001-0000-4000-8000-0000000000a5', 'front_office'),
  ('ba000001-0000-4000-8000-0000000000a6', 'front_office'),
  ('ba000001-0000-4000-8000-0000000000a7', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'configuration', true),
  ('bc000001-0000-4000-8000-0000000000a2', 'ba000001-0000-4000-8000-00000000000a', 'configuration', true),
  ('bc000001-0000-4000-8000-0000000000b1', 'ba000001-0000-4000-8000-00000000000b', 'configuration', true),
  ('bc000001-0000-4000-8000-0000000000c5', 'ba000001-0000-4000-8000-0000000000a5', 'configuration', true),
  ('bc000001-0000-4000-8000-0000000000c6', 'ba000001-0000-4000-8000-0000000000a6', 'configuration', true),
  ('bc000001-0000-4000-8000-0000000000c7', 'ba000001-0000-4000-8000-0000000000a7', 'configuration', false),
  ('bc000001-0000-4000-8000-0000000000c8', 'ba000001-0000-4000-8000-0000000000a8', 'configuration', true),
  -- The Portal's own capability: on wherever a Resident below is staying, and
  -- off at A Two, where one is staying to be told there is nothing to read.
  ('bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'portal_stay_overview', true),
  ('bc000001-0000-4000-8000-0000000000a2', 'ba000001-0000-4000-8000-00000000000a', 'portal_stay_overview', false),
  ('bc000001-0000-4000-8000-0000000000b1', 'ba000001-0000-4000-8000-00000000000b', 'portal_stay_overview', true),
  ('bc000001-0000-4000-8000-0000000000c5', 'ba000001-0000-4000-8000-0000000000a5', 'portal_stay_overview', true),
  ('bc000001-0000-4000-8000-0000000000c6', 'ba000001-0000-4000-8000-0000000000a6', 'portal_stay_overview', true),
  ('bc000001-0000-4000-8000-0000000000c7', 'ba000001-0000-4000-8000-0000000000a7', 'portal_stay_overview', true),
  ('bc000001-0000-4000-8000-0000000000c8', 'ba000001-0000-4000-8000-0000000000a8', 'portal_stay_overview', true);

-- A role an Organization wrote, holding the permission and nothing else: what
-- makes the permission, and not the name of a role, the thing asked.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('ba000001-0000-4000-8000-00000000000a', 'brand_keeper',
   'ba000001-0000-4000-8000-00000000000a', 'Brand keeper',
   array['branding.manage']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000001', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000b', 'bb000001-0000-4000-8000-000000000002', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000003', 'owner', '00000000-0000-0000-0000-000000000000', 'assigned_properties'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000004', 'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000005', 'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000006', 'brand_keeper', 'ba000001-0000-4000-8000-00000000000a', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000007', 'brand_keeper', 'ba000001-0000-4000-8000-00000000000a', 'assigned_properties'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000017', 'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-0000000000a5', 'bb000001-0000-4000-8000-000000000011', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-0000000000a6', 'bb000001-0000-4000-8000-000000000012', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-0000000000a7', 'bb000001-0000-4000-8000-000000000013', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-0000000000a8', 'bb000001-0000-4000-8000-000000000014', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000018', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000b', 'bb000001-0000-4000-8000-000000000018', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000019', 'owner', '00000000-0000-0000-0000-000000000000', 'assigned_properties'),
  ('ba000001-0000-4000-8000-0000000000a7', 'bb000001-0000-4000-8000-000000000020', 'owner', '00000000-0000-0000-0000-000000000000', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000003'),
  ('bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000007'),
  ('bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000019');

insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity) values
  ('bd000001-0000-4000-8000-000000000001', 'bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'BR-101', 'room', 2),
  ('bd000001-0000-4000-8000-000000000002', 'bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'BR-102', 'room', 2),
  ('bd000001-0000-4000-8000-000000000003', 'bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'BR-103', 'room', 2),
  ('bd000001-0000-4000-8000-000000000004', 'bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'BR-104', 'room', 2),
  ('bd000001-0000-4000-8000-000000000005', 'bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'BR-105', 'room', 2),
  ('bd000001-0000-4000-8000-000000000006', 'bc000001-0000-4000-8000-0000000000b1', 'ba000001-0000-4000-8000-00000000000b', 'BR-201', 'room', 2),
  ('bd000001-0000-4000-8000-000000000007', 'bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'BR-106', 'room', 2),
  ('bd000001-0000-4000-8000-000000000008', 'bc000001-0000-4000-8000-0000000000a1', 'ba000001-0000-4000-8000-00000000000a', 'BR-107', 'room', 2),
  ('bd000001-0000-4000-8000-000000000009', 'bc000001-0000-4000-8000-0000000000c5', 'ba000001-0000-4000-8000-0000000000a5', 'BR-501', 'room', 2),
  ('bd000001-0000-4000-8000-000000000010', 'bc000001-0000-4000-8000-0000000000c7', 'ba000001-0000-4000-8000-0000000000a7', 'BR-701', 'room', 2),
  ('bd000001-0000-4000-8000-000000000011', 'bc000001-0000-4000-8000-0000000000c8', 'ba000001-0000-4000-8000-0000000000a8', 'BR-801', 'room', 2),
  ('bd000001-0000-4000-8000-000000000012', 'bc000001-0000-4000-8000-0000000000c5', 'ba000001-0000-4000-8000-0000000000a5', 'BR-502', 'room', 2),
  ('bd000001-0000-4000-8000-000000000013', 'bc000001-0000-4000-8000-0000000000c6', 'ba000001-0000-4000-8000-0000000000a6', 'BR-601', 'room', 2),
  ('bd000001-0000-4000-8000-000000000014', 'bc000001-0000-4000-8000-0000000000a2', 'ba000001-0000-4000-8000-00000000000a', 'BR-201A', 'room', 2);

-- Five Residents: one with a current Stay at A, one whose Stay at A has
-- departed, one whose was cancelled, one with a reservation at A, and one with
-- a current Stay at A and another at B.
--
-- And five Staff Members who are also staying at the Organization they work
-- for: a Manager at A, a scoped Owner at A, and the Owners of S, N and E. They
-- are what tells a write policy's own clause from the read policy beneath it.
-- An update must be able to read the row it changes, and the Staff read policy
-- asks for the same permission, reach and gates as the write does — so for
-- anybody who only passes by being staff, deleting a clause from the write
-- policy changes nothing. A Resident's read policy asks for none of them, which
-- is the one place the two come apart.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on, departed_at) values
  ('be000001-0000-4000-8000-000000000001', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a1', 'bd000001-0000-4000-8000-000000000001', 'bb000001-0000-4000-8000-000000000008', 'resident', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000002', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a1', 'bd000001-0000-4000-8000-000000000002', 'bb000001-0000-4000-8000-000000000009', 'guest', 'departed', date '2026-08-01', date '2026-08-04', timestamptz '2026-08-04 10:00+00'),
  ('be000001-0000-4000-8000-000000000003', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a1', 'bd000001-0000-4000-8000-000000000003', 'bb000001-0000-4000-8000-000000000010', 'resident', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000004', 'ba000001-0000-4000-8000-00000000000b', 'bc000001-0000-4000-8000-0000000000b1', 'bd000001-0000-4000-8000-000000000006', 'bb000001-0000-4000-8000-000000000010', 'resident', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000005', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a1', 'bd000001-0000-4000-8000-000000000004', 'bb000001-0000-4000-8000-000000000015', 'guest', 'cancelled', date '2026-10-01', date '2026-10-03', null),
  ('be000001-0000-4000-8000-000000000006', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a1', 'bd000001-0000-4000-8000-000000000005', 'bb000001-0000-4000-8000-000000000016', 'guest', 'reserved', date '2027-01-10', date '2027-01-13', null),
  ('be000001-0000-4000-8000-000000000007', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a1', 'bd000001-0000-4000-8000-000000000007', 'bb000001-0000-4000-8000-000000000017', 'guest', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000008', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a1', 'bd000001-0000-4000-8000-000000000008', 'bb000001-0000-4000-8000-000000000003', 'guest', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000009', 'ba000001-0000-4000-8000-0000000000a5', 'bc000001-0000-4000-8000-0000000000c5', 'bd000001-0000-4000-8000-000000000009', 'bb000001-0000-4000-8000-000000000011', 'guest', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000010', 'ba000001-0000-4000-8000-0000000000a7', 'bc000001-0000-4000-8000-0000000000c7', 'bd000001-0000-4000-8000-000000000010', 'bb000001-0000-4000-8000-000000000013', 'guest', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000011', 'ba000001-0000-4000-8000-0000000000a8', 'bc000001-0000-4000-8000-0000000000c8', 'bd000001-0000-4000-8000-000000000011', 'bb000001-0000-4000-8000-000000000014', 'guest', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000012', 'ba000001-0000-4000-8000-0000000000a5', 'bc000001-0000-4000-8000-0000000000c5', 'bd000001-0000-4000-8000-000000000012', 'bb000001-0000-4000-8000-000000000021', 'guest', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000013', 'ba000001-0000-4000-8000-00000000000a', 'bc000001-0000-4000-8000-0000000000a2', 'bd000001-0000-4000-8000-000000000014', 'bb000001-0000-4000-8000-000000000022', 'guest', 'in_house', date '2026-09-01', null, null),
  ('be000001-0000-4000-8000-000000000014', 'ba000001-0000-4000-8000-0000000000a6', 'bc000001-0000-4000-8000-0000000000c6', 'bd000001-0000-4000-8000-000000000013', 'bb000001-0000-4000-8000-000000000023', 'guest', 'in_house', date '2026-09-01', null, null);

-- A PNG signature and padding: all the table reads of a logo is how its bytes
-- start, how long they are, and what is recorded beside them.
create function pg_temp.png(padding integer default 64) returns bytea
language sql as $$
  select '\x89504e470d0a1a0a'::bytea || decode(repeat('00', padding), 'hex')
$$;

-- Bytes a JPEG starts with, filed under a PNG's type in the test that needs a
-- type the bytes do not bear out.
create function pg_temp.jpeg() returns bytea
language sql as $$
  select '\xffd8ffe000104a46494600'::bytea || decode(repeat('00', 64), 'hex')
$$;

-- The brands the Organizations already have, written as their owners would
-- have, so what is under test below is the application role changing them.
insert into public.organization_brands (organization_id, primary_color, updated_by) values
  ('ba000001-0000-4000-8000-00000000000a', '#0f5132', 'bb000001-0000-4000-8000-000000000001'),
  ('ba000001-0000-4000-8000-00000000000b', '#7a1e3c', 'bb000001-0000-4000-8000-000000000002'),
  ('ba000001-0000-4000-8000-0000000000a5', '#0f5132', 'bb000001-0000-4000-8000-000000000011'),
  ('ba000001-0000-4000-8000-0000000000a6', '#0f5132', 'bb000001-0000-4000-8000-000000000012'),
  ('ba000001-0000-4000-8000-0000000000a7', '#0f5132', 'bb000001-0000-4000-8000-000000000013'),
  ('ba000001-0000-4000-8000-0000000000a8', '#0f5132', 'bb000001-0000-4000-8000-000000000014');

insert into public.organization_brand_logos
  (organization_id, content, content_type, content_hash, size_bytes, width, height, updated_by)
select organization_id, logo, 'image/png', encode(sha256(logo), 'hex'),
       octet_length(logo), 300, 200, updated_by
  from (select b.organization_id, b.updated_by, pg_temp.png(100) as logo
          from public.organization_brands as b
         where b.organization_id in ('ba000001-0000-4000-8000-00000000000a',
                                     'ba000001-0000-4000-8000-00000000000b',
                                     'ba000001-0000-4000-8000-0000000000a5',
                                     'ba000001-0000-4000-8000-0000000000a6',
                                     'ba000001-0000-4000-8000-0000000000a7',
                                     'ba000001-0000-4000-8000-0000000000a8')) as s;

-- How many rows a statement changed, or -1 when a policy refused it by raising.
-- A USING clause refuses by matching nothing and a WITH CHECK refuses by
-- raising; a raise inside an assertion would abort the transaction and silence
-- every assertion after it.
create function pg_temp.rows_changed(statement text) returns integer
language plpgsql as $$
declare
  changed integer;
begin
  execute statement;
  get diagnostics changed = row_count;
  return changed;
exception
  when insufficient_privilege then return -1;
end;
$$;

-- ---------------------------------------------------------------------------
-- The permission (BR-S1-19)
-- ---------------------------------------------------------------------------

select is(
  (select module_key from public.staff_permissions where key = 'branding.manage'),
  'platform_core',
  'BR-S1-19: branding.manage is in the catalogue and only the shipped Owner holds it');

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null and 'branding.manage' = any (permissions)$$,
  array['owner'],
  'BR-S1-19: no shipped role but the Owner holds branding.manage');

-- ---------------------------------------------------------------------------
-- What the table refuses whoever asks (BR-S1-02, 06 to 10)
-- ---------------------------------------------------------------------------

set local role ranza_app;

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-22: without a request context no brand is visible');

select app.set_request_context('bb000001-0000-4000-8000-000000000001');

select lives_ok(
  $$update public.organization_brands
       set primary_color = '#1a5d3a',
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  'BR-S1-02: a lower-case #rrggbb is a colour the table keeps');

select throws_ok(
  $$update public.organization_brands
       set primary_color = 'red',
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-02: a colour that is not #rrggbb is refused by the table');

select throws_ok(
  $$update public.organization_brands
       set primary_color = '#0F5132',
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-02: and so is one in capitals, because it is stored lower-case');

select throws_ok(
  $$update public.organization_brands
       set primary_color = '#fff',
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-02: and so is the short form');

select lives_ok(
  $$update public.organization_brand_logos
       set content = pg_temp.png(100),
           content_hash = encode(sha256(pg_temp.png(100)), 'hex'),
           size_bytes = octet_length(pg_temp.png(100)),
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  'BR-S1-05: a logo whose type, bytes, hash, size and dimensions agree is kept');

select throws_ok(
  $$update public.organization_brand_logos
       set content_type = 'image/svg+xml',
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-06: a logo typed image/svg+xml is refused by the table');

select throws_ok(
  $$update public.organization_brand_logos
       set content = pg_temp.png(524281),
           content_hash = encode(sha256(pg_temp.png(524281)), 'hex'),
           size_bytes = octet_length(pg_temp.png(524281)),
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-07: a logo over 512 KB is refused by the table');

select lives_ok(
  $$update public.organization_brand_logos
       set content = pg_temp.png(524280),
           content_hash = encode(sha256(pg_temp.png(524280)), 'hex'),
           size_bytes = octet_length(pg_temp.png(524280)),
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  'BR-S1-07: and one of exactly 512 KB is not');

select throws_ok(
  $$update public.organization_brand_logos
       set height = 127,
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-08: a logo under 128 px tall is refused by the table');

select throws_ok(
  $$update public.organization_brand_logos
       set width = 4097,
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-08: and one over 4096 px wide is too');

select throws_ok(
  $$update public.organization_brand_logos
       set content_type = 'image/jpeg',
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-09: a type that is not what the bytes say is refused by the table');

select throws_ok(
  $$update public.organization_brand_logos
       set content = pg_temp.jpeg(),
           content_hash = encode(sha256(pg_temp.jpeg()), 'hex'),
           size_bytes = octet_length(pg_temp.jpeg()),
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-09: and bytes that are not what the type says are refused too');

select throws_ok(
  $$update public.organization_brand_logos
       set content_hash = repeat('0', 64),
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-10: a hash or a size that is not the bytes'' own is refused');

select throws_ok(
  $$update public.organization_brand_logos
       set size_bytes = 99,
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-10: a size that is not the bytes'' own is refused on its own');

select throws_ok(
  $$update public.organization_brand_logos
       set content_type = null,
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'BR-S1-10: a logo is whole or it is absent');

-- ---------------------------------------------------------------------------
-- Reset empties and keeps the rows (BR-S1-12)
-- ---------------------------------------------------------------------------

select is(
  pg_temp.rows_changed($$delete from public.organization_brands
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  -1,
  'BR-S1-12: the application role cannot delete a brand');

select is(
  pg_temp.rows_changed($$delete from public.organization_brand_logos
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  -1,
  'BR-S1-12: nor a logo');

select lives_ok(
  $$update public.organization_brand_logos
       set content = null, content_type = null, content_hash = null,
           size_bytes = null, width = null, height = null,
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  'BR-S1-12: a logo is emptied in place, which is what a reset does');

select is(
  (select count(*)::int from public.organization_brand_logos
    where organization_id = 'ba000001-0000-4000-8000-00000000000a'),
  1,
  'BR-S1-12: and its row is still there');

-- The logo goes back, for the readers below.
select lives_ok(
  $$update public.organization_brand_logos
       set content = pg_temp.png(100),
           content_type = 'image/png',
           content_hash = encode(sha256(pg_temp.png(100)), 'hex'),
           size_bytes = octet_length(pg_temp.png(100)),
           width = 300, height = 200,
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  'BR-S1-12: a logo put back after a reset is kept');

-- ---------------------------------------------------------------------------
-- The write gates, each on its own (BR-S1-13 to 16)
-- ---------------------------------------------------------------------------

-- The same two statements are put to each member: the update, which a USING
-- clause refuses by matching nothing, and the upsert, whose insert half a WITH
-- CHECK refuses by raising. Both halves of both tables carry every gate, so
-- the brand is asked here and the logo once below.

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000005');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#222222',
           updated_by = 'bb000001-0000-4000-8000-000000000005'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-13: a member without branding.manage writes nothing');

select is(
  pg_temp.rows_changed($$insert into public.organization_brands
       (organization_id, primary_color, updated_by)
     values ('ba000001-0000-4000-8000-00000000000a', '#222222',
             'bb000001-0000-4000-8000-000000000005')
     on conflict (organization_id) do update set primary_color = '#222222'$$),
  -1,
  'BR-S1-13: a member without branding.manage changes nothing');

select is(
  pg_temp.rows_changed($$update public.organization_brand_logos
       set updated_by = 'bb000001-0000-4000-8000-000000000005'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-13: nor a logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000006');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#222222',
           updated_by = 'bb000001-0000-4000-8000-000000000006'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  1,
  'BR-S1-13: a role an Organization wrote holding only branding.manage writes the brand');

-- A Manager who is also staying at the Organization: reads the brand as a
-- Resident does, and must still not write it.
set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000017');

select is(
  (select count(*)::int from public.organization_brands),
  1,
  'BR-S1-13: a Manager who is also staying at the Organization reads its brand as a Resident');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#222222',
           updated_by = 'bb000001-0000-4000-8000-000000000017'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-13: and still writes nothing, because reading as a Resident is not holding the permission');

select is(
  pg_temp.rows_changed($$update public.organization_brand_logos
       set updated_by = 'bb000001-0000-4000-8000-000000000017'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-13: nor the logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000003');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#333333',
           updated_by = 'bb000001-0000-4000-8000-000000000003'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-14: a holder of the permission who reaches one Property writes nothing');

select is(
  pg_temp.rows_changed($$insert into public.organization_brands
       (organization_id, primary_color, updated_by)
     values ('ba000001-0000-4000-8000-00000000000a', '#333333',
             'bb000001-0000-4000-8000-000000000003')
     on conflict (organization_id) do update set primary_color = '#333333'$$),
  -1,
  'BR-S1-14: and cannot upsert it either');

select is(
  pg_temp.rows_changed($$update public.organization_brand_logos
       set updated_by = 'bb000001-0000-4000-8000-000000000003'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-14: nor change the logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000007');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#333333',
           updated_by = 'bb000001-0000-4000-8000-000000000007'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-14: nor does a role an Organization wrote, assigned to one Property');

-- Owner of S: a suspended Subscription.
set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000011');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#444444',
           updated_by = 'bb000001-0000-4000-8000-000000000011'
     where organization_id = 'ba000001-0000-4000-8000-0000000000a5'$$),
  0,
  'BR-S1-15: a suspended Subscription writes nothing and a past_due one does');

select is(
  pg_temp.rows_changed($$insert into public.organization_brands
       (organization_id, primary_color, updated_by)
     values ('ba000001-0000-4000-8000-0000000000a5', '#444444',
             'bb000001-0000-4000-8000-000000000011')
     on conflict (organization_id) do update set primary_color = '#444444'$$),
  -1,
  'BR-S1-15: a suspended Subscription cannot upsert either');

select is(
  pg_temp.rows_changed($$update public.organization_brand_logos
       set updated_by = 'bb000001-0000-4000-8000-000000000011'
     where organization_id = 'ba000001-0000-4000-8000-0000000000a5'$$),
  0,
  'BR-S1-15: nor change a logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000012');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#555555',
           updated_by = 'bb000001-0000-4000-8000-000000000012'
     where organization_id = 'ba000001-0000-4000-8000-0000000000a6'$$),
  1,
  'BR-S1-15: a past_due Subscription is in its grace period and still writes');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000013');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#666666',
           updated_by = 'bb000001-0000-4000-8000-000000000013'
     where organization_id = 'ba000001-0000-4000-8000-0000000000a7'$$),
  0,
  'BR-S1-15: no Configuration capability and no Entitlement each write nothing');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000014');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#666666',
           updated_by = 'bb000001-0000-4000-8000-000000000014'
     where organization_id = 'ba000001-0000-4000-8000-0000000000a8'$$),
  0,
  'BR-S1-15: an Organization without the platform_core Entitlement writes nothing');

-- The author.
set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000001');

select throws_ok(
  $$update public.organization_brands
       set primary_color = '#777777',
           updated_by = 'bb000001-0000-4000-8000-000000000002'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '42501',
  null,
  'BR-S1-16: a write names the acting user as its author');

select throws_ok(
  $$insert into public.organization_brands
      (organization_id, primary_color, updated_by)
    values ('ba000001-0000-4000-8000-00000000000a', '#777777',
            'bb000001-0000-4000-8000-000000000002')
    on conflict (organization_id) do update set primary_color = '#777777'$$,
  '42501',
  null,
  'BR-S1-16: and so is an upsert');

-- ---------------------------------------------------------------------------
-- Another Organization's brand (BR-S1-17)
-- ---------------------------------------------------------------------------

select set_eq(
  'select organization_id::text from public.organization_brands',
  array['ba000001-0000-4000-8000-00000000000a'],
  'BR-S1-17: an Owner reads and writes nothing of another Organization''s brand');

select set_eq(
  'select organization_id::text from public.organization_brand_logos',
  array['ba000001-0000-4000-8000-00000000000a'],
  'BR-S1-17: nor its logo');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#888888',
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000b'$$),
  0,
  'BR-S1-17: an update to another Organization''s brand changes nothing');

select is(
  pg_temp.rows_changed($$insert into public.organization_brands
       (organization_id, primary_color, updated_by)
     values ('ba000001-0000-4000-8000-00000000000b', '#888888',
             'bb000001-0000-4000-8000-000000000001')
     on conflict (organization_id) do update set primary_color = '#888888'$$),
  -1,
  'BR-S1-17: and an upsert into it is refused');

-- ---------------------------------------------------------------------------
-- A write names its columns (BR-S1-18)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.organization_brands
       set created_at = now(),
           updated_by = 'bb000001-0000-4000-8000-000000000001'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '42501',
  null,
  'BR-S1-18: the application role writes only the columns the commands write');

-- Somebody who holds branding.manage across both Organizations, so that every
-- policy admits moving a brand from one to the other — the old row is theirs
-- and so is the new one, the author is named, the gates hold at both — and the
-- column grant is the only thing left to refuse it. With an Owner of one, the
-- policies refuse it too, and the grant is never asked.
set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000018');

select throws_ok(
  $$update public.organization_brands
       set organization_id = 'ba000001-0000-4000-8000-00000000000b',
           updated_by = 'bb000001-0000-4000-8000-000000000018'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '42501',
  null,
  'BR-S1-18: a brand cannot be moved to another Organization, even by somebody who administers both');

select throws_ok(
  $$update public.organization_brand_logos
       set organization_id = 'ba000001-0000-4000-8000-00000000000b',
           updated_by = 'bb000001-0000-4000-8000-000000000018'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$,
  '42501',
  null,
  'BR-S1-18: nor a logo');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#1a5d3a',
           updated_by = 'bb000001-0000-4000-8000-000000000018'
     where organization_id = 'ba000001-0000-4000-8000-00000000000b'$$),
  1,
  'BR-S1-18: and the same person does change the brand of either, so it is the move and not the person that is refused');

select is(
  (select count(*)::int from pg_class as c
     cross join lateral aclexplode(c.relacl) as a
    where c.oid in ('public.organization_brands'::regclass,
                    'public.organization_brand_logos'::regclass)
      and a.grantee = 'ranza_app'::regrole
      and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'BR-S1-18: neither table grants the application role a write at table level');

-- ---------------------------------------------------------------------------
-- A Resident (BR-S1-20 to 22)
-- ---------------------------------------------------------------------------

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000008');

select set_eq(
  'select organization_id::text from public.organization_brands',
  array['ba000001-0000-4000-8000-00000000000a'],
  'BR-S1-20: a Resident reads the brand and the logo of the Organization they have a current Stay with and no other');

select set_eq(
  'select organization_id::text from public.organization_brand_logos',
  array['ba000001-0000-4000-8000-00000000000a'],
  'BR-S1-20: the logo of that Organization too');

select is(
  pg_temp.rows_changed($$update public.organization_brands
       set primary_color = '#999999',
           updated_by = 'bb000001-0000-4000-8000-000000000008'
     where organization_id = 'ba000001-0000-4000-8000-00000000000a'$$),
  0,
  'BR-S1-20: a Resident changes nothing of the brand they read');

select set_eq(
  'select app.resident_organization_ids()::text',
  array['ba000001-0000-4000-8000-00000000000a'],
  'BR-S1-20: the Organizations a Resident has a current Stay with');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000009');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-20: a Resident whose Stay has departed reads nothing');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000015');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-20: nor one whose Stay was cancelled');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000016');

select set_eq(
  'select organization_id::text from public.organization_brands',
  array['ba000001-0000-4000-8000-00000000000a'],
  'BR-S1-20: a Resident with a reservation reads the brand of the Organization they are to stay with');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000010');

select set_eq(
  'select organization_id::text from public.organization_brands',
  array['ba000001-0000-4000-8000-00000000000a', 'ba000001-0000-4000-8000-00000000000b'],
  'BR-S1-21: a Resident of two Organizations reads both brands');

select set_eq(
  'select organization_id::text from public.organization_brand_logos',
  array['ba000001-0000-4000-8000-00000000000a', 'ba000001-0000-4000-8000-00000000000b'],
  'BR-S1-21: and both logos');

-- A member who may not manage the brand and has no Stay reads none.
set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000004');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-22: a member without the permission reads no brand and no logo');

select is_empty(
  'select organization_id from public.organization_brand_logos',
  'BR-S1-22: and no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000005');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-22: a Manager, who is not the Owner, reads no brand');

select is_empty(
  'select app.resident_organization_ids()',
  'BR-S1-22: a membership is not a Stay, so the Resident path adds nothing for Staff');

-- ---------------------------------------------------------------------------
-- A Resident is shown a brand where the Portal is shown a Stay (BR-S1-36)
-- ---------------------------------------------------------------------------

-- The Stay list asks app.resident_can_use_capability() of every Stay it lists.
-- The brand around a Stay is read through the same question, so a Resident who
-- is shown no Stay is handed no brand: the Subscription, the Entitlement and
-- the Property's own capability, and not the Stay alone.
set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000021');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-36: a Resident of an Organization whose Subscription is suspended reads no brand and no logo');

select is_empty(
  'select organization_id from public.organization_brand_logos',
  'BR-S1-36: not the logo either');

select is_empty(
  'select app.resident_organization_ids()',
  'BR-S1-36: and the Resident path names no Organization for them');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000022');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-36: a Resident whose Stay is at a Property with the Portal switched off reads no brand');

select is_empty(
  'select organization_id from public.organization_brand_logos',
  'BR-S1-36: and no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000023');

select set_eq(
  'select organization_id::text from public.organization_brands',
  array['ba000001-0000-4000-8000-0000000000a6'],
  'BR-S1-36: a past_due Subscription is in its grace period and its Resident still reads the brand (ADR 0040)');

-- ---------------------------------------------------------------------------
-- A Resident reads the columns the Portal draws and no others (BR-S1-39)
-- ---------------------------------------------------------------------------

-- The Resident reads through the same role as Staff do, so what the role may
-- read is what a Resident may: who wrote the brand and when are in neither
-- screen. Read from the catalogue, which a table-level grant would also fill.
set local role none;

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where grantee = 'ranza_app' and privilege_type = 'SELECT'
       and table_schema = 'public' and table_name = 'organization_brands'$$,
  array['organization_id', 'primary_color'],
  'BR-S1-39: the application role reads the colour of a brand and which Organization it is, and nothing else');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where grantee = 'ranza_app' and privilege_type = 'SELECT'
       and table_schema = 'public' and table_name = 'organization_brand_logos'$$,
  array['organization_id', 'content', 'content_type', 'content_hash',
        'size_bytes', 'width', 'height'],
  'BR-S1-39: and of a logo its bytes and what is known of them, not who wrote it or when');

-- ---------------------------------------------------------------------------
-- The Staff read policies, each gate on its own (BR-S1-41)
-- ---------------------------------------------------------------------------

-- Neither of these is staying anywhere, so the Resident policy cannot answer
-- for them: what they read is what the Staff policy admits and nothing else.
-- The first holds the permission and every commercial gate and reaches one
-- Property; the second holds the permission and reaches everything, in an
-- Organization where the Configuration capability is off.
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000019');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-41: a holder of the permission who reaches one Property reads no brand, which reach alone refuses');

select is_empty(
  'select organization_id from public.organization_brand_logos',
  'BR-S1-41: and no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000020');

select is_empty(
  'select organization_id from public.organization_brands',
  'BR-S1-41: a holder who reaches everything reads no brand where the Configuration capability is off, which the gate alone refuses');

select is_empty(
  'select organization_id from public.organization_brand_logos',
  'BR-S1-41: and no logo');

-- ---------------------------------------------------------------------------
-- The first logo and the first brand an Organization writes (BR-S1-05, 13 to 16)
-- ---------------------------------------------------------------------------

-- An update has to read the row it changes, so the update tests above are
-- bounded by the read policies as much as by their own. An insert reads
-- nothing: these put each gate to the insert policies alone, on Organizations
-- that have no logo yet and then no brand yet. The owner empties them first,
-- which the application role cannot do.
create function pg_temp.insert_logo(organization uuid, author uuid) returns void
language sql as $$
  insert into public.organization_brand_logos
    (organization_id, content, content_type, content_hash, size_bytes, width, height, updated_by)
  select organization, logo, 'image/png', encode(sha256(logo), 'hex'),
         octet_length(logo), 300, 200, author
    from (select pg_temp.png(100) as logo) as s
$$;

create function pg_temp.insert_brand(organization uuid, author uuid) returns void
language sql as $$
  insert into public.organization_brands (organization_id, primary_color, updated_by)
  values (organization, '#0f5132', author)
$$;

set local role none;
delete from public.organization_brand_logos
 where organization_id in ('ba000001-0000-4000-8000-00000000000a',
                           'ba000001-0000-4000-8000-0000000000a5',
                           'ba000001-0000-4000-8000-0000000000a6',
                           'ba000001-0000-4000-8000-0000000000a7',
                           'ba000001-0000-4000-8000-0000000000a8');

set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000005');
select throws_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000005')$$,
  '42501', null,
  'BR-S1-13: a member without branding.manage inserts no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000003');
select throws_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000003')$$,
  '42501', null,
  'BR-S1-14: a holder who reaches one Property inserts no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000011');
select throws_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-0000000000a5', 'bb000001-0000-4000-8000-000000000011')$$,
  '42501', null,
  'BR-S1-15: a suspended Subscription inserts no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000013');
select throws_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-0000000000a7', 'bb000001-0000-4000-8000-000000000013')$$,
  '42501', null,
  'BR-S1-15: no Configuration capability inserts no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000014');
select throws_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-0000000000a8', 'bb000001-0000-4000-8000-000000000014')$$,
  '42501', null,
  'BR-S1-15: no platform_core Entitlement inserts no logo');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000001');
select throws_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000002')$$,
  '42501', null,
  'BR-S1-16: a logo names the acting user as its author');
select lives_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000001')$$,
  'BR-S1-05: an Owner inserts the first logo of an Organization');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000012');
select lives_ok(
  $$select pg_temp.insert_logo('ba000001-0000-4000-8000-0000000000a6', 'bb000001-0000-4000-8000-000000000012')$$,
  'BR-S1-15: and so does the Owner of an Organization whose Subscription is past_due');

set local role none;
delete from public.organization_brands
 where organization_id in ('ba000001-0000-4000-8000-00000000000a',
                           'ba000001-0000-4000-8000-0000000000a5',
                           'ba000001-0000-4000-8000-0000000000a6',
                           'ba000001-0000-4000-8000-0000000000a7',
                           'ba000001-0000-4000-8000-0000000000a8');

set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000005');
select throws_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000005')$$,
  '42501', null,
  'BR-S1-13: a member without branding.manage inserts no brand');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000003');
select throws_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000003')$$,
  '42501', null,
  'BR-S1-14: a holder who reaches one Property inserts no brand');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000011');
select throws_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-0000000000a5', 'bb000001-0000-4000-8000-000000000011')$$,
  '42501', null,
  'BR-S1-15: a suspended Subscription inserts no brand');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000013');
select throws_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-0000000000a7', 'bb000001-0000-4000-8000-000000000013')$$,
  '42501', null,
  'BR-S1-15: no Configuration capability inserts no brand');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000014');
select throws_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-0000000000a8', 'bb000001-0000-4000-8000-000000000014')$$,
  '42501', null,
  'BR-S1-15: no platform_core Entitlement inserts no brand');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000001');
select throws_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000002')$$,
  '42501', null,
  'BR-S1-16: a brand names the acting user as its author');
select lives_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000001')$$,
  'BR-S1-05: an Owner inserts the first brand of an Organization');

set local role none;
set local role ranza_app;
select app.set_request_context('bb000001-0000-4000-8000-000000000012');
select lives_ok(
  $$select pg_temp.insert_brand('ba000001-0000-4000-8000-0000000000a6', 'bb000001-0000-4000-8000-000000000012')$$,
  'BR-S1-15: and so does the Owner of an Organization whose Subscription is past_due, for its brand');

-- Read from the catalogue: has_function_privilege on a function that is not
-- there raises, and takes the rest of the transaction with it.
set local role none;

select is(
  (select array_agg(grantee::regrole::text order by grantee::regrole::text)
     from pg_proc as p
     cross join lateral aclexplode(p.proacl) as a
    where p.oid = 'app.resident_organization_ids()'::regprocedure
      and a.privilege_type = 'EXECUTE'
      and a.grantee <> p.proowner),
  array['ranza_app'],
  'BR-S1-20: the Resident path is callable by the application role and not by PUBLIC');

select * from finish();
rollback;
