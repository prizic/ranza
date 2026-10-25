"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@ranza/ui";
import { Banknote, Calendar, Palmtree, Users } from "lucide-react";
import type { HrViewData } from "../../../server/viewer";
import { EmployeesTable } from "./employees-table";
import { RotaTable } from "./rota-table";
import { LeaveTable } from "./leave-table";
import { PayrollCard } from "./payroll-card";

export type HrTab = "employees" | "rota" | "leave" | "payroll";

interface HrViewProps {
  data: HrViewData;
  locale: SupportedLocale;
  propertyId: string;
  /** The tab the address asks for, so a link opens where it points (HR-05). */
  initialTab: HrTab;
}

/**
 * The HR screen. The tab is in the address (`?tab=`), so a period or a week
 * reached by a link or an arrow opens on the tab it belongs to, and Back from
 * three months ago does not land on Employees (HR-05).
 */
export function HrView({ data, locale, propertyId, initialTab }: HrViewProps) {
  const t = useTranslations("hr");
  const [activeTab, setActiveTab] = useState<HrTab>(initialTab);

  function choose(next: string): void {
    setActiveTab(next as HrTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

  const employed = data.employees.filter(
    (employee) => employee.status === "active",
  );
  // The people who work at the Property being looked at, and whoever works for
  // the whole Organization: a rota or a leave form for anybody else is refused
  // (HR-12).
  const here = employed.filter(
    (employee) =>
      employee.propertyId === null || employee.propertyId === propertyId,
  );
  const pendingLeaveCount = data.leaveRequests.filter(
    (leave) => leave.status === "pending" && !leave.employeeTerminated,
  ).length;

  return (
    <div className="space-y-6">
      <div className="sr-only">
        <h2>{t("heading")}</h2>
      </div>

      <p className="text-step--1 text-muted-foreground">
        {t("peoplePointer")}{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-2"
          href={localizeHref(locale, `people?property=${propertyId}`)}
        >
          {t("peoplePointerLink")}
        </Link>
      </p>

      <Tabs value={activeTab} onValueChange={choose} className="space-y-4">
        {/* Scrolls rather than pushing the page sideways (HR-13), and below the
            small breakpoint drops the icons and tightens the padding so all four
            labels fit a 375 px phone, with a two-digit count and a pending
            badge, without Payroll hiding off the edge. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max border border-border bg-muted/60 p-1">
            <TabsTrigger
              value="employees"
              className="gap-2 text-step--1 max-sm:gap-1.5 max-sm:px-2"
            >
              <Users aria-hidden="true" className="size-4 max-sm:hidden" />
              <span>{t("tabs.employees")}</span>
              <span className="font-mono text-step--2 text-muted-foreground">
                ({employed.length})
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="rota"
              className="gap-2 text-step--1 max-sm:gap-1.5 max-sm:px-2"
            >
              <Calendar aria-hidden="true" className="size-4 max-sm:hidden" />
              <span>{t("tabs.rota")}</span>
            </TabsTrigger>

            <TabsTrigger
              value="leave"
              className="gap-2 text-step--1 max-sm:gap-1.5 max-sm:px-2"
            >
              <Palmtree aria-hidden="true" className="size-4 max-sm:hidden" />
              <span>{t("tabs.leave")}</span>
              {pendingLeaveCount > 0 && (
                <Badge
                  variant="destructive"
                  className="flex size-5 items-center justify-center rounded-full p-0 font-mono text-step--2 font-bold"
                >
                  {pendingLeaveCount}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger
              value="payroll"
              className="gap-2 text-step--1 max-sm:gap-1.5 max-sm:px-2"
            >
              <Banknote aria-hidden="true" className="size-4 max-sm:hidden" />
              <span>{t("tabs.payroll")}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="employees" className="space-y-4 pt-1">
          <EmployeesTable
            employees={data.employees}
            unregisteredStaff={data.unregisteredStaff}
            canManage={data.canManage}
            currency={data.currency}
            today={data.today}
            locale={locale}
            properties={data.properties}
            propertyId={propertyId}
          />
        </TabsContent>

        <TabsContent value="rota" className="space-y-4 pt-1">
          <RotaTable
            employees={here}
            hasAnyEmployee={employed.length > 0}
            shifts={data.shifts}
            canManage={data.canManage}
            locale={locale}
            propertyId={propertyId}
            today={data.today}
            week={data.week}
            onShowEmployees={() => choose("employees")}
          />
        </TabsContent>

        <TabsContent value="leave" className="space-y-4 pt-1">
          <LeaveTable
            employees={here}
            hasAnyEmployee={employed.length > 0}
            leaveRequests={data.leaveRequests}
            canManage={data.canManage}
            locale={locale}
            propertyId={propertyId}
            onShowEmployees={() => choose("employees")}
          />
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4 pt-1">
          <PayrollCard
            payroll={data.payroll}
            employees={data.employees}
            canManage={data.canManage}
            locale={locale}
            propertyId={propertyId}
            today={data.today}
            onShowEmployees={() => choose("employees")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
