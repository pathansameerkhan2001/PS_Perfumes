import React, { useState, useEffect } from 'react';
import { X, Check, ShieldCheck, Truck, CreditCard, Lock, ArrowLeft, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import brandLogo from '../assets/ps-perfumes-logo.png';
import './CheckoutModal.css';

export default function CheckoutModal() {
  const {
    cartItems,
    isCheckoutOpen,
    setIsCheckoutOpen,
    subtotal,
    shipping,
    discountAmount,
    promoCode,
    total,
    clearCart,
  } = useCart();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: 'Alexander',
    lastName: 'Wright',
    email: 'alexander.wright@luxury.com',
    phone: '+1 (555) 389-2041',
    address: '740 Park Avenue, Apt 14B',
    city: 'New York',
    state: 'NY',
    postalCode: '10021',
    country: 'United States',
    shippingMethod: 'standard',
    paymentMethod: 'card',
    cardNumber: '•••• •••• •••• 4242',
    cardExp: '12/28',
    cardCvc: '888',
    specialNotes: 'Please deliver in silk gift wrap with ribbon.',
  });

  const [orderId, setOrderId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isCheckoutOpen) {
      document.body.style.overflow = 'hidden';
      setStep(1);
      setOrderId(`PS-${Math.floor(100000 + Math.random() * 900000)}`);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCheckoutOpen]);

  if (!isCheckoutOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePlaceOrder = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep(4);
      clearCart();
    }, 1200);
  };

  const shippingCost = formData.shippingMethod === 'priority' ? 25 : shipping;
  const finalTotal = Math.max(0, subtotal - discountAmount + shippingCost);

  return (
    <div className="ps-checkout-overlay" onClick={() => setIsCheckoutOpen(false)}>
      <div
        className="ps-checkout-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Secure Luxury Checkout"
      >
        {/* Header */}
        <div className="ps-checkout-header">
          <div className="ps-checkout-brand">
            <img src={brandLogo} alt="PS PERFUMES" className="ps-checkout-logo" />
            <div className="ps-checkout-secure-badge">
              <Lock size={12} color="#c5a059" />
              <span>256-BIT ENCRYPTED CHECKOUT</span>
            </div>
          </div>
          <button
            type="button"
            className="ps-checkout-close"
            onClick={() => setIsCheckoutOpen(false)}
            aria-label="Close checkout"
          >
            <X size={20} />
          </button>
        </div>

        {/* Multi-Step Indicator */}
        {step < 4 && (
          <div className="ps-checkout-steps">
            <div className={`ps-step-item ${step >= 1 ? 'is-active' : ''}`}>
              <span className="ps-step-num">1</span>
              <span className="ps-step-label">Shipping</span>
            </div>
            <div className="ps-step-line" />
            <div className={`ps-step-item ${step >= 2 ? 'is-active' : ''}`}>
              <span className="ps-step-num">2</span>
              <span className="ps-step-label">Delivery</span>
            </div>
            <div className="ps-step-line" />
            <div className={`ps-step-item ${step >= 3 ? 'is-active' : ''}`}>
              <span className="ps-step-num">3</span>
              <span className="ps-step-label">Payment</span>
            </div>
          </div>
        )}

        <div className="ps-checkout-grid">
          {/* Main Form Area */}
          <div className="ps-checkout-main">
            {/* Step 1: Customer Contact & Shipping Address */}
            {step === 1 && (
              <div className="ps-step-pane">
                <h3 className="ps-pane-title">1. Delivery Address & Contact</h3>
                <div className="ps-form-grid">
                  <div className="ps-field-col">
                    <label className="ps-label">FIRST NAME</label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      className="ps-input"
                      required
                    />
                  </div>
                  <div className="ps-field-col">
                    <label className="ps-label">LAST NAME</label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="ps-input"
                      required
                    />
                  </div>
                  <div className="ps-field-col ps-col-full">
                    <label className="ps-label">EMAIL ADDRESS (FOR DISPATCH TRACKING)</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="ps-input"
                      required
                    />
                  </div>
                  <div className="ps-field-col ps-col-full">
                    <label className="ps-label">STREET ADDRESS / RESIDENCE</label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="ps-input"
                      required
                    />
                  </div>
                  <div className="ps-field-col">
                    <label className="ps-label">CITY</label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="ps-input"
                      required
                    />
                  </div>
                  <div className="ps-field-col">
                    <label className="ps-label">POSTAL / ZIP CODE</label>
                    <input
                      type="text"
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleChange}
                      className="ps-input"
                      required
                    />
                  </div>
                  <div className="ps-field-col">
                    <label className="ps-label">COUNTRY / REGION</label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="ps-input ps-select"
                    >
                      <option value="United States">United States</option>
                      <option value="United Arab Emirates">United Arab Emirates</option>
                      <option value="India">India</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="Saudi Arabia">Saudi Arabia</option>
                      <option value="Canada">Canada</option>
                      <option value="Australia">Australia</option>
                    </select>
                  </div>
                  <div className="ps-field-col">
                    <label className="ps-label">PHONE NUMBER (FOR COURIER)</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="ps-input"
                      required
                    />
                  </div>
                </div>

                <div className="ps-pane-actions">
                  <button
                    type="button"
                    className="ps-btn-primary"
                    onClick={() => setStep(2)}
                  >
                    <span>CONTINUE TO DELIVERY</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Shipping Method */}
            {step === 2 && (
              <div className="ps-step-pane">
                <h3 className="ps-pane-title">2. Choose Delivery Method</h3>
                <div className="ps-shipping-options">
                  <label className={`ps-shipping-choice ${formData.shippingMethod === 'standard' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="shippingMethod"
                      value="standard"
                      checked={formData.shippingMethod === 'standard'}
                      onChange={handleChange}
                    />
                    <div className="ps-choice-info">
                      <strong>Insured Express Worldwide Courier</strong>
                      <span>Estimated delivery: 3 to 5 business days with tamper-proof seal</span>
                    </div>
                    <span className="ps-choice-price">
                      {shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}
                    </span>
                  </label>

                  <label className={`ps-shipping-choice ${formData.shippingMethod === 'priority' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="shippingMethod"
                      value="priority"
                      checked={formData.shippingMethod === 'priority'}
                      onChange={handleChange}
                    />
                    <div className="ps-choice-info">
                      <strong>Atelier White-Glove VIP Courier</strong>
                      <span>Hand-delivered in velvet temperature-controlled case within 48-72h</span>
                    </div>
                    <span className="ps-choice-price">$25.00</span>
                  </label>
                </div>

                <div className="ps-field-col ps-col-full" style={{ marginTop: '20px' }}>
                  <label className="ps-label">GIFT WRAP & CONCIERGE INSTRUCTIONS (OPTIONAL)</label>
                  <textarea
                    name="specialNotes"
                    value={formData.specialNotes}
                    onChange={handleChange}
                    className="ps-input ps-textarea"
                    rows={3}
                  />
                </div>

                <div className="ps-pane-actions">
                  <button
                    type="button"
                    className="ps-btn-secondary"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft size={16} />
                    <span>BACK</span>
                  </button>
                  <button
                    type="button"
                    className="ps-btn-primary"
                    onClick={() => setStep(3)}
                  >
                    <span>CONTINUE TO PAYMENT</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Payment Method */}
            {step === 3 && (
              <div className="ps-step-pane">
                <h3 className="ps-pane-title">3. Secure Payment</h3>
                <div className="ps-payment-methods">
                  <label className={`ps-pay-method ${formData.paymentMethod === 'card' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      checked={formData.paymentMethod === 'card'}
                      onChange={handleChange}
                    />
                    <CreditCard size={18} color="#c5a059" />
                    <strong>Credit / Debit Card</strong>
                  </label>

                  <label className={`ps-pay-method ${formData.paymentMethod === 'upi' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="upi"
                      checked={formData.paymentMethod === 'upi'}
                      onChange={handleChange}
                    />
                    <Sparkles size={18} color="#c5a059" />
                    <strong>Instant UPI / Apple Pay</strong>
                  </label>

                  <label className={`ps-pay-method ${formData.paymentMethod === 'cod' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cod"
                      checked={formData.paymentMethod === 'cod'}
                      onChange={handleChange}
                    />
                    <Truck size={18} color="#c5a059" />
                    <strong>Cash on Delivery</strong>
                  </label>
                </div>

                {formData.paymentMethod === 'card' && (
                  <div className="ps-card-inputs">
                    <div className="ps-field-col ps-col-full">
                      <label className="ps-label">CARD NUMBER</label>
                      <input
                        type="text"
                        name="cardNumber"
                        value={formData.cardNumber}
                        onChange={handleChange}
                        className="ps-input"
                      />
                    </div>
                    <div className="ps-form-grid" style={{ marginTop: '12px' }}>
                      <div className="ps-field-col">
                        <label className="ps-label">EXPIRY DATE</label>
                        <input
                          type="text"
                          name="cardExp"
                          value={formData.cardExp}
                          onChange={handleChange}
                          className="ps-input"
                        />
                      </div>
                      <div className="ps-field-col">
                        <label className="ps-label">SECURITY CODE (CVC)</label>
                        <input
                          type="text"
                          name="cardCvc"
                          value={formData.cardCvc}
                          onChange={handleChange}
                          className="ps-input"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="ps-security-callout">
                  <ShieldCheck size={18} color="#10b981" />
                  <span>Your payment information is encrypted and never stored on servers.</span>
                </div>

                <div className="ps-pane-actions">
                  <button
                    type="button"
                    className="ps-btn-secondary"
                    onClick={() => setStep(2)}
                  >
                    <ArrowLeft size={16} />
                    <span>BACK</span>
                  </button>
                  <button
                    type="button"
                    className="ps-btn-primary ps-place-order-btn"
                    onClick={handlePlaceOrder}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <span>AUTHENTICATING PAYMENT...</span>
                    ) : (
                      <>
                        <Lock size={15} />
                        <span>AUTHORIZE ORDER • ${finalTotal.toFixed(2)}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Order Confirmation & Receipt */}
            {step === 4 && (
              <div className="ps-confirmation-pane">
                <div className="ps-confirmation-badge">
                  <CheckCircle2 size={56} color="#10b981" />
                </div>
                <h3 className="ps-confirm-heading">Order Placed Successfully!</h3>
                <p className="ps-confirm-sub">
                  Thank you, <strong>{formData.firstName}</strong>. Your flacons are now being carefully inspected, boxed in gold coffrets, and prepared for dispatch.
                </p>

                <div className="ps-order-receipt-card">
                  <div className="ps-receipt-row">
                    <span>ORDER NUMBER</span>
                    <strong>{orderId}</strong>
                  </div>
                  <div className="ps-receipt-row">
                    <span>CONFIRMATION SENT TO</span>
                    <strong>{formData.email}</strong>
                  </div>
                  <div className="ps-receipt-row">
                    <span>DISPATCH ADDRESS</span>
                    <span>{formData.address}, {formData.city}, {formData.postalCode}</span>
                  </div>
                  <div className="ps-receipt-row">
                    <span>ESTIMATED DELIVERY</span>
                    <strong>3 – 5 Business Days</strong>
                  </div>
                  <div className="ps-receipt-row ps-receipt-total">
                    <span>AMOUNT PAID</span>
                    <strong className="ps-paid-amount">${finalTotal.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="ps-confirm-actions">
                  <button
                    type="button"
                    className="ps-btn-primary"
                    onClick={() => setIsCheckoutOpen(false)}
                  >
                    RETURN TO ATELIER
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Order Summary Sidebar */}
          <div className="ps-checkout-sidebar">
            <h4 className="ps-sidebar-title">ORDER SUMMARY ({cartItems.length} ITEMS)</h4>

            <div className="ps-sidebar-items">
              {cartItems.map((item, idx) => (
                <div key={idx} className="ps-sidebar-item">
                  <div className="ps-sidebar-thumb">
                    <img src={item.product.image} alt={item.product.name} />
                    <span className="ps-thumb-qty">{item.quantity}</span>
                  </div>
                  <div className="ps-sidebar-item-info">
                    <h5 className="ps-sidebar-item-name">{item.product.name}</h5>
                    <span className="ps-sidebar-item-size">{item.size}</span>
                  </div>
                  <span className="ps-sidebar-item-price">
                    ${(item.product.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="ps-sidebar-totals">
              <div className="ps-sidebar-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="ps-sidebar-row ps-discount-text">
                  <span>Discount ({promoCode})</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="ps-sidebar-row">
                <span>Shipping</span>
                <span>{shippingCost === 0 ? 'FREE' : `$${shippingCost.toFixed(2)}`}</span>
              </div>
              <div className="ps-sidebar-row ps-sidebar-total-row">
                <span>Grand Total</span>
                <span className="ps-grand-total">${finalTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="ps-sidebar-perk">
              <Sparkles size={14} color="#c5a059" />
              <span>Includes 2 complimentary tester vials + gold foiled box</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
