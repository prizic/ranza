# Issue Tracker: GitHub

Ranza specifications and implementation tickets are tracked in GitHub Issues for `prizic/ranza`. Use the `gh` CLI and infer the repository from the configured `origin` remote.

## Conventions

- Implementation tickets are numbered by title prefix and created in dependency order.
- Every ticket contains a `Blocked by:` line. GitHub native blocking relationships are canonical when available; the body line is the readable fallback.
- Assign implementation tickets to `seifelesllamseif`.
- Apply exactly one `phase:*`, one `type:*`, one `priority:*`, and one or more `area:*` labels.
- Apply `ready-for-agent` only when every blocker is closed. Otherwise apply `blocked`.
- Each ticket links to `docs/specs/ranza-pilot.md`, identifies the user stories it closes, and includes binary acceptance criteria and verification commands or seams.
- Do not close or rewrite a parent specification issue while working on a child ticket.

## Common operations

- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,labels,assignees`
- Claim: `gh issue edit <number> --add-assignee @me`
- Label: `gh issue edit <number> --add-label <label>`
- Comment: `gh issue comment <number> --body <text>`
- Close after verified completion: `gh issue close <number> --comment <verification-summary>`

Pull requests are implementation and review surfaces, not feature-request intake.
