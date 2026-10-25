import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/utils/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "glass";
  size?: "default" | "sm" | "lg" | "icon" | "xs";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const variantClasses = {
      default: "glass-button glass-button-primary bg-primary text-primary-foreground shadow hover:bg-primary/90 active:scale-[0.98]",
      destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98]",
      outline: "glass-button glass-button-outline border border-border bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
      secondary: "glass-button glass-button-secondary bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:scale-[0.98]",
      ghost: "hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
      link: "text-primary underline-offset-4 hover:underline",
      glass: "glass-button glass-button-outline border border-border text-foreground hover:bg-accent/50 shadow-sm",
    };

    const sizeClasses = {
      default: "h-9 px-3.5 py-1.5",
      sm: "h-8 px-2.5 text-xs rounded-md",
      xs: "h-6 px-2 text-[12px] rounded-md font-medium",
      lg: "h-10 px-5 text-base",
      icon: "h-8 w-8 p-0 flex items-center justify-center",
    };

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-[color,background-color,border-color,box-shadow,opacity] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none select-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
