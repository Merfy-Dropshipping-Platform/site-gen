import { forwardRef, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { inputVariants, type InputVariants } from "../variants/input";

type InputProps = ComponentProps<"input"> & InputVariants;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ variant, size, className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputVariants({ variant, size }), className)}
      {...props}
    />
  )
);

Input.displayName = "Input";
