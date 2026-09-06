# Fourteen-day pilot tester script

## Before day 1

The pilot manager records the release SHA, Operator and Branch IDs, active Student denominator, Branch timezone/cutoffs, kitchen contact, management contact, and legacy fallback owner. Use synthetic identifiers in screenshots and issue reports.

## Daily Student script

1. Sign in on the assigned mobile browser and confirm the correct Branch and language.
2. Submit Staying or Away before the Attendance cutoff. Confirm the saved state and time.
3. Submit tomorrow's offered Meals, including zero meals when applicable. Confirm the saved selection.
4. Read the current Announcement and acknowledge it when requested.
5. View Balance and Wi-Fi information; never enter a payment or expose Wi-Fi credentials in a report.
6. On any failure, record local time, screen, action, expected/actual result, and the displayed correlation/support reference.

## Daily staff script

1. Before cutoff, compare active roster count to the agreed roster source.
2. After cutoff, verify Attendance finalization, Staying/Away/Unconfirmed totals, and one Student-level sample.
3. Verify final Meal totals and ask the kitchen whether it used Ranza as its preparation record.
4. Record corrections only with a reason; export final records and verify stable headers.
5. Check failed/delayed jobs and retry once through the supported operation. Escalate with the correlation reference if it remains failed.
6. Record whether management used Ranza as the primary nightly record and whether a fallback was used.

## Day 7 and day 14 checkpoint

The pilot manager computes the metrics from `metrics-dictionary.md`, links all critical-error issues, and produces a decision brief. Day 14 additionally records the paid-conversion decision. Do not mark success from impressions alone.

## Issue severity

- Critical: cross-tenant disclosure, unrecoverable corruption, wrong final kitchen/attendance totals, authentication bypass, or exposed secret.
- High: primary daily workflow unavailable without safe workaround.
- Medium/low: recoverable non-critical behavior or polish.

Critical response: stop the affected feature with Entitlements/configuration, preserve correlation references, notify the incident commander, and follow the incident runbook.
