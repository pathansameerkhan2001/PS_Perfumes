import React from 'react';
import everydayImg from '../assets/scent-everyday.webp';
import officeImg from '../assets/scent-office.webp';
import partyImg from '../assets/scent-party.webp';
import sportsImg from '../assets/scent-sports.webp';
import datenightImg from '../assets/scent-datenight.webp';
import collegeImg from '../assets/scent-college.webp';
import OptimizedImage from './OptimizedImage';
import './SignatureScentSection.css';

const OCCASIONS = [
  {
    id: 'everyday',
    label: 'EVERYDAY',
    image: everydayImg,
    subtitle: 'Daily Signature',
    query: 'everyday',
  },
  {
    id: 'office',
    label: 'OFFICE',
    image: officeImg,
    subtitle: 'Professional & Subtle',
    query: 'office',
  },
  {
    id: 'party',
    label: 'PARTY',
    image: partyImg,
    subtitle: 'High Projection',
    query: 'party',
  },
  {
    id: 'sports',
    label: 'SPORTS',
    image: sportsImg,
    subtitle: 'Fresh & Energizing',
    query: 'fresh',
  },
  {
    id: 'date-night',
    label: 'DATE NIGHT',
    image: datenightImg,
    subtitle: 'Warm & Seductive',
    query: 'amber',
  },
  {
    id: 'college',
    label: 'COLLEGE',
    image: collegeImg,
    subtitle: 'Youthful & Modern',
    query: 'citrus',
  },
];

export default function SignatureScentSection() {
  const handleOccasionClick = (occ) => {
    const catalogElement = document.getElementById('catalog-grid');
    if (catalogElement) {
      catalogElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="ps-scent-section" aria-label="Discover Your Signature Scent">
      <div className="ps-scent-container">
        {/* Section Header */}
        <div className="ps-scent-header">
          <h2 className="ps-scent-heading">Discover Your Signature Scent</h2>
        </div>

        {/* 6 Occasion Cards Grid */}
        <div className="ps-scent-grid">
          {OCCASIONS.map((occ) => (
            <div
              key={occ.id}
              className="ps-scent-card"
              role="button"
              tabIndex={0}
              onClick={() => handleOccasionClick(occ)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOccasionClick(occ);
                }
              }}
              aria-label={`Shop scents for ${occ.label}`}
            >
              <div className="ps-scent-image-wrapper">
                <OptimizedImage
                  src={occ.image}
                  alt={`PS Perfumes for ${occ.label}`}
                  className="ps-scent-img"
                  aspectRatio="4 / 5"
                  width="360"
                  height="450"
                />
                <div className="ps-scent-gradient-overlay" />
              </div>

              {/* Bottom Pill Badge */}
              <div className="ps-scent-pill-wrapper">
                <span className="ps-scent-pill">{occ.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
