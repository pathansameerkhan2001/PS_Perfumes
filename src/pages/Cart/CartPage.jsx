import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ArrowRight, ShieldCheck, Tag, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatCurrency';
import './CartPage.css';

export default function CartPage() {
  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    clearCart,
    subtotal,
    shipping,
    discountAmount,
    total,
    promoCode,
    applyPromoCode,
    setIsCheckoutOpen,
  } = useCart();

  const [inputCode, setInputCode] = useState('');
  const [promoMessage, setPromoMessage] = useState(null);
  const navigate = useNavigate();

  const handleApply = (e) => {
    e.preventDefault();
    if (!inputCode) return;
    const res = applyPromoCode(inputCode);
    setPromoMessage(res);
  };

  if (cartItems.length === 0) {
    return (
      <div className="ps-cart-page-empty">
        <div className="ps-cart-empty-inner">
          <ShoppingBag size={56} color="#c8a45d" className="ps-empty-bag-icon" />
          <h1 className="ps-cart-empty-title">Your Fragrance Bag is Empty</h1>
          <p className="ps-cart-empty-desc">
            Explore our artisanal attars, pure extraits, and sacred oud collections to fill your bag with timeless luxury.
          </p>
          <Link to="/shop" className="ps-btn-gold-primary">
            EXPLORE COLLECTION
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-cart-page">
      <div className="ps-cart-container">
        <div className="ps-cart-header">
          <h1 className="ps-cart-title">Your Fragrance Bag</h1>
          <span className="ps-cart-count">
            {cartItems.reduce((acc, it) => acc + it.quantity, 0)} Items
          </span>
        </div>

        <div className="ps-cart-grid">
          {/* Items List */}
          <div className="ps-cart-items-col">
            <div className="ps-cart-table-head">
              <span>Product</span>
              <span>Price</span>
              <span>Quantity</span>
              <span>Subtotal</span>
            </div>

            <div className="ps-cart-items-list">
              {cartItems.map((item, idx) => {
                const prod = item.product || item;
                const img = item.image || prod.main_image || prod.image || '/assets/prod-royal-amber.webp';
                const itemPrice = Number(item.price) || Number(prod.price) || 0;
                const lineTotal = itemPrice * item.quantity;
                const identifier = item.cartItemId || item.variant_id || item.size_ml || item.size;

                return (
                  <div key={`${prod.id}-${identifier}-${idx}`} className="ps-cart-row">
                    <div className="ps-cart-product-cell">
                      <img src={img} alt={item.name || prod.name} className="ps-cart-item-thumb" />
                      <div className="ps-cart-item-meta">
                        <Link to={`/product/${prod.slug || prod.id}`} className="ps-cart-item-name">
                          {item.name || prod.name}
                        </Link>
                        <span className="ps-cart-item-size">
                          {item.bottle_type ? `${item.bottle_type} • ${item.size_ml || item.size}` : `Volume: ${item.size || item.size_ml}`}
                        </span>
                        <button
                          type="button"
                          className="ps-cart-remove-mobile-btn"
                          onClick={() => removeFromCart(prod.id, identifier)}
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    <div className="ps-cart-price-cell">
                      {formatINR(itemPrice)}
                    </div>

                    <div className="ps-cart-qty-cell">
                      <div className="ps-cart-qty-ctrl">
                        <button
                          type="button"
                          onClick={() => updateQuantity(prod.id, identifier, item.quantity - 1)}
                        >
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(prod.id, identifier, item.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="ps-cart-total-cell">
                      <strong>{formatINR(lineTotal)}</strong>
                      <button
                        type="button"
                        className="ps-cart-remove-desktop-btn"
                        onClick={() => removeFromCart(prod.id, identifier)}
                        aria-label="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="ps-cart-actions-row">
              <Link to="/shop" className="ps-cart-continue-link">
                <ArrowLeft size={14} />
                <span>Continue Shopping</span>
              </Link>
              <button
                type="button"
                className="ps-cart-clear-btn"
                onClick={clearCart}
              >
                Clear Bag
              </button>
            </div>
          </div>

          {/* Order Summary */}
          <div className="ps-cart-summary-col">
            <div className="ps-cart-summary-card">
              <h2 className="ps-summary-heading">Order Summary</h2>

              {/* Promo Code Form */}
              <form className="ps-summary-promo-form" onSubmit={handleApply}>
                <div className="ps-promo-input-wrap">
                  <Tag size={15} color="#c8a45d" />
                  <input
                    type="text"
                    placeholder="Enter Coupon (e.g. PS10, WELCOME20)"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                  />
                  <button type="submit">Apply</button>
                </div>
                {promoMessage && (
                  <p className={`ps-promo-feedback ${promoMessage.success ? 'is-valid' : 'is-err'}`}>
                    {promoMessage.message}
                  </p>
                )}
                {promoCode && (
                  <span className="ps-active-code-tag">
                    Active Code: <strong>{promoCode}</strong>
                  </span>
                )}
              </form>

              {/* Cost Breakdown */}
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
                  <span>Shipping (Pan-India)</span>
                  <span>{shipping === 0 ? 'FREE' : formatINR(shipping)}</span>
                </div>
                <div className="ps-summary-line ps-summary-total">
                  <span>Total</span>
                  <span>{formatINR(total)}</span>
                </div>
              </div>

              {/* Checkout CTA */}
              <button
                type="button"
                className="ps-btn-gold-primary ps-summary-checkout-btn"
                onClick={() => navigate('/checkout')}
              >
                <span>PROCEED TO CHECKOUT</span>
                <ArrowRight size={16} />
              </button>

              <div className="ps-summary-guarantee">
                <ShieldCheck size={16} color="#c8a45d" />
                <span>100% Secure Checkout & Original Guarantee</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
