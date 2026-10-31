# 0057. A Property's operating model sets its defaults and its words, never its rules

Date: 2026-10-31

Status: Proposed

Builds on [ADR 0004](0004-student-residence-is-a-property-configuration.md),
[ADR 0023](0023-copy-is-icu-through-next-intl-and-the-catalogue-stays-typed.md)
and [ADR 0036](0036-a-property-is-configured-and-its-currency-is-fixed-by-its-first-folio.md).
The evidence is [`docs/yurt-audit-2026-10-31.html`](../yurt-audit-2026-10-31.html);
the work it orders is [`docs/yurt-first-plan.html`](../yurt-first-plan.html).

## Context

Ranza is to serve Turkish student dormitories (_yurt_) first. ADR 0004 already
settled that a dormitory is a Property configuration and never a fork, and the
data model honours it: a Resident is a Stay type and a bed is a Unit under a
room (ADR 0025).

The screens do not. Each one shows what a hotel desk needs and asks the stay
type, row by row, whether to hide a price or allow an open end. A dormitory
manager in mid-term opens Today to Arrivals 0/0 and Departures 0/0, books a
student through a form that defaults to a Guest and asks for a name, an email
and a phone, reads "Sakin" where every Turkish dormitory says "Öğrenci", and
looks at a calendar that cannot show more than 30 days of a ten-month contract.
Nothing records that a Property is a dormitory, so no screen can know.

The tempting answer is two interfaces, one per kind of business. It is wrong
for the reasons ADR 0004 gives, and for one more: dormitories in Türkiye
commonly take short-stay Guests in the summer, and an Organization may run a
dormitory and a hotel side by side. Neither fits a product split by kind.

## Decision

### A Property has an operating model

`properties.operating_model` is `hotel` or `dormitory`, checked by a constraint,
with `hotel` the default, so every existing Property keeps exactly the
behaviour it has. It belongs to the Property and not the Organization, because
one Organization may run both. It is set on the Configuration screen by whoever
may already change a Property's settings, and changing it writes an audit
record like any other setting.

### The model chooses defaults, presentation and wording, and nothing else

What the model may change:

- **Defaults**: the stay type a new booking starts as, whether date presets are
  nights or terms, the window the room calendar opens on, and which Property
  capabilities are switched on when the model is first chosen.
- **Composition**: which cards Today is built from and the order of the rail.
  A destination is still opened only by its gates (ADR 0047, ADR 0056).
- **Wording**: the label a Turkish, English or Arabic reader sees for a
  canonical term.

What it may never change: who may do what, what a write accepts, how money is
posted, or any invariant. **No SQL policy, trigger or function reads
`operating_model`**, and a pgTAP assertion over `pg_policies.qual` and
`pg_proc.prosrc` says so, so a rule cannot quietly start depending on it.
Because of that, changing the model of a Property in use is safe: it changes
what the screens offer first and what they call things, never a stored record.

### A rule a dormitory needs is a capability any Property can choose

When a dormitory needs a different rule — a Resident booking that must have an
end date, gender on a room enforced at booking, rent posted as instalments,
nightly attendance — it is built as a setting or a Property capability of its
own, available to any Property whatever its model. The model only decides its
default. A hostel or staff housing then gets the same rule without a third
model, and every rule stays testable without one.

### Words change through the typed catalogue, not a mapping table

The code, the database and the canonical vocabulary keep Resident, Guest and
Reservation (blueprint section 2). What a dormitory reader sees comes from the
same typed catalogue (ADR 0023) through an overlay: the strings a dormitory
says differently, in all three languages, typed against the catalogue's own
interface and laid over it where the catalogue is loaded. On the server that
is the request config, which reads the `?property=` the proxy saw; on the
client it is a provider in the workspace layout that follows the URL, because
the layout is not rendered again on a client navigation. Each label is still
reviewed in all three languages in the same change, and a unit test fails if
one language overrides a string the others do not, or if a dormitory's Turkish
or English still says Resident.

The first draft of this ADR said an ICU `select` on the model. That needs the
model passed to every `t()` call in the workspace, hundreds of them, and a call
that forgets it silently shows the hotel word, which is the failure an overlay
cannot have. This is not the free-text terminology mapping of blueprint
section 8, which an Organization would author itself and which remains
unbuilt.

## Alternatives rejected

- **Two applications, or two route trees.** ADR 0004 forbids it, it doubles
  every fix, and a dormitory's summer Guests would need the other one.
- **The model on the Organization.** It cannot describe an Organization that
  runs both.
- **One toggle per screen.** It gives a dormitory the same work of switching
  twenty settings, and no coherent default when a Property is created.
- **The stay type as the switch.** Screens already branch on it, and it is a
  fact about one booking. A dormitory with summer Guests has both stay types
  on the same day.

## Consequences

Hotel Properties see no change, because `hotel` is the default and every
current screen is what `hotel` means.

Every screen the plan touches takes the model as a read of the active
Property's settings, which the workspace already loads. The places that branch
on `stayType` for presentation keep doing so, because that is a fact about the
booking in front of them; the model only chooses what the next booking starts
as.

The first dormitory capabilities (gender on rooms, instalment schedules, a
required term end) each need their own feature design and edge-case rows, and
the bed price is an amendment to ADR 0038, not part of this decision.

Hosted staging has no dormitory Property, so nothing here can be seen there
until one is seeded.
