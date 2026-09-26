import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { SettingsCard } from "./settings-card";

export interface SwitchedOn {
  segment: string;
  icon: LucideIcon;
}

/**
 * What this Property uses (CF-S3-08). Read-only, and only what is on: a
 * capability the Organization has not bought is not listed, the same way the
 * rail leaves it out rather than greying it (blueprint 4.6).
 */
export function SwitchedOnCard({
  screens,
}: {
  screens: readonly SwitchedOn[];
}) {
  const t = useTranslations();
  return (
    <SettingsCard
      hint={t("configuration.modulesHint")}
      icon={ToggleRight}
      id="modules"
      title={t("configuration.modulesTitle")}
    >
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {screens.map(({ icon: Icon, segment }) => (
          <li
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
            key={segment}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="text-step--1 font-medium">
              {t(`navigation.${segment}`)}
            </span>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

/**
 * Settings that have a screen of their own, and stay there so each has one
 * home: rooms and beds under Rooms, staff and roles under People.
 */
export function ElsewhereCard({
  locale,
  propertyId,
  showPeople,
  showRooms,
}: {
  locale: SupportedLocale;
  propertyId: string;
  showPeople: boolean;
  showRooms: boolean;
}) {
  const t = useTranslations();
  const links = [
    showRooms
      ? {
          href: `${localizeHref(locale, "rooms")}?property=${propertyId}`,
          title: t("navigation.rooms"),
          hint: t("configuration.roomsHint"),
        }
      : null,
    showPeople
      ? {
          href: localizeHref(locale, "people"),
          title: t("navigation.people"),
          hint: t("configuration.peopleHint"),
        }
      : null,
  ].filter((link) => link !== null);

  if (links.length === 0) return null;

  return (
    <SettingsCard
      hint={t("configuration.elsewhereHint")}
      icon={ExternalLink}
      id="elsewhere"
      title={t("configuration.elsewhereTitle")}
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              className="group flex h-full items-center justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
              href={link.href}
            >
              <span className="grid gap-1">
                <span className="text-step-0 font-medium">{link.title}</span>
                <span className="text-step--1 text-muted-foreground">
                  {link.hint}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
