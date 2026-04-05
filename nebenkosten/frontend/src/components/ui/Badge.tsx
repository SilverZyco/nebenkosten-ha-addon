import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  blue:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  green:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  yellow: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  gray:   "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  brand:  "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300",
} as const;

const SIZE_CLASSES = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-xs px-2.5 py-1",
} as const;

interface BadgeProps {
  variant: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
  children: React.ReactNode;
  className?: string;
}

export default function Badge({
  variant,
  size = "md",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full whitespace-nowrap",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
    >
      {children}
    </span>
  );
}
