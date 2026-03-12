
import React, { useEffect, useState } from 'react';
import Modal from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message,
  confirmLabel = "Yes",
  cancelLabel = "No"
}) => {
  const [activeButton, setActiveButton] = useState<'confirm' | 'cancel'>('cancel');

  useEffect(() => {
    if (isOpen) {
      setActiveButton('cancel'); // Default to No/Stay for safety
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveButton(prev => prev === 'confirm' ? 'cancel' : 'confirm');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeButton === 'confirm') {
          onConfirm();
          onClose();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, activeButton, onConfirm, onClose]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} widthClass="max-w-md">
      <div className="p-6">
        <p className="text-app-text-secondary font-normal">{message}</p>
      </div>
      <div className="flex justify-end p-4 bg-[var(--modal-footer-bg-light)] dark:bg-[var(--modal-footer-bg-dark)] border-t border-[var(--modal-footer-border-light)] dark:border-[var(--modal-footer-border-dark)] space-x-2">
        <button
          onClick={onClose}
          className={`px-6 py-2 text-sm font-bold uppercase transition-all border-2 ${
            activeButton === 'cancel' 
              ? 'bg-primary text-white border-primary shadow-lg scale-105' 
              : 'bg-card-bg text-app-text-secondary border-app-border hover:bg-gray-100'
          }`}
        >
          {cancelLabel}
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`px-6 py-2 text-sm font-bold uppercase transition-all border-2 ${
            activeButton === 'confirm' 
              ? 'bg-red-600 text-white border-red-600 shadow-lg scale-105' 
              : 'bg-card-bg text-red-600 border-red-600 hover:bg-red-50'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
