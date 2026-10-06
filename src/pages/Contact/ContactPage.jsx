import React, { useState } from 'react';
import { MapPin, Mail, ExternalLink, Send, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { submitEnquiry } from '../../services/enquiries';
import './ContactPage.css';

function InstagramIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await submitEnquiry(formData);
      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch {
      setErrorMsg('Unable to transmit enquiry. Please reach out via email or Instagram.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ps-contact-page">
      <div className="ps-contact-hero-banner">
        <div className="ps-contact-hero-inner">
          <span className="ps-contact-tag">ATELIER CONCIERGE</span>
          <h1 className="ps-contact-title">Connect With PS Perfumes</h1>
          <p className="ps-contact-sub">
            Inquire about bespoke bridal extractions, corporate luxury gifting, or personal fragrance consultations.
          </p>
        </div>
      </div>

      <div className="ps-contact-container">
        <div className="ps-contact-grid">
          {/* Left Column: Direct Atelier Information */}
          <div className="ps-contact-info-col">
            <span className="ps-section-eyebrow">FLAGSHIP SANCTUARY</span>
            <h2 className="ps-contact-section-title">The Kadapa Boutique</h2>
            <p className="ps-contact-desc">
              Experience the physical presence of our sovereign extractions in Kadapa, Andhra Pradesh.
            </p>

            <div className="ps-contact-cards-list">
              {/* Address */}
              <div className="ps-contact-card">
                <div className="ps-contact-icon-box">
                  <MapPin size={20} color="#c8a45d" />
                </div>
                <div className="ps-contact-card-text">
                  <strong>Atelier Address</strong>
                  <p>
                    PS PERFUMES<br />
                    Kadapa, Andhra Pradesh – 516001, India
                  </p>
                  <a
                    href="https://share.google/b0yildKJKTaGc365J"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ps-contact-link-with-icon"
                  >
                    <span>View Location on Google Maps</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              {/* Email */}
              <div className="ps-contact-card">
                <div className="ps-contact-icon-box">
                  <Mail size={20} color="#c8a45d" />
                </div>
                <div className="ps-contact-card-text">
                  <strong>Direct Concierge Email</strong>
                  <a href="mailto:brandnix.in@gmail.com" className="ps-contact-email-link">
                    brandnix.in@gmail.com
                  </a>
                  <span>Response delivered within 1 business day</span>
                </div>
              </div>

              {/* Instagram */}
              <div className="ps-contact-card">
                <div className="ps-contact-icon-box">
                  <InstagramIcon size={20} />
                </div>
                <div className="ps-contact-card-text">
                  <strong>Official Instagram Journal</strong>
                  <a
                    href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ps-contact-link-with-icon"
                  >
                    <span>@ps_perfumes_kadapa</span>
                    <ExternalLink size={13} />
                  </a>
                  <span>Daily updates, customer reviews & live reels</span>
                </div>
              </div>

              {/* Atelier Hours */}
              <div className="ps-contact-card">
                <div className="ps-contact-icon-box">
                  <Clock size={20} color="#c8a45d" />
                </div>
                <div className="ps-contact-card-text">
                  <strong>Boutique & Shipping Hours</strong>
                  <p>Monday – Saturday: 10:00 AM – 9:00 PM IST<br />Sunday: 11:00 AM – 8:00 PM IST</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Enquiry Form */}
          <div className="ps-contact-form-col">
            <div className="ps-contact-form-card">
              <span className="ps-section-eyebrow">PRIVATE ENQUIRY</span>
              <h2 className="ps-contact-form-title">Send a Dispatch to the Atelier</h2>

              {submitted ? (
                <div className="ps-contact-success-state">
                  <CheckCircle2 size={48} color="#22c55e" className="ps-success-icon" />
                  <h3>Enquiry Transmitted Successfully</h3>
                  <p>
                    Thank you for reaching out to PS PERFUMES. Our fragrance concierge will review your message and contact you promptly.
                  </p>
                  <button
                    type="button"
                    className="ps-btn-gold-primary"
                    onClick={() => setSubmitted(false)}
                  >
                    SEND ANOTHER INQUIRY
                  </button>
                </div>
              ) : (
                <form className="ps-contact-form" onSubmit={handleSubmit}>
                  {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}

                  <div className="ps-form-row">
                    <div className="ps-form-group">
                      <label htmlFor="contact-name">Full Name *</label>
                      <input
                        id="contact-name"
                        type="text"
                        placeholder="e.g. Sameer Khan"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="ps-form-group">
                      <label htmlFor="contact-email">Email Address *</label>
                      <input
                        id="contact-email"
                        type="email"
                        placeholder="you@domain.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="ps-form-row">
                    <div className="ps-form-group">
                      <label htmlFor="contact-phone">Phone Number (Optional)</label>
                      <input
                        id="contact-phone"
                        type="tel"
                        placeholder="+91 94949 51600"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>

                    <div className="ps-form-group">
                      <label htmlFor="contact-subject">Topic / Subject</label>
                      <input
                        id="contact-subject"
                        type="text"
                        placeholder="e.g. Wedding Attar Order or Scent Advice"
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="ps-form-group">
                    <label htmlFor="contact-message">Message *</label>
                    <textarea
                      id="contact-message"
                      rows="5"
                      placeholder="Share your inquiry or fragrance request with our masters..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="ps-btn-gold-primary ps-contact-submit-btn"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <span>TRANSMITTING...</span>
                    ) : (
                      <>
                        <span>TRANSMIT ENQUIRY</span>
                        <Send size={15} />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
