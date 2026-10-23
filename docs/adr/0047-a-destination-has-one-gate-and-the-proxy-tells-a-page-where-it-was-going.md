# 0047. A destination has one gate, and the proxy tells a page where it was going

Date: 2026-10-18

Status: Proposed

Builds on [ADR 0007](0007-a-session-becomes-a-request-context.md),
[ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0019](0019-a-live-screen-uses-tanstack-query-scoped-to-the-tenant.md),
[ADR 0026](0026-a-role-is-a-named-set-of-permissions-and-reach-is-taken-away-for-free.md),
[ADR 0031](0031-an-audit-record-carries-its-location-and-is-read-by-permission.md) and
[ADR 0040](0040-what-admits-a-subscription-status-and-an-active-property.md).

## Context

The UX audit of 2026-10-11 found the Workspace saying two different things about
the same page. The rail offered Integrations to an Owner and the page said it was
not in their Subscription; it offered HR and Payroll to a role without `hr.view`
and the page opened on an empty roster; and a Front desk Staff Member who typed
the data-export address was told their Organization had not bought a module it
had. Three causes:

- the rail decided by one rule and each page by its own, so they agreed only
  where somebody had copied one into the other;
- the rail keyed what it offered on a capability key, and People and HR share
  one (`staff_administration`) under different modules, so either being open
  listed both;
- one refusal covered every gate.

Separately, a server component is not handed its own path, so a signed-out visitor
opening a deep link could only be sent to sign in with nothing to come back to,
and the bare address could only open in one language. These are decisions the code
now assumes, and the owner has not made them.

## Decision

### A destination has one gate, and everything reads it

`ScreenGate` in `lib/screens.ts` says what a destination asks of a Property
(Subscription, Entitlement and the Property's capability, as `can_use_capability`
does) and of the person (a permission in the Organization). The shell asks it of
every destination in one read, the Property switcher is built from the answers,
and a page asks it with `screenProperties`. Integrations asks its capability as
well as `integrations.view`, and HR asks `hr.view` as well as its module's
capability. The rail is told which destinations open, by route segment, and which
of them open at each Property; once a Property is chosen it lists only those.
Hiding is still not the boundary: the page and the database deny either way.

### A refusal names the gate that stopped them

`explainDenial` in `@ranza/core` reads the gates one at a time, where
`can_use_capability` answers them together, because the answer is what the person
is told. Reach comes first, then the Subscription and the Entitlement, then the
Property's capability, then the permission. It is asked only after a page has
found nothing to show, so an ordinary request pays nothing for it, and a
destination is explained as `open` exactly where `listPermittedProperties` lists
it (`tests/integration/screen-denial.test.ts` holds the two together).

It reads only what the policies already let a member read: their Organization's
Subscription and Entitlements and the capabilities of the Properties they reach.
A Property the viewer does not reach is one answer for stale, forged, malformed
and unassigned, so it does not say which exists. A role that lacks a permission
is told its name as the People screen words it and that someone who manages staff
can add it — Owners and Managers by default — which is true of the shipped roles
and is not claimed to be true of every authored one.

When more than one gate would stop somebody, the first in that order is said: a
Front desk Staff Member at a Property where Integrations is off is told it is off
there, because that is true for the Owner too and no change to the role would
open it.

### A proxy writes where the request was going, and remembers the language

`proxy.ts` sets `x-ranza-location` to the path and query being asked for, on
every localized request, overwriting any value a client sent. `requireViewer`
reads it and sends a signed-out visitor to `/{locale}/sign-in?next=<path>`;
the sign-in page follows `next` only when `safeReturnPath` accepts it — a relative
path under the page's own language that is not the sign-in page, with no other
origin, `//host`, backslash or control character — and lands on Today otherwise.
The same header lets the root layout title each page, which a layout cannot
otherwise know.

It also sets a cookie, `ranza_locale`, on every localized request, and answers
the bare address with the language it holds, then the browser's
`Accept-Language`, then Turkish. The redirect from `/` moved out of
`next.config.ts`, which runs before the proxy.

### Costs and what is left open

The proxy runs on every page request; it does no I/O. A page that keeps its own
denial copy — the front-desk screens, which other work was changing when this
landed — says "not open at this Property" for every gate until it renders
`ScreenDenied`. A form with an unsaved edit asks before a link or closing the tab
takes it away and not before the Back button, which browsers treat as trapping
somebody on a page; keeping the draft across navigation is a decision of its own
(CF-DEF-06). A QR code for two-step setup needs a new dependency (OA-NB-04); a
notice to an Owner whose two-step verification is off waits for a decision
(OA-NB-05); the idle timeout stays OA-NB-03.
