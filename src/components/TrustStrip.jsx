import React, { useState } from 'react';
import { Truck, ShieldCheck, Gift, Headphones, Send, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';
import './Sections.css';

export default function TrustStrip() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (email && email.includes('@')) {
      setSubscribed(true);
      setTimeout(() => {
        setEmail('');
        setSubscribed(false);
      }, 4000);
    }
  };

  const TRUST_ITEMS = [
    {
      icon: Truck,
      title: 'Free Express Delivery',
      desc: 'Complimentary express delivery across India on orders over ₹999',
    },
    {
      icon: ShieldCheck,
      title: '100% Authentic & Pure',
      desc: 'Extracted with organic botanicals & aged natural agarwood',
    },
    {
      icon: Gift,
      title: 'Luxury Gift Packaging',
      desc: 'Signature gold-foiled coffret with silk pull ribbon',
    },
    {
      icon: Headphones,
      title: 'Fragrance Concierge',
      desc: 'Personalized scent consultations 7 days a week',
    },
  ];

  return (
    <section id="trust-strip" className="ps-trust-section" aria-label="Customer Reassurance & Newsletter">
      {/* 4 Trust Pillars */}
      <div className="ps-trust-container">
        <div className="ps-trust-grid">
          {TRUST_ITEMS.map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <div key={idx} className="ps-trust-card">
                <div className="ps-trust-icon-box">
                  <IconComponent size={24} color="#c5a059" strokeWidth={1.8} />
                </div>
                <div className="ps-trust-text">
                  <h4 className="ps-trust-title">{item.title}</h4>
                  <p className="ps-trust-desc">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Newsletter VIP Club Banner */}
      <div className="ps-newsletter-strip">
        <div className="ps-newsletter-inner">
          <div className="ps-newsletter-text">
            <span className="ps-newsletter-tag">EXCLUSIVE INVITATION</span>
            <h3 className="ps-newsletter-title">Join The PS Perfumes Connoisseurs Club</h3>
            <p className="ps-newsletter-desc">
              Subscribe to receive private release access, secret seasonal extractions, and 15% off your inaugural flacon.
            </p>
          </div>

          <form className="ps-newsletter-form" onSubmit={handleSubscribe}>
            <div className="ps-newsletter-input-group">
              <input
                type="email"
                placeholder="Enter your email address..."
                className="ps-newsletter-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                className={`ps-newsletter-submit ${subscribed ? 'is-success' : ''}`}
              >
                {subscribed ? (
                  <>
                    <Check size={16} />
                    <span>SUBSCRIBED</span>
                  </>
                ) : (
                  <>
                    <span>JOIN ATELIER</span>
                    <Send size={15} />
                  </>
                )}
              </button>
            </div>
            {subscribed && (
              <p className="ps-newsletter-success-msg">
                Welcome to the Atelier. Use code <strong>WELCOME20</strong> for 20% off your first order!
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
