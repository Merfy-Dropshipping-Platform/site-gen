import { cva, type VariantProps } from "class-variance-authority";

export const inputVariants = cva(
  [
    "w-full",
    "border bg-background text-foreground",
    "rounded-[var(--radius-input)]",
    "font-[family-name:var(--font-body)]",
    "placeholder:text-muted-foreground",
    "focus:outline-none focus:ring-2 focus:ring-offset-0",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "transition-colors",
  ],
  {
    variants: {
      variant: {
        default: [
          "border-[var(--color-border)]",
          "focus:ring-[rgb(var(--color-primary-rgb))]",
          "focus:border-[rgb(var(--color-primary-rgb))]",
        ],
        error: [
          "border-red-500",
          "focus:ring-red-500",
          "focus:border-red-500",
        ],
      },
      size: {
        sm: "text-sm px-3 py-1.5",
        md: "text-sm px-3 py-2.5",
        lg: "text-base px-4 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export type InputVariants = VariantProps<typeof inputVariants>;
