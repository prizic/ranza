"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "./ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { selectTriggerClassName } from "./ui/select";
import { fieldMatches } from "../lib/search";
import { cn } from "../lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second, quieter line under the label. Searched along with it. */
  description?: string;
  /** Terms that find this option without being shown. */
  keywords?: readonly string[];
  /** A heading to list the option under. Groups keep first-seen order. */
  group?: string;
  disabled?: boolean;
}

/** Every string a picker shows, because there is no fallback locale. */
export interface ComboboxLabels {
  /** The trigger's text while nothing is chosen. */
  placeholder: string;
  /** The search box's placeholder, and its accessible name. */
  search: string;
  noMatches: string;
}

export interface MultiComboboxLabels extends ComboboxLabels {
  clear: string;
  /** The trigger's text once too many are chosen to name them all. */
  selected: (count: number) => string;
}

interface PickerProps {
  options: readonly ComboboxOption[];
  /** Submitted under this name, so the picker drops into a plain form. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  /** The trigger's id, for a `<Label htmlFor>`. */
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export interface ComboboxProps extends PickerProps {
  labels: ComboboxLabels;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export interface MultiComboboxProps extends PickerProps {
  labels: MultiComboboxLabels;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
}

/** Above this many, the multi-picker's trigger counts instead of naming. */
const NAME_LIMIT = 2;

/**
 * A single choice from a list too long to scan: a Select you can type into.
 *
 * Use it where the options are data — Units, Properties, roles an Organization
 * writes, audit actions — and keep `Select` for a short fixed enum, where a
 * search box is one more thing to look past.
 */
export function Combobox({
  labels,
  value,
  defaultValue,
  onValueChange,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [chosen, choose] = useControllable(
    value,
    defaultValue ?? "",
    onValueChange,
  );
  const current = props.options.find((option) => option.value === chosen);

  return (
    <Picker
      {...props}
      filled={chosen !== ""}
      highlighted={chosen}
      isChosen={(option) => option.value === chosen}
      labels={labels}
      onOpenChange={setOpen}
      onPick={(option) => {
        // Picking what is already chosen changes nothing, and must not say it
        // did: an owner that saves on change would write a record of it.
        if (option.value !== chosen) choose(option.value);
        setOpen(false);
      }}
      open={open}
      submitted={chosen === "" ? [] : [chosen]}
    >
      <span className="truncate">{current?.label ?? labels.placeholder}</span>
    </Picker>
  );
}

/**
 * Any number of choices from a long list. The list stays open while choosing,
 * and the trigger names what is chosen until that would outgrow it.
 */
export function MultiCombobox({
  labels,
  value,
  defaultValue,
  onValueChange,
  ...props
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [chosen, choose] = useControllable<readonly string[]>(
    value,
    defaultValue ?? [],
    onValueChange ? (next) => onValueChange([...next]) : undefined,
  );
  const picked = new Set(chosen);
  const named = props.options.filter((option) => picked.has(option.value));

  return (
    <Picker
      {...props}
      filled={chosen.length > 0}
      footer={
        chosen.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup>
              {/* Hidden while searching, so Enter on a search that matches
                  nothing cannot land on it and wipe the selection. */}
              <CommandItem
                className="justify-center text-center"
                onSelect={() => choose([])}
              >
                {labels.clear}
              </CommandItem>
            </CommandGroup>
          </>
        ) : null
      }
      isChosen={(option) => picked.has(option.value)}
      labels={labels}
      multiple
      onOpenChange={setOpen}
      onPick={(option) =>
        choose(
          picked.has(option.value)
            ? chosen.filter((held) => held !== option.value)
            : [...chosen, option.value],
        )
      }
      open={open}
      submitted={chosen}
    >
      {chosen.length === 0 ? (
        <span className="truncate">{labels.placeholder}</span>
      ) : chosen.length <= NAME_LIMIT && named.length === chosen.length ? (
        <span className="flex min-w-0 gap-1">
          {named.map((option) => (
            <Badge
              className="max-w-40 min-w-0 rounded-sm px-1.5 font-normal"
              key={option.value}
              variant="secondary"
            >
              <span className="truncate">{option.label}</span>
            </Badge>
          ))}
        </span>
      ) : (
        <Badge className="rounded-sm px-1.5 font-normal" variant="secondary">
          {labels.selected(chosen.length)}
        </Badge>
      )}
    </Picker>
  );
}

/**
 * The trigger, the searchable list and the form inputs both pickers share.
 * What differs — how a pick changes the value, and what the trigger shows —
 * is passed in.
 */
function Picker({
  children,
  className,
  disabled,
  filled,
  footer,
  highlighted,
  id,
  isChosen,
  labels,
  multiple = false,
  name,
  onOpenChange,
  onPick,
  open,
  options,
  required,
  submitted,
  ...aria
}: PickerProps & {
  children: ReactNode;
  filled: boolean;
  footer?: ReactNode;
  /** The option the keyboard starts on when the list opens. */
  highlighted?: string;
  isChosen: (option: ComboboxOption) => boolean;
  labels: ComboboxLabels;
  multiple?: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (option: ComboboxOption) => void;
  open: boolean;
  submitted: readonly string[];
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  // Set by the browser refusing an empty required submission, and over as soon
  // as something is chosen.
  const [refused, setRefused] = useState(false);
  const invalid = aria["aria-invalid"] || (refused && submitted.length === 0);

  const triggerButton = (
    <PopoverTrigger asChild>
      <button
        {...aria}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        className={cn(selectTriggerClassName, "w-full min-w-0", className)}
        data-placeholder={filled ? undefined : ""}
        data-size="default"
        disabled={disabled}
        id={id}
        ref={setTrigger}
        role="combobox"
        type="button"
      >
        {children}
        <ChevronsUpDown className="text-muted-foreground" />
      </button>
    </PopoverTrigger>
  );

  return (
    // Modal, so the list scrolls inside a Dialog: a Dialog's scroll lock
    // swallows the wheel over anything portalled outside it, which a
    // non-modal popover is.
    <Popover modal onOpenChange={onOpenChange} open={open}>
      {required ? (
        // Hidden inputs are exempt from constraint validation, so `required`
        // needs a real one. It carries no name — the hidden ones submit — and
        // sits under the trigger's bottom edge, the way Radix places its native
        // select, so the browser's message points at the field rather than
        // over its label. When the form is refused, focus moves on to the
        // trigger, which is marked invalid; the message stays up.
        <span className="relative grid min-w-0">
          {triggerButton}
          <input
            aria-hidden="true"
            className="pointer-events-none absolute start-1/2 bottom-0 size-px opacity-0"
            onChange={keepValue}
            onFocus={() => trigger?.focus()}
            onInvalid={() => setRefused(true)}
            required
            tabIndex={-1}
            value={submitted.length > 0 ? "chosen" : ""}
          />
        </span>
      ) : (
        triggerButton
      )}

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
      >
        <Command
          filter={matches}
          {...(highlighted ? { defaultValue: highlighted } : {})}
        >
          <CommandInput
            aria-label={labels.search}
            placeholder={labels.search}
          />
          <CommandList>
            <CommandEmpty>{labels.noMatches}</CommandEmpty>
            {groupsOf(options).map(([heading, grouped], index) => (
              <div key={heading ?? ""}>
                {index > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={heading}>
                  {grouped.map((option) => {
                    const chosen = isChosen(option);
                    return (
                      <CommandItem
                        // aria-selected is cmdk's keyboard cursor, so the
                        // choice is announced as checked instead.
                        aria-checked={chosen}
                        data-checked={!multiple && chosen}
                        disabled={option.disabled ?? false}
                        key={option.value}
                        keywords={searchTermsOf(option)}
                        onSelect={() => onPick(option)}
                        value={option.value}
                      >
                        {multiple ? (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-4 items-center justify-center rounded-sm border border-primary",
                              chosen
                                ? "bg-primary text-primary-foreground"
                                : "opacity-50 [&_svg]:invisible",
                            )}
                          >
                            <Check className="size-3" />
                          </span>
                        ) : null}
                        {/* Wrapped, not truncated: this is where the whole
                            name has to be readable to be chosen. */}
                        <span className="flex min-w-0 flex-col break-words">
                          <span>{option.label}</span>
                          {option.description ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ))}
            {footer}
          </CommandList>
        </Command>
      </PopoverContent>

      {name
        ? submitted.map((value) => (
            <input key={value} name={name} type="hidden" value={value} />
          ))
        : null}
    </Popover>
  );
}

/**
 * cmdk's own filter folds case the invariant way and scores fuzzily. Matching
 * goes through `fieldMatches` instead, like every other search in the product,
 * so "İSTANBUL" finds "istanbul" and ١٠١ finds Unit 101. The item's value is an
 * id and is deliberately not searched.
 */
function matches(_value: string, search: string, terms?: string[]): number {
  return fieldMatches((terms ?? []).join("\n"), search) ? 1 : 0;
}

function searchTermsOf(option: ComboboxOption): string[] {
  return [
    option.label,
    ...(option.description ? [option.description] : []),
    ...(option.keywords ?? []),
  ];
}

function groupsOf(
  options: readonly ComboboxOption[],
): [string | undefined, ComboboxOption[]][] {
  const groups = new Map<string | undefined, ComboboxOption[]>();
  for (const option of options) {
    const members = groups.get(option.group) ?? [];
    members.push(option);
    groups.set(option.group, members);
  }
  return [...groups];
}

/** The proxy input's value is derived; typing into it is not possible. */
function keepValue(): void {}

function useControllable<T>(
  value: T | undefined,
  initial: T,
  onChange: ((next: T) => void) | undefined,
): [T, (next: T) => void] {
  const [held, setHeld] = useState(initial);
  const current = value === undefined ? held : value;
  return [
    current,
    (next) => {
      if (value === undefined) setHeld(next);
      onChange?.(next);
    },
  ];
}
