import type { ComponentType, ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@ranza/ui";

/**
 * One section of the Configuration screen: what it is, why it matters, its
 * fields, and — when it can be changed — how to save it.
 *
 * `id` is the anchor the section list jumps to, and `scroll-mt` keeps the
 * heading clear of the sticky page bar when it lands there.
 */
export function SettingsCard({
  children,
  footer,
  hint,
  icon: Icon,
  id,
  title,
}: {
  children: ReactNode;
  footer?: ReactNode;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="scroll-mt-24" id={id}>
      <Card className="gap-0 py-0">
        <CardHeader className="flex items-start gap-4 border-b py-5">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          >
            <Icon className="size-5" />
          </span>
          <div className="grid gap-1">
            <CardTitle className="text-step-0 font-semibold" id={`${id}-title`}>
              {title}
            </CardTitle>
            <CardDescription className="max-w-prose text-step--1">
              {hint}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="py-6">{children}</CardContent>
        {footer ? (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 py-4">
            {footer}
          </CardFooter>
        ) : null}
      </Card>
    </section>
  );
}
