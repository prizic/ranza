# Fourteen-day pilot tester script

## Before day 1

The pilot manager records the release SHA, Operator and Branch IDs, active Student denominator, Branch timezone/cutoffs, kitchen contact, management contact, and legacy fallback owner. Use synthetic identifiers in screenshots and issue reports.

### Student onboarding rehearsal

1. As authorized staff, create one Student manually and verify that the selected Branch, preferred language, and generated Access ID are correct.
2. Import a UTF-8 CSV containing a valid row, a blank physical row, a duplicate external reference, and an invalid language. Confirm that displayed row numbers match the original file, errors are understandable, and only selected valid rows are created.
3. Issue an activation code, hand it directly to the intended tester, and confirm that the code appears only once and expires in 24 hours. Never copy it into an issue or screenshot.
4. On the assigned mobile browser, activate with the Access ID, one-time code, and a 6–12 digit PIN. Confirm that the authenticated home shows the tester's real name, current Branch, Branch timezone, and preferred language.
5. Sign out, sign back in with Access ID and PIN, and confirm another Student in the same Branch cannot be viewed by changing a URL.
6. As staff, reset the PIN. Confirm all existing Student sessions lose access immediately, the old PIN fails, the recovery page is clearly labeled, and the new one-time code activates the same Student identity.
7. Archive the Student and confirm sign-in and authenticated pages are denied. Reactivate only if the pilot record calls for it.
8. Repeat activation layout and keyboard checks in Turkish, English, and Arabic/RTL on the browser/device matrix in the readiness checklist. Record only the displayed support reference on failures.

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
