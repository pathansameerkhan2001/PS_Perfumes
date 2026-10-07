import React from 'react';
import './AdminButton.css';

/**
 * Reusable Luxury Button Component
 * @param {'primary' | 'secondary' | 'dark' | 'danger' | 'ghost'} variant
 * @param {'sm' | 'md' | 'lg'} size
 */
export default function AdminButton({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`ps-admin-btn is-${variant} is-size-${size} ${loading ? 'is-loading' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <span className="ps-admin-btn-spinner" />
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 14 : 16} className="ps-btn-icon-left" />}
          <span className="ps-btn-text">{children}</span>
          {Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 14 : 16} className="ps-btn-icon-right" />}
        </>
      )}
    </button>
  );
}
