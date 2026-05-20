
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TallyPromptProps {
  isOpen: boolean;
  title: string;
  message: string;
  onAccept: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  acceptLabel?: string;
  discardLabel?: string;
}

const TallyPrompt: React.FC<TallyPromptProps> = ({ 
  isOpen, 
  title, 
  message, 
  onAccept, 
  onDiscard, 
  onCancel,
  acceptLabel = "Yes (Y)",
  discardLabel = "No (N)"
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0); // 0 for Yes, 1 for No

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0); // Reset to default "Yes"
      
      // Critical: Use a small timeout to ensure the element is in the DOM
      // then steal focus from any background inputs
      const timer = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.focus();
        }
      }, 50);
      
      // Lock scroll
      document.body.style.overflow = 'hidden';
      
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent event from leaking to underlying screen
    e.stopPropagation();
    
    const key = e.key;

    if (key === 'Tab') {
      e.preventDefault();
      setSelectedIndex(prev => (prev === 0 ? 1 : 0));
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (key === 'ArrowRight') {
      e.preventDefault();
      setSelectedIndex(1);
    } else if (key === 'Enter') {
      e.preventDefault();
      if (selectedIndex === 0) onAccept();
      else onDiscard();
    } else if (key.toLowerCase() === 'y') {
      e.preventDefault();
      onAccept();
    } else if (key.toLowerCase() === 'n' || key.toLowerCase() === 'd') {
      e.preventDefault();
      onDiscard();
    } else if (key.toLowerCase() === 'escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-[1px] transition-all"
    >
      <div 
        ref={containerRef}
        tabIndex={0}
        className="bg-[#FFF0D5] border-2 border-[#004242] shadow-[20px_20px_0px_rgba(0,0,0,0.3)] w-96 outline-none animate-in zoom-in-95 duration-100 ring-4 ring-[#004242]/20"
        onKeyDown={handleKeyDown}
      >
        {/* Modal Header */}
        <div className="bg-[#004242] text-white px-4 py-2 text-[12px] font-black uppercase tracking-widest flex justify-between items-center border-b border-[#003333]">
          <span>{title}</span>
          <div className="flex items-center gap-3">
            <span className="opacity-50 text-[9px] font-normal">Press ESC to Cancel</span>
            <button 
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              className="p-0.5 hover:bg-white/10 rounded transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        
        {/* Message Content */}
        <div className="p-10 text-center bg-[#FFF0D5]">
          <p className="text-base font-black text-[#004242] uppercase tracking-tight mb-10 leading-relaxed drop-shadow-sm">
            {message}
          </p>
          
          <div className="flex justify-center gap-8">
            <button 
              onClick={(e) => { e.stopPropagation(); onAccept(); }}
              onMouseEnter={() => setSelectedIndex(0)}
              className={`min-w-[120px] py-3 px-8 text-[13px] font-black uppercase transition-all shadow-md border-2 ${
                selectedIndex === 0 
                ? 'bg-[#004242] text-white border-[#004242] scale-110 shadow-xl' 
                : 'bg-white text-[#004242] border-[#004242] opacity-80'
              }`}
            >
              {acceptLabel}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDiscard(); }}
              onMouseEnter={() => setSelectedIndex(1)}
              className={`min-w-[120px] py-3 px-8 text-[13px] font-black uppercase transition-all shadow-md border-2 ${
                selectedIndex === 1 
                ? 'bg-[#004242] text-white border-[#004242] scale-110 shadow-xl' 
                : 'bg-white text-[#004242] border-[#004242] opacity-80'
              }`}
            >
              {discardLabel}
            </button>
          </div>
        </div>
        
        {/* Legend Footer */}
        <div className="bg-gray-100/50 border-t border-[#004242]/10 p-2 text-center">
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter italic">
            Arrows: Select | Enter: Confirm | Y / N: Quick Response
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TallyPrompt;
