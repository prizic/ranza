"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from "@ranza/ui";
import type { Role, StaffMember } from "@ranza/staff";
import { PermissionMatrix } from "./permission-matrix";
import { RosterTable } from "./roster-table";

/**
 * Staff and permissions, as one card with two tabs.
 *
 * The shape the mockup asks for: who works here, and — behind the second tab —
 * what each role may do, as a grid of permissions against roles rather than a
 * list of roles with their permissions written out. The grid is the view that
 * answers "who can do this?", which is the question somebody opens this screen
 * with; a list of roles answers the other one.
 *
 * Client, because the tab is state and nothing about it belongs in the URL: a
 * link to this screen means the roster, and which tab somebody was last on is
 * not a thing to restore for them.
 */
export function StaffScreen({
  locale,
  organizationId,
  permissions,
  roles,
  roster,
}: {
  locale: string;
  organizationId: string;
  permissions: readonly string[];
  roles: readonly Role[];
  roster: readonly StaffMember[];
}) {
  const t = useTranslations();
  const [tab, setTab] = useState("people");

  // `flex-none` because the primitive's trigger is `flex-1`, which is right for
  // a segmented control and wrong for a tab strip: two tabs would each take
  // half the card and the labels would float in the middle of it.
  const tabClass =
    "flex-none rounded-none border-b-2 border-transparent px-5 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none";

  return (
    <Card className="overflow-hidden py-0">
      <Tabs className="gap-0" onValueChange={setTab} value={tab}>
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger className={tabClass} value="people">
            {t("staff.peopleTab")}
          </TabsTrigger>
          <TabsTrigger className={tabClass} value="roles">
            {t("staff.rolesTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="min-w-0" value="people">
          <RosterTable
            locale={locale}
            organizationId={organizationId}
            roles={roles.filter((role) => role.status === "active")}
            roster={roster}
          />
        </TabsContent>

        <TabsContent className="min-w-0" value="roles">
          <PermissionMatrix
            locale={locale}
            organizationId={organizationId}
            permissions={permissions}
            roles={roles}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
