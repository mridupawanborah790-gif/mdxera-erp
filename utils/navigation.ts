
import React from 'react';

export const handleEnterToNextField = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.key === 'Enter') {
    const target = e.target as HTMLElement;
    
    // Allow default behavior for Buttons, Links, Textareas, and Selects
    // Intercepting Enter on SELECT prevents users from confirming their choice in the dropdown.
    if (
      target.tagName === 'BUTTON' || 
      target.tagName === 'A' || 
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT'
    ) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation(); // Stop event from bubbling to parent screens/modals
    
    // Use currentTarget as the scope container
    const container = e.currentTarget;
    
    // Selector for focusable elements
    const selector = 'input:not([disabled]):not([type="hidden"]):not([readonly]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([readonly]), button:not([disabled]):not([tabindex="-1"]), a[href]';
    
    const focusableElements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];
    
    // Filter out invisible elements just in case
    const visibleFocusables = focusableElements.filter(el => {
      return el.offsetParent !== null;
    });

    const currentIndex = visibleFocusables.indexOf(target);
    
    if (currentIndex > -1 && currentIndex < visibleFocusables.length - 1) {
      const nextElement = visibleFocusables[currentIndex + 1];
      nextElement.focus();
      if (nextElement instanceof HTMLInputElement) {
        nextElement.select();
      }
    }
  }
};