import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatCurrency';
import { createOrder } from '../../services/orders';
import './CheckoutPage.css';

export default function CheckoutPage() {
  const { cartItems, subtotal, shipping, discountAmount, total, clearCart } = useCart();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: 'Andhra Pradesh',
    pincode: '',
    landmark: '',
    paymentMethod: 'COD',
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(null);

  const validate = () => {
    const errs = {};
    if (!formData.firstName.trim()) errs.firstName = 'First name is required';
    if (!formData.lastName.trim()) errs.lastName = 'Last name is required';
    if (!formData.phone.trim() || formData.phone.length < 10) errs.phone = 'Valid 10-digit phone number is required';
    if (!formData.email.trim() || !formData.email.includes('@')) errs.email = 'Valid email is required';
    if (!formData.address.trim()) errs.address = 'Delivery address is required';
    if (!formData.city.trim()) errs.city = 'City is required';
    if (!formData.state.trim()) errs.state = 'State is required';
    if (!formData.pincode.trim() || formData.pincode.length < 6) errs.pincode = 'Valid 6-digit Pincode is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (cartItems.length === 0) return;

    setSubmitting(true);
    try {
      const orderPayload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        landmark: formData.landmark,
        paymentMethod: formData.paymentMethod,
        subtotal,
        shipping,
        discountAmount,
        total,
        items: cartItems,
      };

      const result = await createOrder(orderPayload);
      if (result.order) {
        setOrderConfirmed(result.order);
        clearCart();
      }
    } catch {
      setErrors({ form: 'An error occurred while confirming order. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (orderConfirmed) {
    return (
      <div className="ps-checkout-success-page">
        <div className="ps-checkout-success-card">
          <CheckCircle2 size={56} color="#c8a45d" className="ps-success-icon" />
          <span className="ps-success-tag">ROYAL DISPATCH CONFIRMED</span>
          <h1 className="ps-success-title">Thank You For Your Patronage</h1>
          <p className="ps-success-order-num">
            Order Reference: <strong>{orderConfirmed.order_number}</strong>
          </p>
          <p className="ps-success-text">
            Your flacons are being hand-prepared and sealed in our Kadapa atelier. A confirmation receipt has been dispatched to <strong>{orderConfirmed.email}</strong>.
          </p>
          <div className="ps-success-details">
            <div className="ps-success-row">
              <span>Delivery To:</span>
              <span>{orderConfirmed.customer_name}</span>
            </div>
            <div className="ps-success-row">
              <span>Destination:</span>
              <span>{orderConfirmed.shipping_address?.city}, {orderConfirmed.shipping_address?.pincode}</span>
            </div>
            <div className="ps-success-row">
              <span>Total Amount:</span>
              <strong>{formatINR(orderConfirmed.total)}</strong>
            </div>
            <div className="ps-success-row">
              <span>Payment Mode:</span>
              <span>{orderConfirmed.payment_method}</span>
            </div>
          </div>
          <Link to="/" className="ps-btn-gold-primary ps-success-home-btn">
            RETURN TO ATELIER HOME
          </Link>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="ps-checkout-empty">
        <h2>No Items to Checkout</h2>
        <p>Please select your preferred perfumes before checking out.</p>
        <Link to="/shop" className="ps-btn-gold-primary">
          EXPLORE CATALOG
        </Link>
      </div>
    );
  }

  return (
    <div className="ps-checkout-page">
      <div className="ps-checkout-container">
        <div className="ps-checkout-header">
          <Link to="/cart" className="ps-checkout-back-link">
            <ArrowLeft size={16} />
            <span>Return to Bag</span>
          </Link>
          <h1 className="ps-checkout-title">Express Secure Checkout</h1>
          <div className="ps-checkout-secure-badge">
            <Lock size={14} color="#c8a45d" />
            <span>Encrypted 256-Bit SSL</span>
          </div>
        </div>

        <form onSubmit={handlePlaceOrder} className="ps-checkout-grid">
          {/* Left Column: Delivery & Payment Details */}
          <div className="ps-checkout-form-col">
            {/* Step 1: Contact Information */}
            <div className="ps-checkout-card">
              <h2 className="ps-checkout-card-title">1. Patron Contact Information</h2>
              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="chk-fname">First Name *</label>
                  <input
                    id="chk-fname"
                    type="text"
                    placeholder="Sameer"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                  {errors.firstName && <span className="ps-field-err">{errors.firstName}</span>}
                </div>

                <div className="ps-form-group">
                  <label htmlFor="chk-lname">Last Name *</label>
                  <input
                    id="chk-lname"
                    type="text"
                    placeholder="Khan"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                  {errors.lastName && <span className="ps-field-err">{errors.lastName}</span>}
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="chk-phone">Mobile Phone (for delivery SMS) *</label>
                  <input
                    id="chk-phone"
                    type="tel"
                    placeholder="+91 94949 51600"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  {errors.phone && <span className="ps-field-err">{errors.phone}</span>}
                </div>

                <div className="ps-form-group">
                  <label htmlFor="chk-email">Email Address (for order tracking) *</label>
                  <input
                    id="chk-email"
                    type="email"
                    placeholder="brandnix.in@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                  {errors.email && <span className="ps-field-err">{errors.email}</span>}
                </div>
              </div>
            </div>

            {/* Step 2: Shipping Destination */}
            <div className="ps-checkout-card">
              <h2 className="ps-checkout-card-title">2. Shipping Destination (Pan-India)</h2>

              <div className="ps-form-group">
                <label htmlFor="chk-address">Street Address, Suite / Flat / House *</label>
                <input
                  id="chk-address"
                  type="text"
                  placeholder="7/242 Royal Enclave, Near RTC Bus Stand"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
                {errors.address && <span className="ps-field-err">{errors.address}</span>}
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="chk-city">City *</label>
                  <input
                    id="chk-city"
                    type="text"
                    placeholder="Kadapa"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                  {errors.city && <span className="ps-field-err">{errors.city}</span>}
                </div>

                <div className="ps-form-group">
                  <label htmlFor="chk-state">State *</label>
                  <input
                    id="chk-state"
                    type="text"
                    placeholder="Andhra Pradesh"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                  {errors.state && <span className="ps-field-err">{errors.state}</span>}
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="chk-pincode">Postal PIN Code *</label>
                  <input
                    id="chk-pincode"
                    type="text"
                    placeholder="516001"
                    maxLength={6}
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  />
                  {errors.pincode && <span className="ps-field-err">{errors.pincode}</span>}
                </div>

                <div className="ps-form-group">
                  <label htmlFor="chk-landmark">Landmark (Optional)</label>
                  <input
                    id="chk-landmark"
                    type="text"
                    placeholder="Opposite Grand Palace"
                    value={formData.landmark}
                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Step 3: Payment Preference */}
            <div className="ps-checkout-card">
              <h2 className="ps-checkout-card-title">3. Payment Method</h2>
              <div className="ps-payment-options-grid">
                <label className={`ps-payment-option ${formData.paymentMethod === 'COD' ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={formData.paymentMethod === 'COD'}
                    onChange={() => setFormData({ ...formData, paymentMethod: 'COD' })}
                  />
                  <div className="ps-payment-text">
                    <strong>Cash on Delivery (COD)</strong>
                    <span>Pay in cash or UPI upon package inspection</span>
                  </div>
                </label>

                <label className={`ps-payment-option ${formData.paymentMethod === 'ONLINE' ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE"
                    checked={formData.paymentMethod === 'ONLINE'}
                    onChange={() => setFormData({ ...formData, paymentMethod: 'ONLINE' })}
                  />
                  <div className="ps-payment-text">
                    <strong>Instant UPI / Card / NetBanking</strong>
                    <span>Fast prepaid checkout via secure gateway</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary & Place Order */}
          <div className="ps-checkout-summary-col">
            <div className="ps-checkout-summary-card">
              <h2 className="ps-summary-heading">Order Breakdown</h2>

              <div className="ps-checkout-items-list">
                {cartItems.map((item, idx) => (
                  <div key={idx} className="ps-checkout-item-mini">
                    <img
                      src={item.product.main_image || item.product.image}
                      alt={item.product.name}
                      className="ps-mini-thumb"
                    />
                    <div className="ps-mini-info">
                      <span className="ps-mini-name">{item.product.name}</span>
                      <span className="ps-mini-size">{item.size} • Qty: {item.quantity}</span>
                    </div>
                    <span className="ps-mini-price">
                      {formatINR(item.product.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="ps-summary-breakdown">
                <div className="ps-summary-line">
                  <span>Subtotal</span>
                  <span>{formatINR(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="ps-summary-line ps-discount-line">
                    <span>Discount</span>
                    <span>-{formatINR(discountAmount)}</span>
                  </div>
                )}
                <div className="ps-summary-line">
                  <span>Pan-India Air Shipping</span>
                  <span>{shipping === 0 ? 'FREE' : formatINR(shipping)}</span>
                </div>
                <div className="ps-summary-line ps-summary-total">
                  <span>Total Due</span>
                  <span>{formatINR(total)}</span>
                </div>
              </div>

              {errors.form && <div className="ps-form-error-banner">{errors.form}</div>}

              <button
                type="submit"
                className="ps-btn-gold-primary ps-place-order-btn"
                disabled={submitting}
              >
                {submitting ? (
                  <span>CONFIRMING DISPATCH...</span>
                ) : (
                  <span>PLACE ORDER ({formatINR(total)})</span>
                )}
              </button>

              <div className="ps-checkout-reassurance">
                <ShieldCheck size={16} color="#c8a45d" />
                <span>100% Genuine Artisanal Perfumes Guarantee</span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
