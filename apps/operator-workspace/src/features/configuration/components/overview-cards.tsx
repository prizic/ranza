import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { SettingsCard } from "./settings-card";

export interface SwitchedOn {
  segment: string;
  icon: LucideIcon;
  /** The screen, where the viewer may open it at this Property; null where not. */
  href: string | null;
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
      {/* Closed to begin with: nothing here can be switched, and the same list
          is the sidebar, eleven rows long on a phone (CONFIG-11). */}
      <details className="group">
        <summary className="cursor-pointer text-step--1 font-medium text-muted-foreground hover:text-foreground">
          {t("configuration.modulesCount", { count: screens.length })}
        </summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {screens.map(({ href, icon: Icon, segment }) => {
            const tile = (
              <>
                <Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
                <span className="text-step--1 font-medium">
                  {t(`navigation.${segment}`)}
                </span>
              </>
            );
            return (
              <li key={segment}>
                {href ? (
                  <Link
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    href={href}
                  >
                    {tile}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    {tile}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </SettingsCard>
  );
}

/**
 * Settings that have a screen of their own, and stay there so each has one
 * home: rooms and beds under Rooms, staff and roles under People.
 */
export function ElsewhereCard({
  peopleHref,
  roomsHref,
}: {
  peopleHref: string | null;
  roomsHref: string | null;
}) {
  const t = useTranslations();
  const links = [
    roomsHref
      ? {
          href: roomsHref,
          title: t("navigation.rooms"),
          hint: t("configuration.roomsHint"),
        }
      : null,
    peopleHref
      ? {
          href: peopleHref,
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
