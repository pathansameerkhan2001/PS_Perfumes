import React from 'react';

export default function BenefitItem({ icon: Icon, title, description, isLast }) {
  return (
    <div className={`ps-benefit-item ${isLast ? 'is-last' : ''}`}>
      <div className="ps-benefit-icon-wrapper">
        <div className="ps-benefit-circle-icon">
          <Icon size={22} strokeWidth={1.4} className="ps-benefit-svg-icon" />
        </div>
      </div>
      <div className="ps-benefit-text-block">
        <h4 className="ps-benefit-title">{title}</h4>
        <p className="ps-benefit-desc">{description}</p>
      </div>
      {!isLast && <div className="ps-benefit-vertical-divider" aria-hidden="true" />}
    </div>
  );
}
