import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useModalAccessibility } from '@/components/ui/dialog';

interface ModalSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
  labelledBy?: string;
  maxWidth?: string;
  className?: string;
  bodyClassName?: string;
  zIndexClassName?: string;
  backdropClassName?: string;
  style?: React.CSSProperties;
  onBackdropClick?: () => void;
}

/** The single app-wide modal surface. Content is always a bottom sheet with one scroll region. */
export function ModalSheet({
  open,
  onClose,
  children,
  header,
  footer,
  ariaLabel,
  labelledBy,
  maxWidth = 'max-w-lg',
  className,
  bodyClassName,
  zIndexClassName = 'z-[120]',
  backdropClassName,
  style,
  onBackdropClick,
}: ModalSheetProps) {
  const surfaceRef = useModalAccessibility(open, onClose);
  const handleBackdropClick = onBackdropClick || onClose;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 flex items-end justify-center', zIndexClassName)} style={style}>
          <motion.div
            className={cn('modal-sheet-backdrop absolute inset-0 bg-black/60', backdropClassName)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={handleBackdropClick}
          />
          <motion.div
            ref={surfaceRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            tabIndex={-1}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn(
              'relative flex w-full min-h-0 max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl rounded-b-none border border-border bg-card',
              maxWidth,
              className,
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div aria-hidden="true" className="mx-auto mt-2.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/35" />
            {header}
            <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)}>{children}</div>
            {footer}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ModalSheet;
