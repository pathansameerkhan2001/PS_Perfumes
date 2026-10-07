import React from 'react';
import './AdminPageContainer.css';

/**
 * Luxury Admin Page Container Shell
 */
export default function AdminPageContainer({
  children,
  className = '',
  maxWidth = '1400px',
}) {
  return (
    <div className={`ps-admin-page-container ${className}`}>
      <div className="ps-admin-page-inner" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  );
}
