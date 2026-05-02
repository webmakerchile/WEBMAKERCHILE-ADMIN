import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Variantes:
 *  - default: acción principal (naranja)
 *  - destructive: acciones peligrosas (rojo)
 *  - outline: secundario discreto sobre fondo neutro
 *  - secondary: secundario sobre superficies
 *  - ghost: solo texto, hover suave
 *  - link: hipervínculo
 *
 * Tamaños: sm, default, lg, icon. Todos con focus-visible:ring del tema.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/85",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/85",
        outline:
          "border border-input bg-background text-foreground shadow-xs " +
          "hover:bg-foreground/5 hover:text-foreground active:bg-foreground/10",
        secondary:
          "bg-secondary text-secondary-foreground border border-foreground/10 " +
          "hover:bg-secondary/80 active:bg-secondary/70",
        ghost:
          "border border-transparent text-foreground hover:bg-foreground/5 active:bg-foreground/10",
        link: "text-primary underline-offset-4 hover:underline focus-visible:ring-offset-0",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
