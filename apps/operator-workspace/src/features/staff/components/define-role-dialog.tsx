"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  ArrowButton,
  Button,
  CancelButton,
  ChoiceGroup,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogSection,
  DialogTrigger,
  FormError,
  Input,
  dialogFrameClassName,
  fieldClassName,
} from "@ranza/ui";
import type { Role } from "@ranza/staff";
import { defineRole, type StaffOutcome } from "../../../server/staff";
import {
  PERMISSION_SECTIONS,
  permissionMessageKey,
  shippedRoleOf,
} from "../labels";

/**
 * Composing a role.
 *
 * The list of permissions offered is every one the catalogue has, not the ones
 * this author may grant. What they may grant is the policy's answer, and
 * filtering here would be a second copy of it that goes stale between the page
 * rendering and the form being submitted — which is the window the rule exists
 * to have none of.
 */
export function DefineRoleDialog({
  locale,
  organizationId,
  roles,
}: {
  locale: string;
  organizationId: string;
  /** What a new role can start from: every role there is, active or not. */
  roles: readonly Role[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [ticked, setTicked] = useState<readonly string[]>([]);
  const [outcome, act, pending] = useActionState<StaffOutcome, FormData>(
    defineRole,
    "idle",
  );

  // Closes on success, unlike the invitation dialog: the role appears on the
  // grid behind it, which is the answer. An invitation has a token that only
  // exists in that one moment and closing would throw it away.
  useEffect(() => {
    if (outcome === "done") {
      setOpen(false);
      reset();
    }
  }, [outcome]);

  function reset(): void {
    setName("");
    setSource("");
    setTicked([]);
  }

  const total = PERMISSION_SECTIONS.reduce(
    (sum, section) => sum + section.permissions.length,
    0,
  );

  function roleName(role: Role): string {
    const shipped = shippedRoleOf(role);
    return shipped ? t(`staff.roles.${shipped}`) : role.name;
  }

  function startFrom(value: string): void {
    setSource(value);
    const template = roles.find(
      (role) => `${role.organizationId ?? ""}:${role.key}` === value,
    );
    if (template) setTicked(template.permissions);
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus aria-hidden="true" className="size-4" />
          {t("staff.defineRole")}
        </Button>
      </DialogTrigger>
      <DialogContent className={dialogFrameClassName("medium")}>
        <form action={act} className="grid">
          <DialogMasthead
            art="/illustrations/dialogs/role.svg"
            eyebrow={t("staff.defineRole")}
            heading={t("staff.defineRoleTitle")}
            large
          />
          <DialogBody>
            <DialogDescription className="sr-only">
              {t("staff.defineRoleDescription")}
            </DialogDescription>
            <input name="locale" type="hidden" value={locale} />
            <input name="organization" type="hidden" value={organizationId} />

            <DialogSection
              labelFor="role-name"
              tag={{ label: t("dialogTagRequired"), required: true }}
              title={t("staff.roleName")}
            >
              <Input
                required
                className={fieldClassName}
                id="role-name"
                maxLength={80}
                name="name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </DialogSection>

            <DialogSection
              tag={{ label: t("dialogTagOptional"), required: false }}
              title={t("staff.startFrom")}
              titleId="role-start-from"
            >
              <ChoiceGroup
                labelledBy="role-start-from"
                name="startFrom"
                onChange={startFrom}
                options={roles.map((role) => ({
                  label: roleName(role),
                  value: `${role.organizationId ?? ""}:${role.key}`,
                }))}
                value={source}
              />
            </DialogSection>

            {PERMISSION_SECTIONS.map((section) => (
              <DialogSection
                key={section.key}
                title={t(`staff.sections.${section.key}`)}
              >
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="sr-only">{t("staff.mayDo")}</legend>
                  {section.permissions.map((permission) => (
                    <label
                      className="flex items-center gap-3 text-sm"
                      key={permission}
                    >
                      <input
                        checked={ticked.includes(permission)}
                        className="size-4.5 accent-primary"
                        name="permissions"
                        onChange={(event) =>
                          setTicked(
                            event.target.checked
                              ? [...ticked, permission]
                              : ticked.filter((key) => key !== permission),
                          )
                        }
                        type="checkbox"
                        value={permission}
                      />
                      {t(
                        `staff.permissions.${permissionMessageKey(permission)}`,
                      )}
                    </label>
                  ))}
                </fieldset>
              </DialogSection>
            ))}

            {outcome === "refused" ? (
              <div aria-live="polite" className="py-5">
                <FormError>{t("staff.refused")}</FormError>
              </div>
            ) : null}
          </DialogBody>

          <DialogActions
            hint={
              name.trim() === ""
                ? t("staff.defineRoleHintName")
                : ticked.length === 0
                  ? t("staff.defineRoleNothingTicked", { total })
                  : t("staff.defineRoleTicked", {
                      count: ticked.length,
                      total,
                    })
            }
          >
            <DialogClose asChild>
              <CancelButton type="button">{t("staff.cancel")}</CancelButton>
            </DialogClose>
            <ArrowButton disabled={pending || name.trim() === ""} type="submit">
              {t("staff.saveRole")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
