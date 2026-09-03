import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface CountStepperProps {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  ariaLabel?: string;
}

export function CountStepper({
  label,
  value,
  onDecrement,
  onIncrement,
  decrementDisabled = false,
  incrementDisabled = false,
  ariaLabel,
}: CountStepperProps) {
  return (
    <div className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-xl p-1.5 shadow-sm">
      <span className="text-[11px] font-semibold text-muted-foreground pl-2 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-center gap-2 pr-0.5">
        <button
          type="button"
          onClick={onDecrement}
          disabled={decrementDisabled}
          aria-label={ariaLabel ? `Decrease ${ariaLabel}` : `Decrease ${label}`}
          className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all select-none cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-6 text-center font-bold text-sm select-none" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={incrementDisabled}
          aria-label={ariaLabel ? `Increase ${ariaLabel}` : `Increase ${label}`}
          className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all select-none cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default CountStepper;
