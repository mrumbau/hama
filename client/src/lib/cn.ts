/**
 * Tiny clsx wrapper. Imported as `cn(...)` everywhere so the call site
 * stays compact and the import path is consistent.
 */
import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
