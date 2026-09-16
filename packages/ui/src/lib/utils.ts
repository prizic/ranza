import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names, letting a caller's Tailwind class beat a component's. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
