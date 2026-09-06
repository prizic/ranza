export interface AnnouncementFollowupRow {
  student_id: string;
  display_name: string;
  status: "acknowledged" | "unacknowledged" | "inactive";
  resolved_at: string;
  acknowledged_at: string | null;
}
export function announcementFollowupCsv(
  rows: readonly AnnouncementFollowupRow[],
) {
  const headers = [
    "student_id",
    "display_name",
    "status",
    "resolved_at",
    "acknowledged_at",
  ] as const;
  const field = (value: string) => {
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    headers.join(",") +
    "\r\n" +
    rows
      .map(
        (row) => headers.map((key) => field(row[key] ?? "")).join(",") + "\r\n",
      )
      .join("")
  );
}
