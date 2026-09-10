import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
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

/** The single app-wide modal surface. Content is always a compact, draggable bottom sheet. */
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
  const dragControls = useDragControls();
  const handleBackdropClick = onBackdropClick || onClose;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <div className={cn('fixed inset-0 flex items-end justify-center p-3 sm:p-4', zIndexClassName)} style={style}>
          <motion.div
            className={cn('modal-sheet-backdrop absolute inset-0 bg-black/60', backdropClassName)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.27, ease: 'easeIn' } }}
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
            layout
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 700 }}
            dragElastic={{ top: 0, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 650) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { duration: 0.27, ease: 'easeIn' } }}
            transition={{
              y: { duration: 0.3, ease: 'easeOut' },
              layout: { duration: 0.22, ease: 'easeInOut' },
            }}
            className={cn(
              'relative flex w-full min-h-[140px] max-h-[80dvh] flex-col overflow-hidden rounded-3xl border border-border bg-card',
              maxWidth,
              className,
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="flex h-7 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
              onPointerDown={(event) => dragControls.start(event)}
              aria-hidden="true"
            >
              <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
            </div>
            {header && <div className="modal-sheet-header shrink-0">{header}</div>}
            <div className="modal-sheet-divider shrink-0" aria-hidden="true" />
            <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)}>{children}</div>
            <div className="modal-sheet-divider shrink-0" aria-hidden="true" />
            {footer && <div className="modal-sheet-footer shrink-0">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ModalSheet;
