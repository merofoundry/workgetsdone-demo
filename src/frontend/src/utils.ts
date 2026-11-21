import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
/** The one keyboard focus ring for links and buttons built from utilities. */
export const focusRing = 'focus-visible:ring-3 focus-visible:ring-brand-500/40 focus-visible:outline-hidden';
/** Joins class names and resolves conflicting Tailwind utilities (later wins). */
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
