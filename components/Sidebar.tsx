
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { NavItem, RegisteredPharmacy, AppConfigurations } from '../types';
import { navigation, settingsNavigation } from '../constants';

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
            className={`w-full flex items-center gap-3 py-2 px-4 transition-all text-left outline-none border-l-4 group ${
              isActive 
              ? 'bg-white/10 text-white font-bold border-accent shadow-lg'
              : isFocused 
                ? 'bg-white/20 text-white border-accent/50'
                : 'text-gray-100 hover:bg-white/5 border-transparent'
            } ${isSidebarCollapsed ? 'justify-center !px-0' : ''}`}
            title={isSidebarCollapsed ? item.name : undefined}
            aria-expanded={isParent ? isParentOpen : undefined}
          >
            {Icon && (
              <div className={`flex-shrink-0 ${isActive || isFocused ? 'text-accent' : 'text-gray-400 group-hover:text-gray-100'} transition-colors`}>
                <Icon className={isSidebarCollapsed ? 'w-6 h-6' : 'w-5 h-5'} />
              </div>
            )}
            
            {!isSidebarCollapsed && (
              <>
                <span className={`w-5 text-center font-bold font-mono text-[11px] ${isActive || isFocused ? 'text-accent' : 'text-gray-400'}`}>
                  {depth > 0 ? '•' : shortcutChar}
                </span>
                <span className="truncate flex-1 text-[13px] uppercase tracking-tight">
                  {depth > 0 ? (item.name) : (
                    <><span className={`${isActive || isFocused ? 'text-accent' : 'text-gray-100'} font-black`}>{shortcutChar}</span>{item.name.substring(1)}</>
                  )}
                </span>
                {isParent && (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-3 w-3 transition-transform ${isParentOpen ? 'rotate-90' : ''} ${isActive || isFocused ? 'text-white' : 'text-gray-500'}`}
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
            <div role="menu" className="bg-black/10 py-1">
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
      className={`transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-16' : 'w-64'} bg-sidebar-bg flex flex-col h-full print:hidden border-r border-gray-400 z-10`}
    >
      <div className={`p-4 h-14 bg-sidebar-bg-dark text-white flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isSidebarCollapsed && (
            <div className="flex items-center gap-2 overflow-hidden animate-in fade-in duration-300">
                <span className="font-black text-[13px] tracking-widest truncate uppercase">MDXERA ERP</span>
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

      <div className="flex-1 overflow-y-auto py-2 bg-sidebar-bg custom-scrollbar">
        <nav className="space-y-0.5">
          {renderMenuItems(navigationItems)}
          {!isSidebarCollapsed && <div className="h-px bg-white/10 my-4 mx-4"></div>}
          {renderMenuItems(settingsNavigation)}
        </nav>
      </div>

      <div className="mt-auto p-3 bg-gray-900 border-t border-gray-700">
          {!isSidebarCollapsed ? (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-tighter">
                    <button onClick={() => onNavigate('pos')} className="hover:text-accent transition-colors outline-none focus:text-accent">F2 Sale</button>
                    <button onClick={() => onNavigate('inventory')} className="hover:text-accent transition-colors outline-none focus:text-accent">F4 Stock</button>
                    <button onClick={() => onNavigate('manualPurchaseEntry')} className="hover:text-accent transition-colors outline-none focus:text-accent">F8 Purc</button>
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
