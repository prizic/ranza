"use client";

import { useTranslations } from "next-intl";
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
import { Briefcase, Calendar, DollarSign } from "lucide-react";
import type { EmployeeRecord } from "../../../server/viewer";
import { RegisterEmployeeDialog } from "./register-employee-dialog";

interface EmployeesTableProps {
  employees: readonly EmployeeRecord[];
  canManage: boolean;
  locale: string;
  propertyId: string;
}

export function EmployeesTable({
  employees,
  canManage,
  locale,
  propertyId,
}: EmployeesTableProps) {
  const t = useTranslations("hr.employees");

  const formatMoney = (amount: number, currency: string = "TRY") => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(date));
  };

  const contractLabel = (type: string) => {
    const map: Record<string, string> = {
      full_time: t("contracts.full_time"),
      part_time: t("contracts.part_time"),
      seasonal: t("contracts.seasonal"),
      fixed_term: t("contracts.fixed_term"),
    };
    return map[type] || type;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-step-1 font-semibold tracking-tight text-foreground">
            {t("title")}
          </h2>
        </div>
        {canManage && (
          <RegisterEmployeeDialog locale={locale} propertyId={propertyId} />
        )}
      </div>

      {employees.length === 0 ? (
        <EmptyState
          title={t("noEmployeesTitle")}
          description={t("noEmployeesDescription")}
          action={
            canManage ? (
              <RegisterEmployeeDialog locale={locale} propertyId={propertyId} />
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((e) => {
            const initials =
              `${e.firstName.charAt(0)}${e.lastName.charAt(0)}`.toUpperCase();

            return (
              <Card
                key={e.id}
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
                      {e.fullName}
                    </CardTitle>
                    <p className="text-step--1 text-muted-foreground truncate">
                      {e.position}
                    </p>
                  </div>
                  <Badge
                    variant={e.status === "active" ? "default" : "secondary"}
                  >
                    {e.status}
                  </Badge>
                </CardHeader>
                <CardContent className="p-4 pt-1 space-y-2 text-step--1 border-t border-border/60">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="size-3.5" />
                      <span>{t("department")}</span>
                    </span>
                    <span className="font-medium text-foreground">
                      {e.department}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{t("contract")}</span>
                    <span className="font-medium text-foreground">
                      {contractLabel(e.contractType)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      <span>{t("since")}</span>
                    </span>
                    <span className="font-medium text-foreground">
                      {formatDate(e.hiredOn)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-dashed border-border/60">
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="size-3.5" />
                      <span>{t("grossPay")}</span>
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatMoney(e.grossPay, e.currency)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
