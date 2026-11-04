import React from 'react';

// Fixed positions and timings: no random values, so renders are stable
const PETALS = [
  { left: '6%', delay: '0s', duration: '14s', scale: 1 },
  { left: '22%', delay: '5s', duration: '17s', scale: 0.75 },
  { left: '41%', delay: '9s', duration: '15s', scale: 0.9 },
  { left: '63%', delay: '2.5s', duration: '18s', scale: 0.7 },
  { left: '80%', delay: '7s', duration: '16s', scale: 1.05 },
  { left: '93%', delay: '11s', duration: '19s', scale: 0.8 },
];

/**
 * A few slowly falling rose petals for selected sections. CSS only (transform and opacity),
 * hidden when the visitor prefers reduced motion. The parent must be position: relative.
 */
export default function RosePetals() {
  return (
    <span className="ps-petals" aria-hidden="true">
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="ps-petal-lane"
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
        >
          <span className="ps-petal" style={{ '--petal-scale': p.scale, animationDelay: p.delay }} />
        </span>
      ))}
    </span>
  );
}
