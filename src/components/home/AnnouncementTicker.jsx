import React from 'react';
import './AnnouncementTicker.css';

const TICKER_ITEMS = [
  'Different Variant Available',
  '100% Alcohol Free',
  'Perfect for Daily Wear & Occasional Wear',
];

export default function AnnouncementTicker() {
  // Repeating the set of 3 items 4 times creates a seamless continuous loop
  const repeatedSets = [0, 1, 2, 3];

  return (
    <div
      className="ps-announcement-ticker"
      role="region"
      aria-label="Brand Announcement Ticker"
    >
      <div className="ps-ticker-track-wrapper">
        <div className="ps-ticker-track">
          {/* First loop track */}
          <div className="ps-ticker-content" aria-hidden="false">
            {repeatedSets.map((setIdx) => (
              <React.Fragment key={`set-1-${setIdx}`}>
                {TICKER_ITEMS.map((text, idx) => (
                  <span key={`t1-${setIdx}-${idx}`} className="ps-ticker-item">
                    <span className="ps-ticker-text">{text}</span>
                    <span className="ps-ticker-star" aria-hidden="true">✦</span>
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>

          {/* Duplicate track for seamless infinite scroll */}
          <div className="ps-ticker-content" aria-hidden="true">
            {repeatedSets.map((setIdx) => (
              <React.Fragment key={`set-2-${setIdx}`}>
                {TICKER_ITEMS.map((text, idx) => (
                  <span key={`t2-${setIdx}-${idx}`} className="ps-ticker-item">
                    <span className="ps-ticker-text">{text}</span>
                    <span className="ps-ticker-star" aria-hidden="true">✦</span>
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
