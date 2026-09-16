import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium leading-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        gruen: 'border-transparent bg-ampel-gruen/15 text-ampel-gruen',
        gelb: 'border-transparent bg-ampel-gelb/20 text-[hsl(41_94%_32%)] dark:text-ampel-gelb',
        rot: 'border-transparent bg-ampel-rot/15 text-ampel-rot',
        grau: 'border-transparent bg-muted text-muted-foreground',
        primary: 'border-transparent bg-primary/10 text-primary dark:bg-primary/20',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
