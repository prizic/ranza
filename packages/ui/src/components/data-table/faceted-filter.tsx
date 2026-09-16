"use client";

import type { ComponentType } from "react";
import type { Column } from "@tanstack/react-table";
import { Check, PlusCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import { cn } from "../../lib/utils";

export interface FacetOption {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}

/** Above this many, the trigger counts instead of naming. */
const NAME_LIMIT = 3;

export function DataTableFacetedFilter<TData, TValue>({
  column,
  labels,
  options,
  title,
}: {
  /** Undefined when the named column is not in this table. */
  column: Column<TData, TValue> | undefined;
  labels: { clear: string; noResults: string; selected: (n: number) => string };
  options: readonly FacetOption[];
  title: string;
}) {
  const facets = column?.getFacetedUniqueValues();
  const selected = new Set(column?.getFilterValue() as string[] | undefined);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-9 border-dashed" size="sm" variant="outline">
          <PlusCircle className="size-4" />
          {title}
          {selected.size > 0 ? (
            <>
              <Separator className="mx-1 h-4" orientation="vertical" />
              {/* A count only says how many, which is no use while the names
                  still fit: name the picked values until the button would grow
                  wider than the toolbar. */}
              {selected.size < NAME_LIMIT ? (
                options
                  .filter((option) => selected.has(option.value))
                  .map((option) => (
                    <Badge
                      className="rounded-sm px-1 font-normal"
                      key={option.value}
                      variant="secondary"
                    >
                      {option.label}
                    </Badge>
                  ))
              ) : (
                <Badge
                  className="rounded-sm px-1 font-normal"
                  variant="secondary"
                >
                  {labels.selected(selected.size)}
                </Badge>
              )}
            </>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>{labels.noResults}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) selected.delete(option.value);
                      else selected.add(option.value);
                      const values = Array.from(selected);
                      column?.setFilterValue(
                        values.length > 0 ? values : undefined,
                      );
                    }}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    {option.icon ? (
                      <option.icon className="size-4 text-muted-foreground" />
                    ) : null}
                    <span>{option.label}</span>
                    {facets?.get(option.value) != null ? (
                      <span className="ms-auto text-xs tabular-nums">
                        {facets.get(option.value)}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className="justify-center text-center"
                    onSelect={() => column?.setFilterValue(undefined)}
                  >
                    {labels.clear}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
