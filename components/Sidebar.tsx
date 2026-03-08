
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { NavItem, RegisteredPharmacy, AppConfigurations } from '../types';
import { settingsNavigation } from '../constants';

interface SidebarProps {
  currentPage: string;
  onNavigate: (pageId: string) => void;
  currentUser: RegisteredPharmacy | null;
  navigationItems: NavItem[];
  configurations: AppConfigurations;
  onToggleMasterExplorer: () => void;
  brandName: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, navigationItems, configurations, onToggleMasterExplorer, brandName }) => {
  const isSidebarCollapsed = configurations.sidebar?.isSidebarCollapsed ?? false;
  const expandedSidebarWidthClass = 'w-[14.97rem]';
  const expandedItemPaddingClass = 'px-2';
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Automatically open parent menus if the current page is a child
    const findParents = (items: NavItem[], targetId: string, parents: string[] = []): string[] | null => {
      for (const item of items) {
        if (item.id === targetId) return parents;
        if (item.children) {
          const res = findParents(item.children, targetId, [...parents, item.id]);
          if (res) return res;
        }
      }
      return null;
    };

    const parents = findParents([...navigationItems, ...settingsNavigation], currentPage);
    if (parents) {
      setOpenMenus(prev => Array.from(new Set([...prev, ...parents])));
    }
  }, [currentPage, navigationItems]);

  const toggleMenu = (menuId: string) => {
    if (isSidebarCollapsed) {
        onToggleMasterExplorer(); // Expand if user clicks a menu item while collapsed
    }
    setOpenMenus(prev => prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]);
  };

  // Compute a flat list of items that are currently visible/accessible for keyboard navigation
  const visibleItems = useMemo(() => {
    const list: NavItem[] = [];
    const processItems = (items: NavItem[]) => {
      items.forEach(item => {
        list.push(item);
        if (item.children && openMenus.includes(item.id) && !isSidebarCollapsed) {
          processItems(item.children);
        }
      });
    };
    processItems(navigationItems);
    processItems(settingsNavigation);
    return list;
  }, [navigationItems, openMenus, isSidebarCollapsed]);

  // Keyboard navigation handler for Sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (prev < visibleItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : visibleItems.length - 1));
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        const item = visibleItems[focusedIndex];
        if (item.children && item.children.length > 0) {
          toggleMenu(item.id);
        } else {
          onNavigate(item.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, focusedIndex, openMenus, onNavigate]);

  // Reset focus when navigation changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [currentPage]);

  const renderMenuItems = (items: NavItem[], depth = 0) => {
    return items.map(item => {
      const isActive = currentPage === item.id;
      const flatIndex = visibleItems.findIndex(v => v.id === item.id);
      const isFocused = focusedIndex === flatIndex;
      const isParent = item.children && item.children.length > 0;
      const isParentOpen = isParent && openMenus.includes(item.id);
      const shortcutChar = item.name.charAt(0);
      const Icon = item.icon;

      const handleItemClick = (e: React.MouseEvent) => {
        e.preventDefault();
        if (isParent) {
          toggleMenu(item.id);
        } else {
          onNavigate(item.id);
        }
      };

      return (
        <React.Fragment key={item.id}>
          <button
            onClick={handleItemClick}
            onMouseEnter={() => setFocusedIndex(flatIndex)}
            className={`w-full flex items-center gap-2.5 py-2 px-2 ${isSidebarCollapsed ? 'px-4' : expandedItemPaddingClass} transition-all text-left outline-none border border-gray-400 group min-h-[42px] ${
              isActive 
              ? 'bg-accent text-black border-primary shadow-sm font-semibold'
              : isFocused 
                ? 'bg-accent/80 text-black border-primary'
                : 'bg-gray-200 text-gray-800 hover:bg-accent hover:text-black'
            } ${isSidebarCollapsed ? 'justify-center !px-0' : ''}`}
            title={isSidebarCollapsed ? item.name : undefined}
            aria-expanded={isParent ? isParentOpen : undefined}
          >
            {Icon && (
              <div className={`flex-shrink-0 ${isActive || isFocused ? 'text-black' : 'text-gray-600 group-hover:text-black'} transition-colors`}>
                <Icon className={isSidebarCollapsed ? 'w-6 h-6' : 'w-4 h-4'} />
              </div>
            )}
            
            {!isSidebarCollapsed && (
              <>
                <span className={`w-5 text-center font-bold font-mono text-[10px] leading-none ${isActive || isFocused ? 'text-black' : 'text-gray-500'}`}>
                  {depth > 0 ? '•' : shortcutChar}
                </span>
                <span className="truncate flex-1 text-[15px] font-semibold leading-tight">
                  {depth > 0 ? (item.name) : (
                    <><span className={`${isActive || isFocused ? 'text-black' : 'text-gray-800'} font-semibold`}>{shortcutChar}</span>{item.name.substring(1)}</>
                  )}
                </span>
                {isParent && (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-3.5 w-3.5 transition-transform ${isParentOpen ? 'rotate-90' : ''} ${isActive || isFocused ? 'text-black' : 'text-gray-500'}`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor" 
                    strokeWidth="3"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </>
            )}
          </button>
          {isParentOpen && !isSidebarCollapsed && item.children && (
            <div role="menu" className="bg-gray-100/90 py-1 px-2 space-y-1">
              {renderMenuItems(item.children, depth + 1)}
            </div>
          )}
        </React.Fragment>
      );
    });
  };
  
  return (
    <div 
      ref={sidebarRef}
      className={`transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-16' : expandedSidebarWidthClass} bg-gray-100 flex flex-col h-full shrink-0 print:hidden border-r border-gray-400 z-10`}
    >
      <div className={`${isSidebarCollapsed ? 'p-4' : 'px-[1.1rem] py-3'} h-14 bg-primary text-white flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} border-b-2 border-gray-700`}>
        {!isSidebarCollapsed && (
            <div className="flex items-center gap-2 overflow-hidden animate-in fade-in duration-300">
                <span className="font-bold text-[12px] tracking-[0.2em] truncate uppercase">MDXERA ERP</span>
            </div>
        )}
        <button 
            onClick={onToggleMasterExplorer} 
            className="hover:bg-white/10 p-2 rounded-none outline-none focus:ring-1 focus:ring-accent transition-all active:scale-90"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {isSidebarCollapsed ? (
                <path d="M4 6h16M4 12h16M4 18h16"/>
            ) : (
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            )}
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 bg-gray-100 custom-scrollbar">
        <nav className="space-y-1 px-2">
          {renderMenuItems(navigationItems)}
          {!isSidebarCollapsed && <div className="h-px bg-gray-400 my-3 mx-0"></div>}
          {renderMenuItems(settingsNavigation)}
        </nav>
      </div>

      <div className={`${isSidebarCollapsed ? 'px-3.5' : 'px-2'} mt-auto py-2 bg-gray-200 border-t border-gray-400`}>
          {!isSidebarCollapsed ? (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[10px] font-bold text-gray-600 uppercase tracking-wide">
                    <button onClick={() => onNavigate('pos')} className="hover:text-black transition-colors outline-none focus:text-black">F2 Sale</button>
                    <button onClick={() => onNavigate('inventory')} className="hover:text-black transition-colors outline-none focus:text-black">F4 Stock</button>
                    <button onClick={() => onNavigate('manualSupplierInvoice')} className="hover:text-black transition-colors outline-none focus:text-black">F8 Purc</button>
                </div>
              </div>
          ) : (
              <div className="flex flex-col items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
              </div>
          )}
      </div>
    </div>
  );
};

export default Sidebar;
