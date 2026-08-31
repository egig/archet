import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from './utils.js';

export type LabelProps = ComponentPropsWithoutRef<typeof LabelPrimitive.Root>;

/** Thin restyle of Radix's `Label` — its only real job is the accessibility wiring
 * (`htmlFor`/`id` association, and a click on the label focusing its control) a plain `<label>`
 * gets for free but a hand-rolled `<span>` used as a label (common in the console's older
 * components) doesn't. */
export const Label = forwardRef<ElementRef<typeof LabelPrimitive.Root>, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-sm font-medium text-foreground select-none', className)}
      {...props}
    />
  );
});
