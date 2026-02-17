import { forwardRef, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { buttonVariants, type ButtonVariants } from "../variants/button";

type ButtonProps = ComponentProps<"button"> & ButtonVariants & {
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, fullWidth, className, asChild: _, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    />
  )
);

Button.displayName = "Button";
