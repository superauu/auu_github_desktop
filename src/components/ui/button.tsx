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
    | "glass"
    | "outline-danger"
    | "outline-success";
  size?: "default" | "sm" | "toolbar" | "lg" | "icon" | "icon-sm" | "icon-xs" | "xs";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const variantClasses = {
      default: "border border-primary/45 bg-primary/15 text-primary rounded hover:bg-primary/25 active:scale-[0.98]",
      destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:scale-[0.98]",
      outline: "glass-button glass-button-outline border border-border bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
      secondary: "glass-button glass-button-secondary bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 active:scale-[0.98]",
      ghost: "hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
      link: "text-primary underline-offset-4 hover:underline",
      glass: "glass-button glass-button-outline border border-border text-foreground hover:bg-accent/50 shadow-xs",
      "outline-danger": "border border-destructive/40 bg-transparent text-destructive shadow-xs hover:bg-destructive/10 hover:text-destructive active:scale-[0.98]",
      "outline-success": "border border-git-added/40 bg-transparent text-git-added shadow-xs hover:bg-git-added/10 hover:text-git-added active:scale-[0.98]",
    };

    const sizeClasses = {
      default: "h-9 px-3.5 py-1.5",
      sm: "h-8 px-2.5 text-xs rounded-md",
      // 28px 工具条档位：与各页工具条 28px 控件（输入/下拉/芯片）同高，字号统一 12px。
      toolbar: "h-7 px-2.5 text-[12px] rounded-md font-medium",
      xs: "h-6 px-2 text-[12px] leading-[18px] rounded-md font-medium",
      lg: "h-10 px-5 text-base",
      icon: "h-8 w-8 p-0 flex items-center justify-center",
      "icon-sm": "h-7 w-7 p-0 flex items-center justify-center",
      "icon-xs": "h-6 w-6 p-0 flex items-center justify-center",
    };

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-[color,background-color,border-color,box-shadow,opacity] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none select-none",
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
