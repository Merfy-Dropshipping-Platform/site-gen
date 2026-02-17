import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center",
    "font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "rounded-[var(--radius-button)]",
    "font-[family-name:var(--font-body)]",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[rgb(var(--color-primary-rgb))]",
          "text-[var(--color-button-text)]",
          "hover:opacity-90",
          "focus-visible:outline-[rgb(var(--color-primary-rgb))]",
        ],
        secondary: [
          "border border-[rgb(var(--color-primary-rgb))]",
          "text-[rgb(var(--color-primary-rgb))]",
          "bg-transparent",
          "hover:bg-[rgb(var(--color-primary-rgb)/0.05)]",
        ],
        ghost: [
          "text-foreground",
          "hover:bg-foreground/5",
        ],
      },
      size: {
        sm: "text-sm px-3 py-1.5",
        md: "text-sm px-4 py-2.5",
        lg: "text-base px-6 py-3",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    compoundVariants: [
      { variant: "primary", size: "lg", class: "text-base font-bold" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
