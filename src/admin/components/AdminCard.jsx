import React from 'react';
import './AdminCard.css';

/**
 * Reusable Luxury Card Container
 */
export default function AdminCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = '',
  bodyClassName = '',
  headerClassName = '',
  noPadding = false,
  ...props
}) {
  const hasHeader = Boolean(title || Icon || action);

  return (
    <div className={`ps-admin-card ${className}`} {...props}>
      {hasHeader && (
        <div className={`ps-admin-card-header ${headerClassName}`}>
          <div className="ps-admin-card-title-group">
            {Icon && (
              <span className="ps-admin-card-icon-wrap">
                <Icon size={18} color="var(--ps-admin-gold, #C9A96E)" />
              </span>
            )}
            <div>
              {title && <h3 className="ps-admin-card-title">{title}</h3>}
              {subtitle && <p className="ps-admin-card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="ps-admin-card-action">{action}</div>}
        </div>
      )}
      <div className={`ps-admin-card-body ${noPadding ? 'is-no-padding' : ''} ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
