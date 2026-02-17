import { forwardRef, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { badgeVariants, type BadgeVariants } from "../variants/badge";

type BadgeProps = ComponentProps<"span"> & BadgeVariants;

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, size, className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
);

Badge.displayName = "Badge";
