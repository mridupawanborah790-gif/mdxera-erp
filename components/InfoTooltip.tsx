import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  title?: string;
  text: string;
  className?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ title, text, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipStyles, setTooltipStyles] = useState<React.CSSProperties>({});
  const [arrowStyles, setArrowStyles] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const calculatePosition = () => {
    if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const tooltipWidth = 256; // w-64 in pixels
        const tooltipHeight = 150; // estimated max height
        
        // Calculate Horizontal Position (X)
        // Try to center the tooltip relative to the button
        let left = rect.left + rect.width / 2 - tooltipWidth / 2;
        
        // Clamp to window edges with 10px margin
        if (left < 10) left = 10;
        if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - 10 - tooltipWidth;
        
        // Calculate Arrow X relative to tooltip container
        // The arrow should point to the center of the button
        const arrowLeft = (rect.left + rect.width / 2) - left;

        // Calculate Vertical Position (Y)
        const spaceAbove = rect.top;
        // const spaceBelow = window.innerHeight - rect.bottom;
        
        // Fixed: Use 'any' to allow dynamic assignment of top/bottom properties on line 51-54
        const styles: any = {
            position: 'fixed',
            zIndex: 9999,
            left: `${left}px`,
            width: `${tooltipWidth}px`,
        };
        
        let placement = 'top';

        // Prefer top placement if enough space, otherwise flip to bottom
        if (spaceAbove > tooltipHeight) {
             styles.bottom = `${window.innerHeight - rect.top + 8}px`; // 8px gap
             placement = 'top';
        } else {
             styles.top = `${rect.bottom + 8}px`; // 8px gap
             placement = 'bottom';
        }
        
        setTooltipStyles(styles);
        
        // Arrow styles (rotated square)
        const arrowBaseStyles: React.CSSProperties = {
            left: `${arrowLeft}px`,
            transform: 'translateX(-50%) rotate(45deg)',
            position: 'absolute',
            width: '12px',
            height: '12px',
            backgroundColor: 'var(--color-bg-card)', // Match card bg
            borderStyle: 'solid',
            borderColor: 'var(--color-border)',
            borderWidth: '0px'
        };

        if (placement === 'top') {
            setArrowStyles({
                ...arrowBaseStyles,
                bottom: '-6px',
                borderBottomWidth: '1px',
                borderRightWidth: '1px'
            });
        } else {
            setArrowStyles({
                ...arrowBaseStyles,
                top: '-6px',
                borderTopWidth: '1px',
                borderLeftWidth: '1px'
            });
        }
    }
  };

  const toggleTooltip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
        calculatePosition();
        setIsOpen(true);
    } else {
        setIsOpen(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => { if(isOpen) calculatePosition(); };
    const handleResize = () => { if(isOpen) setIsOpen(false); };
    
    // Close on click outside
    const handleClickOutside = (event: MouseEvent) => {
        if (
            tooltipRef.current && 
            !tooltipRef.current.contains(event.target as Node) && 
            buttonRef.current &&
            !buttonRef.current.contains(event.target as Node)
        ) {
            setIsOpen(false);
        }
    };

    if (isOpen) {
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);
        document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleTooltip}
        className={`relative inline-flex items-center ml-1.5 align-middle text-app-text-tertiary hover:text-primary transition-colors focus:outline-none ${className}`}
        aria-label="More information"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>

      {isOpen && createPortal(
        <div 
            ref={tooltipRef}
            className="bg-card-bg border border-app-border shadow-xl rounded-lg p-3 text-left animate-in fade-in zoom-in duration-200"
            style={tooltipStyles}
            onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start mb-1">
            {title && <h4 className="text-xs font-bold text-app-text-primary uppercase tracking-wide">{title}</h4>}
            <button
              onClick={() => setIsOpen(false)}
              className="text-app-text-tertiary hover:text-red-500 -mt-1 -mr-1 p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <p className="text-xs text-app-text-secondary leading-relaxed font-normal normal-case">
            {text}
          </p>
          
          {/* Arrow */}
          <div style={arrowStyles}></div>
        </div>,
        document.body
      )}
    </>
  );
};

export default InfoTooltip;
