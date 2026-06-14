import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-gray-900 rounded-lg shadow-xl border border-gray-800 p-6 ${className}`}>
      {children}
    </div>
  );
}
