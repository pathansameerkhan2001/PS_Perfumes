import React from 'react';
import brandLogo from '../assets/ps-perfumes-logo.png';
import prodRoyalAmber from '../assets/prod-royal-amber.jpg';
import { Award, Compass, ShieldCheck, HeartHandshake } from 'lucide-react';
import './Sections.css';

export default function AboutSection() {
  return (
    <section id="about" className="ps-about-section" aria-label="About PS Perfumes">
      <div className="ps-about-container">
        <div className="ps-about-layout">
          {/* Left Column: Visual Presentation */}
          <div className="ps-about-visual">
            <div className="ps-about-image-card">
              <img
                src={prodRoyalAmber}
                alt="PS Perfumes Flacon Craftsmanship"
                className="ps-about-img"
                loading="lazy"
              />
              <div className="ps-about-badge-seal">
                <span className="ps-about-seal-year">EST.</span>
                <span className="ps-about-seal-brand">PS</span>
                <span className="ps-about-seal-sub">HAUTE PARFUMERIE</span>
              </div>
            </div>
          </div>

          {/* Right Column: Narrative Story */}
          <div className="ps-about-narrative">
            <div className="ps-about-tag">HERITAGE & CRAFTSMANSHIP</div>
            <h2 className="ps-about-title">The Art of Pure Scent Alchemy</h2>
            <div className="ps-bestsellers-divider" style={{ margin: '0 0 20px 0' }} />

            <p className="ps-about-text">
              Born from a generational passion for oriental perfumery, <strong>PS PERFUMES</strong> bridges 
              centuries of master distillation with modern Parisian formulation. We believe that true fragrance is not merely an accessory—it is an invisible sovereign crown, a timeless whisper of identity and majesty.
            </p>

            <p className="ps-about-text">
              Each flacon is blended using the highest legal concentrations of natural extracts: wild harvested Assam agarwood, solar Italian bergamot, damask roses hand-picked at sunrise, and ethically sourced grey ambergris aged in seasoned casks.
            </p>

            {/* 4 Feature Highlights */}
            <div className="ps-about-pillars">
              <div className="ps-about-pillar">
                <div className="ps-pillar-icon-wrap">
                  <Award size={20} color="#c5a059" />
                </div>
                <div>
                  <h4 className="ps-pillar-title">Pure Extrait Concentration</h4>
                  <p className="ps-pillar-desc">30% to 40% perfume oil ratio guaranteeing exceptional 14+ hour performance.</p>
                </div>
              </div>

              <div className="ps-about-pillar">
                <div className="ps-pillar-icon-wrap">
                  <Compass size={20} color="#c5a059" />
                </div>
                <div>
                  <h4 className="ps-pillar-title">Rare Global Botanicals</h4>
                  <p className="ps-pillar-desc">Direct partnership with generational master distillers across Kannauj, Grasse, and Oman.</p>
                </div>
              </div>

              <div className="ps-about-pillar">
                <div className="ps-pillar-icon-wrap">
                  <ShieldCheck size={20} color="#c5a059" />
                </div>
                <div>
                  <h4 className="ps-pillar-title">Non-Alcoholic Pure Attars</h4>
                  <p className="ps-pillar-desc">Traditional hydro-distilled oils in pure sandalwood base with zero chemical solvents.</p>
                </div>
              </div>

              <div className="ps-about-pillar">
                <div className="ps-pillar-icon-wrap">
                  <HeartHandshake size={20} color="#c5a059" />
                </div>
                <div>
                  <h4 className="ps-pillar-title">Bespoke Flacon Packaging</h4>
                  <p className="ps-pillar-desc">Weighted crystal glass flacons topped with gold-plated zinc alloy magnetic caps.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
