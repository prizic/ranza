"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  formatDate,
  formatMoney,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { KeyRound, Search } from "lucide-react";
import type { UnregisteredStaffMember } from "../../../lib/unregistered-staff";
import type { EmployeeRecord } from "../../../server/viewer";
import { EditEmployeeDialog } from "./edit-employee-dialog";
import { RegisterEmployeeDialog } from "./register-employee-dialog";
import { TerminateEmployeeDialog } from "./terminate-employee-dialog";

interface EmployeesTableProps {
  employees: readonly EmployeeRecord[];
  /** Logins with no employment record, offered for registration (HR-S1-49). */
  unregisteredStaff: readonly UnregisteredStaffMember[];
  canManage: boolean;
  /** The Property's currency, which a new employee is paid in. */
  currency: string;
  /** The Property's own calendar date, `YYYY-MM-DD`. */
  today: string;
  locale: SupportedLocale;
  /** The Properties of this Organization, for naming where somebody works. */
  properties: readonly { propertyId: string; propertyName: string }[];
  propertyId: string;
}

const ALL = "all";

/**
 * Who is employed, as a table that can be searched and filtered.
 *
 * Cards in a grid did not scale past a few dozen people, mixed leavers in with
 * the staff and counted one set while showing another (HR-11). People who left
 * are kept — their record, shifts and payslips stay — and are shown on request
 * rather than ahead of the people who work here.
 */
