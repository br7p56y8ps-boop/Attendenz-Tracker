import React, { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompactTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}

export function CompactTimePicker({
  value,
  onChange,
  label,
  placeholder = 'Time',
  className,
}: CompactTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!isOpen) setDraft(value);
  }, [isOpen, value]);

  const close = () => {
    setDraft(value);
    setIsOpen(false);
  };

  const confirm = () => {
    onChange(draft);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className={cn(
          'flex h-10 w-full min-w-0 items-center justify-between gap-1 rounded-xl border border-border bg-background px-2 text-left text-sm text-foreground transition-all focus:outline-none focus:ring-2 focus:ring-primary/40',
          className,
        )}
      >
        <span className={cn('truncate', !value && 'text-muted-foreground/70')}>{value || placeholder}</span>
        <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 p-3 sm:items-center sm:justify-center"
          role="presentation"
          onClick={close}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-4">
              <p className="text-sm font-bold text-foreground">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">Choose a time from your device picker.</p>
            </div>

            <input
              type="time"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              className="h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={close}
                className="h-11 rounded-xl border border-border text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                className="h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
