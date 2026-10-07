import React from 'react';
import './AdminTable.css';

/**
 * Reusable Luxury Table Component
 */
export default function AdminTable({
  children,
  className = '',
  isCompact = false,
  ...props
}) {
  return (
    <div className="ps-admin-table-container">
      <table className={`ps-admin-table ${isCompact ? 'is-compact' : ''} ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}