export function EmployeesTable({
  employees,
  unregisteredStaff,
  canManage,
  currency,
  today,
  locale,
  properties,
  propertyId,
}: EmployeesTableProps) {
  const t = useTranslations("hr.employees");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [showLeft, setShowLeft] = useState(false);

  const propertyName = (id: string | null): string =>
    id === null
      ? t("wholeOrganization")
      : (properties.find((property) => property.propertyId === id)
          ?.propertyName ?? t("anotherProperty"));
  const here = properties.find(
    (property) => property.propertyId === propertyId,
  );

  const registerDialog = (
    <RegisterEmployeeDialog
      currency={currency}
      locale={locale}
      propertyId={propertyId}
      propertyName={here?.propertyName ?? ""}
      today={today}
    />
  );

  const formatDay = (date: Date) =>
    formatDate(new Date(date), locale, { timeZone: "UTC" });

  const departments = [
    ...new Set(employees.map((employee) => employee.department)),
  ].sort((a, b) => a.localeCompare(b, locale));
  const employed = employees.filter((employee) => employee.status === "active");
  const leftCount = employees.length - employed.length;
  const needle = query.trim().toLowerCase();
  const visible = employees.filter((employee) => {
    if (employee.status === "terminated" && !showLeft) return false;
    if (department !== ALL && employee.department !== department) return false;
    return (
      needle === "" ||
      [
        employee.fullName,
        employee.position,
        employee.department,
        employee.email ?? "",
      ].some((text) => text.toLowerCase().includes(needle))
    );
  });
  const filtered = needle !== "" || department !== ALL;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-step-1 font-semibold tracking-tight text-foreground">
            {t("title")}
          </h2>
          <p className="text-step--1 text-muted-foreground">
            {t("counts", { employed: employed.length, left: leftCount })}
          </p>
        </div>
        {canManage && employees.length > 0 && registerDialog}
      </div>

      {canManage && unregisteredStaff.length > 0 ? (
        <Card data-unregistered-staff className="border-border">
          <CardHeader className="space-y-1 p-4 pb-2">
            <CardTitle className="text-step-0 font-semibold text-foreground">
              {t("unregisteredTitle")}
            </CardTitle>
            <p className="text-step--1 text-muted-foreground">
              {t("unregisteredDescription")}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {unregisteredStaff.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="min-w-0 truncate text-step--1 text-foreground">
                    {member.email}
                  </span>
                  <RegisterEmployeeDialog
                    currency={currency}
                    locale={locale}
                    prefill={member}
                    propertyId={propertyId}
                    propertyName={here?.propertyName ?? ""}
                    today={today}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {employees.length === 0 ? (
        <EmptyState
          title={t("noEmployeesTitle")}
          description={
            canManage ? t("noEmployeesDescription") : t("noEmployeesReadOnly")
          }
          action={canManage ? registerDialog : undefined}
        />
      ) : (
        <Card className="border-border">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative w-full max-w-xs">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("search")}
                className="ps-9"
                data-testid="employee-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search")}
                type="search"
                value={query}
              />
            </div>
            <Select onValueChange={setDepartment} value={department}>
              <SelectTrigger
                aria-label={t("filterDepartment")}
                className="w-48"
                data-testid="employee-department"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allDepartments")}</SelectItem>
                {departments.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {leftCount > 0 ? (
              <label className="flex items-center gap-2 text-step--1">
                <input
                  checked={showLeft}
                  data-testid="show-left"
                  onChange={(event) => setShowLeft(event.target.checked)}
                  type="checkbox"
                />
                {t("showLeft", { count: leftCount })}
              </label>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p
                className="text-step--1 text-muted-foreground"
                data-testid="employees-no-match"
              >
                {filtered ? t("noMatch") : t("allLeft")}
              </p>
              <Button
                onClick={() => {
                  setQuery("");
                  setDepartment(ALL);
                  setShowLeft(true);
                }}
                type="button"
                variant="outline"
              >
                {t("showAll")}
              </Button>
            </div>
          ) : (
            <Table aria-label={t("title")} className="max-md:block">
              <TableHeader className="max-md:sr-only">
                <TableRow>
                  <TableHead scope="col">{t("person")}</TableHead>
                  <TableHead scope="col">{t("department")}</TableHead>
                  <TableHead scope="col">{t("property")}</TableHead>
                  <TableHead scope="col">{t("contract")}</TableHead>
                  <TableHead scope="col">{t("since")}</TableHead>
                  <TableHead className="text-end" scope="col">
                    {t("grossPay")}
                  </TableHead>
                  <TableHead scope="col">{t("status")}</TableHead>
                  {canManage ? (
                    <TableHead className="text-end" scope="col">
                      <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody className="max-md:block">
                {visible.map((employee) => {
                  const initials =
                    `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
                  const left = employee.status === "terminated";
                  const upcoming = employee.wageChanges.find(
                    (change) => change.effectiveFrom > today.slice(0, 7),
                  );
                  return (
                    <TableRow
                      className="max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:p-4"
                      data-employee={employee.fullName}
                      key={employee.id}
                    >
                      <TableCell className="max-md:col-span-2 max-md:p-0">
                        <span className="flex items-center gap-3">
                          <Avatar className="size-9 border border-border">
                            <AvatarFallback className="bg-primary/10 text-step--1 font-semibold text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium text-foreground">
                              {employee.fullName}
                            </span>
                            <span className="truncate text-step--1 text-muted-foreground">
                              {employee.position}
                            </span>
                            {employee.userId ? (
                              <Link
                                className="flex w-fit items-center gap-1 text-step--2 text-muted-foreground underline-offset-2 hover:underline"
                                href={localizeHref(
                                  locale,
                                  `people?property=${propertyId}`,
                                )}
                              >
                                <KeyRound
                                  aria-hidden="true"
                                  className="size-3"
                                />
                                {t("hasLogin")}
                              </Link>
                            ) : null}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="max-md:p-0">
                        {employee.department}
                      </TableCell>
                      <TableCell className="max-md:p-0">
                        {propertyName(employee.propertyId)}
                      </TableCell>
                      <TableCell className="max-md:p-0">
                        {t(`contracts.${employee.contractType}`)}
                      </TableCell>
                      <TableCell className="max-md:p-0">
                        {formatDay(employee.hiredOn)}
                      </TableCell>
                      <TableCell className="text-end font-semibold max-md:p-0 max-md:text-start">
                        {formatMoney(
                          employee.grossPayMinor,
                          employee.currency,
                          locale,
                        )}
                        {upcoming ? (
                          <span className="block text-step--2 font-normal text-muted-foreground">
                            {t("raiseFrom", {
                              amount: formatMoney(
                                upcoming.grossPayMinor,
                                employee.currency,
                                locale,
                              ),
                              month: formatDate(
                                new Date(
                                  `${upcoming.effectiveFrom}-01T00:00:00Z`,
                                ),
                                locale,
                                { day: undefined, timeZone: "UTC" },
                              ),
                            })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-md:p-0">
                        <Badge variant={left ? "secondary" : "default"}>
                          {t(`statuses.${employee.status}`)}
                        </Badge>
                        {left && employee.terminatedOn ? (
                          <span className="mt-1 block text-step--2 text-muted-foreground">
                            {t("leftOn", {
                              date: formatDay(employee.terminatedOn),
                            })}
                          </span>
                        ) : null}
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-end max-md:col-span-2 max-md:p-0">
                          {left ? null : (
                            <span className="flex items-center justify-end gap-1">
                              <EditEmployeeDialog
                                employee={employee}
                                locale={locale}
                                propertyId={propertyId}
                                today={today}
                              />
                              <TerminateEmployeeDialog
                                employeeId={employee.id}
                                employeeName={employee.fullName}
                                hiredOn={employee.hiredOn}
                                locale={locale}
                                propertyId={propertyId}
                                today={today}
                              />
                            </span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
