import React from 'react';
import './AdminBadge.css';

/**
 * Reusable Luxury Status Badge
 * @param {'success' | 'warning' | 'error' | 'gold' | 'neutral'} variant
 * @param {'sm' | 'md'} size
 */
export default function AdminBadge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) {
  return (
    <span className={`ps-admin-badge is-${variant} is-size-${size} ${className}`}>
      {children}
    </span>
  );
}
