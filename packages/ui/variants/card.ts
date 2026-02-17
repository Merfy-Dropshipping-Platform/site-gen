import { cva, type VariantProps } from "class-variance-authority";

export const cardVariants = cva(
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-background",
  {
    variants: {
      elevated: {
        true: "shadow-md",
        false: "shadow-none",
      },
      padding: {
        none: "p-0",
        sm: "p-3",
        md: "p-5",
        lg: "p-8",
      },
    },
    defaultVariants: {
      elevated: false,
      padding: "md",
    },
  }
);

export type CardVariants = VariantProps<typeof cardVariants>;
