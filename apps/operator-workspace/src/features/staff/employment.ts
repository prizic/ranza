/**
 * What HR says about a login, as the People roster shows it (PEOPLE-07,
 * PEOPLE-08): the person's name, and whether they still work here.
 *
 * Membership is access and an employee record is employment, so the two can
 * disagree — and the disagreement that matters is a leaver who can still sign
 * in. Only these three facts reach the roster; the record's pay and bank
 * details do not.
 */
export interface StaffEmployment {
  name: string;
  status: "active" | "terminated";
  /** `YYYY-MM-DD`, set once the employment has ended. */
  terminatedOn: string | null;
}
