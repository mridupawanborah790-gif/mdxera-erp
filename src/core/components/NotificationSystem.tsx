import React, { useEffect } from 'react';
import type { Notification } from '../types/types';

interface NotificationSystemProps {
  notifications: Notification[];
  removeNotification: (id: number) => void;
}

const NotificationItem: React.FC<{ notification: Notification; onRemove: (id: number) => void }> = ({ notification, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(notification.id);
    }, 4000); // Auto-dismiss after 4 seconds

    return () => clearTimeout(timer);
  }, [notification.id, onRemove]);

  const getTypeStyles = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-emerald-600 border-white text-white';
      case 'error':
        return 'bg-red-600 border-white text-white';
      case 'warning':
        return 'bg-amber-400 border-amber-600 text-black';
      default:
        return 'bg-primary border-white text-white';
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><polyline points="20 6 9 17 4 12"/></svg>
        );
      case 'error':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      className={`pointer-events-auto flex items-center justify-between min-w-[320px] max-w-md p-4 border-l-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in slide-in-from-right duration-300 rounded-none mb-2 ${getTypeStyles()}`}
      role="alert"
    >
      <div className="flex items-center">
        {getIcon()}
        <span className="text-xs font-black uppercase tracking-widest leading-tight">{notification.message}</span>
      </div>
      <button 
        onClick={() => onRemove(notification.id)} 
        className="ml-4 p-1 hover:bg-black/10 transition-colors rounded-none"
        aria-label="Close notification"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
};

const NotificationSystem: React.FC<NotificationSystemProps> = ({ notifications, removeNotification }) => {
  return (
    <div className="fixed bottom-12 right-6 z-[10000] flex flex-col items-end pointer-events-none">
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
        />
      ))}
    </div>
  );
};

export default NotificationSystem;
