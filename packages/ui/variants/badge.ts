import { cva, type VariantProps } from "class-variance-authority";

export const badgeVariants = cva(
  [
    "inline-flex items-center",
    "font-medium",
    "rounded-[var(--radius-base)]",
    "font-[family-name:var(--font-body)]",
  ],
  {
    variants: {
      variant: {
        default: [
          "bg-[rgb(var(--color-primary-rgb)/0.1)]",
          "text-[rgb(var(--color-primary-rgb))]",
        ],
        success: [
          "bg-emerald-100 text-emerald-800",
        ],
        warning: [
          "bg-amber-100 text-amber-800",
        ],
        error: [
          "bg-red-100 text-red-800",
        ],
      },
      size: {
        sm: "text-xs px-2 py-0.5",
        md: "text-sm px-2.5 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
