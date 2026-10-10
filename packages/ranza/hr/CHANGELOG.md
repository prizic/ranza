# Changelog

All notable changes to `@ranza/hr` will be documented in this file.

## 0.0.0

- Initial release: employee directory independent of system access, weekly rota shifts, leave requests with clash detection, and payroll periods with payslips.
- RANZ-42: payroll is approved for the whole Organization and needs reach to every Property; a run is in one currency, kept in integer minor units, and cannot change once approved. Employment can be ended without losing the record. Register, terminate, leave decisions and payroll approval are audited. The IBAN is returned masked. `approveLeave` became `decideLeave`; every command's arguments are objects and amounts are `*Minor`. The deductions are named placeholders in `deductions.ts`. `on_leave` and `paid` were removed because nothing reached them.
- RANZ-42 review: a run is approved only for a period that has ended and covers everyone employed at any point in it; `latestEndedPeriod` names the month payroll opens on. A termination is not dated ahead. A rota is read only where its employee is, and a leaver takes no new shift or leave in the database either. A kind of leave is no longer written to the audit record.
