
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCloseBlocked?: () => void;
  disableClose?: boolean;
  title: string;
  children: React.ReactNode;
  widthClass?: string;
  heightClass?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, onCloseBlocked, disableClose = false, title, children, widthClass, heightClass }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        // Stop propagation so global App listeners don't catch this ESC
        e.stopPropagation();
        if (disableClose) {
          onCloseBlocked?.();
          return;
        }
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown, true);
    }
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [disableClose, isOpen, onClose, onCloseBlocked]);

  const handleCloseRequest = () => {
    if (disableClose) {
      onCloseBlocked?.();
      return;
    }
    onClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/40 z-[200] flex justify-center items-center backdrop-blur-[1px]"
      onClick={handleCloseRequest}
    >
      <div 
        ref={modalRef}
        className={`bg-[var(--modal-bg-light)] dark:bg-[var(--modal-bg-dark)] border-2 border-[var(--modal-border-color-light)] dark:border-[var(--modal-border-color-dark)] shadow-[10px_10px_0px_rgba(0,0,0,0.2)] flex flex-col outline-none transition-all rounded-none overflow-hidden ${
            widthClass ? `w-full ${widthClass}` : 'w-full h-full'
        } ${heightClass || (widthClass ? 'h-auto max-h-[95vh]' : 'h-full')}`}
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="flex justify-between items-center px-4 py-2 bg-[var(--modal-header-bg-light)] dark:bg-[var(--modal-header-bg-dark)] text-[var(--modal-header-text-light)] border-b border-[var(--modal-header-border-light)] dark:border-[var(--modal-header-border-dark)] flex-shrink-0">
          <h3 className="text-xs font-normal uppercase tracking-widest">{title}</h3>
          <button onClick={handleCloseRequest} disabled={disableClose} className="p-1 hover:bg-white/10 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-[var(--modal-content-bg-light)] dark:bg-[var(--modal-content-bg-dark)]">
            {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
