import { forwardRef, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { cardVariants, type CardVariants } from "../variants/card";

type CardProps = ComponentProps<"div"> & CardVariants;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ elevated, padding, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ elevated, padding }), className)}
      {...props}
    />
  )
);

Card.displayName = "Card";
