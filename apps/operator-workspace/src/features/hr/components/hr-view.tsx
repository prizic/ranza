"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@ranza/ui";
import { Calendar, DollarSign, Palmtree, Users } from "lucide-react";
import type { HrViewData } from "../../../server/viewer";
import { EmployeesTable } from "./employees-table";
import { RotaTable } from "./rota-table";
import { LeaveTable } from "./leave-table";
import { PayrollCard } from "./payroll-card";

interface HrViewProps {
  data: HrViewData;
  locale: string;
  propertyId: string;
}

export function HrView({ data, locale, propertyId }: HrViewProps) {
  const t = useTranslations("hr");
  const [activeTab, setActiveTab] = useState("employees");

  const pendingLeaveCount = data.leaveRequests.filter(
    (l) => l.status === "pending",
  ).length;

  return (
    <div className="space-y-6">
      <div className="sr-only">
        <h2>{t("heading")}</h2>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="bg-muted/60 p-1 border border-border">
          <TabsTrigger value="employees" className="gap-2 text-step--1">
            <Users className="size-4" />
            <span>{t("tabs.employees")}</span>
            <span className="text-step--2 text-muted-foreground font-mono">
              ({data.employees.length})
            </span>
          </TabsTrigger>

          <TabsTrigger value="rota" className="gap-2 text-step--1">
            <Calendar className="size-4" />
            <span>{t("tabs.rota")}</span>
          </TabsTrigger>

          <TabsTrigger value="leave" className="gap-2 text-step--1">
            <Palmtree className="size-4" />
            <span>{t("tabs.leave")}</span>
            {pendingLeaveCount > 0 && (
              <Badge
                variant="destructive"
                className="size-5 p-0 flex items-center justify-center text-step--2 rounded-full font-bold font-mono"
              >
                {pendingLeaveCount}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="payroll" className="gap-2 text-step--1">
            <DollarSign className="size-4" />
            <span>{t("tabs.payroll")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4 pt-1">
          <EmployeesTable
            employees={data.employees}
            canManage={data.canManage}
            locale={locale}
            propertyId={propertyId}
          />
        </TabsContent>

        <TabsContent value="rota" className="space-y-4 pt-1">
          <RotaTable
            employees={data.employees}
            shifts={data.shifts}
            canManage={data.canManage}
            locale={locale}
            propertyId={propertyId}
          />
        </TabsContent>

        <TabsContent value="leave" className="space-y-4 pt-1">
          <LeaveTable
            employees={data.employees}
            leaveRequests={data.leaveRequests}
            canManage={data.canManage}
            locale={locale}
            propertyId={propertyId}
          />
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4 pt-1">
          <PayrollCard
            payroll={data.payroll}
            canManage={data.canManage}
            locale={locale}
            propertyId={propertyId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
