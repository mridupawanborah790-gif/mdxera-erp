
import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ children, className = '', onClick, ...rest }) => {
  const interactiveClasses = onClick 
    ? 'cursor-pointer hover:bg-gray-50 active:translate-y-[1px]' 
    : '';

  return (
    <div
      onClick={onClick}
      className={`bg-card-bg border border-app-border rounded-none shadow-sm transition-all duration-100 ${interactiveClasses} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};

export default Card;
