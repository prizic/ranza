"use client";

import type { ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface RowAction {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Renders in the destructive colour and sits below a separator. */
  destructive?: boolean;
}

/**
 * The per-row menu. A row grows actions over time — edit, then duplicate, then
 * cancel — and a strip of icons costs a column of width for each one, so they
 * all live behind the same button.
 */
export function DataTableRowActions({
  actions,
  label,
}: {
  actions: readonly RowAction[];
  /** Accessible name for the trigger. Localized by the caller. */
  label: string;
}) {
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="size-8 text-muted-foreground data-[state=open]:bg-muted"
          size="icon"
          variant="ghost"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {safe.map((action) => (
          <DropdownMenuItem key={action.label} onSelect={action.onSelect}>
            <action.icon className="size-4" />
            {action.label}
          </DropdownMenuItem>
        ))}
        {destructive.length > 0 && safe.length > 0 ? (
          <DropdownMenuSeparator />
        ) : null}
        {destructive.map((action) => (
          <DropdownMenuItem
            key={action.label}
            onSelect={action.onSelect}
            variant="destructive"
          >
            <action.icon className="size-4" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
