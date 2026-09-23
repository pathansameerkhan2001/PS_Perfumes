import React, { useState, useEffect } from 'react';
import { X, Trash2, ShoppingBag, ArrowRight, ShieldCheck, Tag, Check, Truck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import './CartDrawer.css';

export default function CartDrawer() {
  const {
    cartItems,
    isCartOpen,
    setIsCartOpen,
    updateQuantity,
    removeFromCart,
    subtotal,
    freeShippingThreshold,
    shipping,
    discountAmount,
    discountPercent,
    promoCode,
    applyPromoCode,
    total,
    setIsCheckoutOpen,
    itemCount,
  } = useCart();

  const [inputCode, setInputCode] = useState('');
  const [promoFeedback, setPromoFeedback] = useState(null);

  useEffect(() => {
    if (isCartOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCartOpen]);

  if (!isCartOpen) return null;

  const handleApplyPromo = (e) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    const res = applyPromoCode(inputCode);
    setPromoFeedback(res);
  };

  const handleProceedCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const amountNeededForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const progressPercent = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));

  return (
    <div className="ps-cart-overlay" onClick={() => setIsCartOpen(false)}>
      <aside
        className="ps-cart-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping Bag"
      >
        {/* Drawer Header */}
        <div className="ps-cart-header">
          <div className="ps-cart-title-wrap">
            <ShoppingBag size={20} color="#c5a059" />
            <h2 className="ps-cart-title">YOUR SHOPPING BAG</h2>
            <span className="ps-cart-badge">{itemCount}</span>
          </div>
          <button
            type="button"
            className="ps-cart-close"
            onClick={() => setIsCartOpen(false)}
            aria-label="Close shopping bag"
          >
            <X size={20} />
          </button>
        </div>

        {/* Free Shipping Progress Bar */}
        <div className="ps-shipping-bar-container">
          <div className="ps-shipping-bar-text">
            <Truck size={14} color="#c5a059" />
            {amountNeededForFreeShipping > 0 ? (
              <span>
                Add <strong>${amountNeededForFreeShipping.toFixed(2)}</strong> more to enjoy <strong>Free Express Worldwide Delivery</strong>
              </span>
            ) : (
              <span className="ps-shipping-unlocked">
                🎉 Congratulations! You have unlocked <strong>Free Express Worldwide Delivery</strong>!
              </span>
            )}
          </div>
          <div className="ps-shipping-progress-track">
            <div
              className="ps-shipping-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Cart Items List */}
        <div className="ps-cart-items-body">
          {cartItems.length === 0 ? (
            <div className="ps-cart-empty">
              <div className="ps-cart-empty-icon">
                <ShoppingBag size={48} strokeWidth={1.2} color="#c5a059" />
              </div>
              <h3 className="ps-cart-empty-title">Your Bag Is Empty</h3>
              <p className="ps-cart-empty-desc">
                Discover our signature flacons and artisanal extractions to fill your wardrobe.
              </p>
              <button
                type="button"
                className="ps-cart-empty-btn"
                onClick={() => setIsCartOpen(false)}
              >
                EXPLORE BEST SELLERS
              </button>
            </div>
          ) : (
            <div className="ps-cart-items-list">
              {cartItems.map((item, index) => (
                <div key={`${item.product.id}-${item.size}-${index}`} className="ps-cart-item">
                  <div className="ps-cart-item-img-wrap">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="ps-cart-item-img"
                    />
                  </div>

                  <div className="ps-cart-item-details">
                    <div className="ps-cart-item-top">
                      <span className="ps-cart-item-brand">PS PERFUMES</span>
                      <button
                        type="button"
                        className="ps-cart-item-remove"
                        onClick={() => removeFromCart(item.product.id, item.size)}
                        aria-label="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <h4 className="ps-cart-item-title">{item.product.name}</h4>
                    <span className="ps-cart-item-size">Size: {item.size}</span>

                    <div className="ps-cart-item-bottom">
                      <div className="ps-cart-qty-ctrl">
                        <button
                          type="button"
                          className="ps-cart-qty-btn"
                          onClick={() => updateQuantity(item.product.id, item.size, item.quantity - 1)}
                        >
                          -
                        </button>
                        <span className="ps-cart-qty-num">{item.quantity}</span>
                        <button
                          type="button"
                          className="ps-cart-qty-btn"
                          onClick={() => updateQuantity(item.product.id, item.size, item.quantity + 1)}
                        >
                          +
                        </button>
                      </div>

                      <div className="ps-cart-item-price">
                        ${(item.product.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Drawer Footer Summary */}
        {cartItems.length > 0 && (
          <div className="ps-cart-footer">
            {/* Promo Code Input */}
            <form className="ps-cart-promo-form" onSubmit={handleApplyPromo}>
              <div className="ps-cart-promo-row">
                <div className="ps-cart-promo-input-wrap">
                  <Tag size={14} color="#888" className="ps-cart-promo-icon" />
                  <input
                    type="text"
                    placeholder="Promo code (e.g. PS10, WELCOME20)"
                    className="ps-cart-promo-input"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                  />
                </div>
                <button type="submit" className="ps-cart-promo-btn">
                  APPLY
                </button>
              </div>

              {promoFeedback && (
                <div className={`ps-promo-alert ${promoFeedback.success ? 'is-success' : 'is-error'}`}>
                  {promoFeedback.message}
                </div>
              )}
            </form>

            {/* Calculations Breakdown */}
            <div className="ps-cart-summary-breakdown">
              <div className="ps-summary-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="ps-summary-row ps-discount-row">
                  <span>Discount ({promoCode} - {discountPercent}%)</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="ps-summary-row">
                <span>Estimated Express Shipping</span>
                <span>{shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}</span>
              </div>

              <div className="ps-summary-row ps-total-row">
                <span>Estimated Total</span>
                <span className="ps-total-val">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Complimentary Gift Reassurance */}
            <div className="ps-cart-complimentary-note">
              <Check size={13} color="#10b981" />
              <span>Complimentary 2x2ml Travel Sample with Gold Box included</span>
            </div>

            {/* Checkout Action Button */}
            <button
              type="button"
              className="ps-cart-checkout-btn"
              onClick={handleProceedCheckout}
            >
              <span>PROCEED TO CHECKOUT • ${total.toFixed(2)}</span>
              <ArrowRight size={17} />
            </button>

            <button
              type="button"
              className="ps-cart-continue-btn"
              onClick={() => setIsCartOpen(false)}
            >
              Or Continue Shopping
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
