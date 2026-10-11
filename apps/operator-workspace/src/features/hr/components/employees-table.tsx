"use client";

import { useTranslations } from "next-intl";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@ranza/ui";
import { Banknote, Briefcase, Calendar } from "lucide-react";
import type { UnregisteredStaffMember } from "../../../lib/unregistered-staff";
import type { EmployeeRecord } from "../../../server/viewer";
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
  propertyId: string;
}

export function EmployeesTable({
  employees,
  unregisteredStaff,
  canManage,
  currency,
  today,
  locale,
  propertyId,
}: EmployeesTableProps) {
  const t = useTranslations("hr.employees");

  const registerDialog = (
    <RegisterEmployeeDialog
      currency={currency}
      locale={locale}
      propertyId={propertyId}
    />
  );

  const formatMonth = (date: Date) =>
    formatDate(new Date(date), locale, {
      day: undefined,
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-step-1 font-semibold tracking-tight text-foreground">
            {t("title")}
          </h2>
        </div>
        {canManage && employees.length > 0 && registerDialog}
      </div>

      {canManage && unregisteredStaff.length > 0 ? (
        <Card data-unregistered-staff className="border-border">
          <CardHeader className="p-4 pb-2 space-y-1">
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
          description={t("noEmployeesDescription")}
          action={canManage ? registerDialog : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((employee) => {
            const initials =
              `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
            const left = employee.status === "terminated";

            return (
              <Card
                key={employee.id}
                data-employee={employee.fullName}
                className="border-border hover:border-primary/40 transition-colors"
              >
                <CardHeader className="p-4 pb-3 flex flex-row items-center gap-3 space-y-0">
                  <Avatar className="size-12 border border-border">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-step-0">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-step-0 font-semibold text-foreground truncate">
                      {employee.fullName}
                    </CardTitle>
                    <p className="text-step--1 text-muted-foreground truncate">
                      {employee.position}
                    </p>
                  </div>
                  <Badge variant={left ? "secondary" : "default"}>
                    {t(`statuses.${employee.status}`)}
                  </Badge>
                </CardHeader>
                <CardContent className="p-4 pt-1 space-y-2 text-step--1 border-t border-border/60">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="size-3.5" />
                      <span>{t("department")}</span>
                    </span>
                    <span className="font-medium text-foreground">
                      {employee.department}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{t("contract")}</span>
                    <span className="font-medium text-foreground">
                      {t(`contracts.${employee.contractType}`)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      <span>{t("since")}</span>
                    </span>
                    <span className="font-medium text-foreground">
                      {formatMonth(employee.hiredOn)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-dashed border-border/60">
                    <span className="flex items-center gap-1.5">
                      <Banknote className="size-3.5" />
                      <span>{t("grossPay")}</span>
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatMoney(
                        employee.grossPayMinor,
                        employee.currency,
                        locale,
                      )}
                    </span>
                  </div>

                  {left && employee.terminatedOn ? (
                    <p className="pt-1 text-muted-foreground">
                      {t("leftOn", {
                        date: formatDate(
                          new Date(employee.terminatedOn),
                          locale,
                          { timeZone: "UTC" },
                        ),
                      })}
                    </p>
                  ) : canManage ? (
                    <div className="pt-1 flex justify-end">
                      <TerminateEmployeeDialog
                        employeeId={employee.id}
                        employeeName={employee.fullName}
                        hiredOn={employee.hiredOn}
                        locale={locale}
                        propertyId={propertyId}
                        today={today}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
