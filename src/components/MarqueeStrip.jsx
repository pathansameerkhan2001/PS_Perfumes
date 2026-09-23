import React from 'react';

const MARQUEE_ITEMS = [
  'PREMIUM FRAGRANCE',
  'ELEGANT LONG-LASTING SCENTS',
  'CRAFTED FOR EVERY OCCASION',
  'SIGNATURE FRAGRANCES',
  'LUXURY IN EVERY SPRAY',
  'PURE BOTANICAL EXTRACTIONS',
];

export default function MarqueeStrip() {
  return (
    <div className="ps-marquee-strip" aria-label="Brand Benefits">
      <div className="ps-marquee-track">
        {/* Render twice for seamless continuous infinite loop */}
        <div className="ps-marquee-group">
          {MARQUEE_ITEMS.map((item, idx) => (
            <React.Fragment key={`m1-${idx}`}>
              <span className="ps-marquee-item">{item}</span>
              <span className="ps-marquee-diamond">♦</span>
            </React.Fragment>
          ))}
        </div>
        <div className="ps-marquee-group" aria-hidden="true">
          {MARQUEE_ITEMS.map((item, idx) => (
            <React.Fragment key={`m2-${idx}`}>
              <span className="ps-marquee-item">{item}</span>
              <span className="ps-marquee-diamond">♦</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
