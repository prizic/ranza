"use client";

import { useState, type Ref } from "react";
import { ChevronsUpDown } from "lucide-react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ranza/ui";

export interface PickerOption {
  value: string;
  label: string;
  /** Beside the label, quieter: an offset, a code. */
  detail?: string;
  /** Extra words a search matches, such as the code a label spells out. */
  keywords?: readonly string[];
}

/**
 * One choice from a list too long to scroll: hundreds of time zones and
 * currencies. Typing narrows it; the trigger names the choice in the reader's
 * language rather than as a code.
 *
 * The options are built only when the list opens — the time zone offsets and
 * currency names come from `Intl`, and building 400 of them on every render of
 * a form is work nobody asked for.
 */
export function SearchablePicker({
  buttonRef,
  disabled,
  empty,
  id,
  invalid,
  onChange,
  options,
  search,
  selectedLabel,
  value,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  empty: string;
  id: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  options: () => readonly PickerOption[];
  search: string;
  selectedLabel: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="w-full justify-between font-normal"
          disabled={disabled}
          id={id}
          ref={buttonRef}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
      >
        {open ? (
          // Opens on the current choice, highlighted and scrolled to, rather
          // than at the top of four hundred.
          <Command defaultValue={value}>
            <CommandInput placeholder={search} />
            <CommandList>
              <CommandEmpty>{empty}</CommandEmpty>
              {options().map((option) => (
                <CommandItem
                  data-checked={option.value === value}
                  key={option.value}
                  keywords={[option.label, ...(option.keywords ?? [])]}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  value={option.value}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  {option.detail ? (
                    <span className="shrink-0 text-step--1 text-muted-foreground tabular-nums">
                      {option.detail}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
