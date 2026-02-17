import { cva, type VariantProps } from "class-variance-authority";

export const containerVariants = cva(
  "mx-auto w-full px-4",
  {
    variants: {
      size: {
        sm: "max-w-screen-sm",
        md: "max-w-screen-md",
        lg: "max-w-[var(--page-width)]",
        full: "max-w-none",
      },
    },
    defaultVariants: {
      size: "lg",
    },
  }
);

export type ContainerVariants = VariantProps<typeof containerVariants>;
