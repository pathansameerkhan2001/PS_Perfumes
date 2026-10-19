import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSiteSettings } from '../services/settings';
import { validateCouponCode, computeCouponDiscount } from '../services/coupons';

// Shipping rule used until Store Settings has saved values in the database
const DEFAULT_FREE_SHIPPING_THRESHOLD = 1500;
const DEFAULT_SHIPPING_FEE = 99;

const CartContext = createContext(null);

export function CartProvider({ children }) {
  // Cart state persisted in localStorage
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem('ps_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Wishlist state persisted in localStorage
  const [wishlist, setWishlist] = useState(() => {
    try {
      const saved = localStorage.getItem('ps_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modal & Drawer visibility
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Promo code state
  // Coupon validated by the database (validate_coupon); null when none is applied
  const [appliedCoupon, setAppliedCoupon] = useState(null);

  // Toast / notification feedback
  const [toastMessage, setToastMessage] = useState(null);

  // Shipping rule: values saved in Admin → Store Settings override the defaults
  const [shippingRule, setShippingRule] = useState({
    threshold: DEFAULT_FREE_SHIPPING_THRESHOLD,
    fee: DEFAULT_SHIPPING_FEE,
  });

  useEffect(() => {
    let mounted = true;
    getSiteSettings()
      .then((s) => {
        if (!mounted || !s) return;
        const stored = new Set(s._storedKeys || []);
        setShippingRule((prev) => ({
          threshold: stored.has('free_shipping_threshold') ? Number(s.free_shipping_threshold) || 0 : prev.threshold,
          fee: stored.has('standard_shipping_fee') ? Number(s.standard_shipping_fee) || 0 : prev.fee,
        }));
      })
      .catch((err) => console.error('Could not load shipping settings:', err));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('ps_cart', JSON.stringify(cartItems));
    } catch (e) {
      console.error(e);
    }
  }, [cartItems]);

  useEffect(() => {
    try {
      localStorage.setItem('ps_wishlist', JSON.stringify(wishlist));
    } catch (e) {
      console.error(e);
    }
  }, [wishlist]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  /**
   * Helper to normalize bottle type string
   */
  const normalizeBottleType = (bt) => {
    if (!bt) return 'Glass Bottle';
    const s = String(bt).toLowerCase();
    if (s.includes('pvc')) return 'PVC Bottle';
    return 'Glass Bottle';
  };

  /**
   * Helper to normalize size string
   */
  const normalizeSize = (sz) => {
    if (!sz) return '50 ml';
    const s = String(sz).trim();
    if (!s.toLowerCase().includes('ml')) return `${s} ml`;
    return s;
  };

  /**
   * Add to Cart with exact selected variant
   * Supports:
   *  addToCart(product, quantity, selectedVariant)
   *  addToCart(product, quantity, sizeString)
   *  addToCart(product, quantity)
   */
  const addToCart = (product, quantity = 1, variantOrSize = null, bottleTypeArg = null) => {
    if (!product) return;

    let selectedVariant = null;
    let bottleType = 'Glass Bottle';
    let sizeMl = '50 ml';
    let unitPrice = Number(product.price) || 0;

    const isCombo = product.category === 'Combo Pack';

    if (variantOrSize && typeof variantOrSize === 'object') {
      selectedVariant = variantOrSize;
      // Combos are sold as a set: keep their labels instead of forcing a bottle/ml format
      bottleType = isCombo
        ? selectedVariant.bottle_type || 'Combo Collection'
        : normalizeBottleType(selectedVariant.bottle_type || selectedVariant.bottleType);
      sizeMl = isCombo
        ? selectedVariant.size_ml || 'Complete Set'
        : normalizeSize(selectedVariant.size_ml || selectedVariant.size);
      unitPrice = Number(selectedVariant.sale_price || selectedVariant.price || product.price);
    } else if (typeof variantOrSize === 'string') {
      sizeMl = normalizeSize(variantOrSize);
      if (bottleTypeArg) {
        bottleType = normalizeBottleType(bottleTypeArg);
      }
      // If product has variants, try to match
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        const matched = product.variants.find((v) => {
          const vBottle = normalizeBottleType(v.bottle_type);
          const vSize = normalizeSize(v.size_ml);
          return vBottle === bottleType && vSize === sizeMl;
        });
        if (matched) {
          selectedVariant = matched;
          unitPrice = Number(matched.sale_price || matched.price || unitPrice);
        }
      }
    } else {
      // Default variant
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        selectedVariant = product.variants[0];
        bottleType = normalizeBottleType(selectedVariant.bottle_type);
        sizeMl = normalizeSize(selectedVariant.size_ml);
        unitPrice = Number(selectedVariant.sale_price || selectedVariant.price || unitPrice);
      }
    }

    const variantId = selectedVariant?.id || selectedVariant?.variant_id || `var-${product.id}-${bottleType}-${sizeMl}`;
    // Never add an item without a real price (e.g. a product whose variants have no price)
    if (!(unitPrice > 0)) {
      showToast(`"${product.name}" is currently unavailable.`);
      return;
    }

    const cartItemId = `${product.id}_${bottleType}_${sizeMl}`;

    setCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.cartItemId === cartItemId ||
          (item.product_id === product.id && item.bottle_type === bottleType && item.size_ml === sizeMl)
      );

      if (existingIdx > -1) {
        // Copy the item instead of mutating state (StrictMode runs updaters twice in development)
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], quantity: copy[existingIdx].quantity + quantity };
        return copy;
      }

      const newItem = {
        cartItemId,
        product_id: product.id,
        variant_id: variantId,
        bottle_type: bottleType,
        size_ml: sizeMl,
        price: unitPrice,
        quantity: Math.max(1, quantity),
        product: product,
        name: product.name,
        image: product.main_image || product.image || '/assets/ps-perfumes-logo.webp',
        size: sizeMl, // backward compatibility
      };

      return [...prev, newItem];
    });

    showToast(`Added "${product.name}" (${bottleType} • ${sizeMl}) to your bag`);
    setIsCartOpen(true);
  };

  /**
   * Update quantity of specific variant
   */
  const updateQuantity = (productId, variantIdentifier, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId, variantIdentifier);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => {
        const matches =
          item.cartItemId === variantIdentifier ||
          item.variant_id === variantIdentifier ||
          item.size_ml === variantIdentifier ||
          item.size === variantIdentifier ||
          (item.product_id === productId && item.size_ml === variantIdentifier);
        return matches ? { ...item, quantity } : item;
      })
    );
  };

  /**
   * Remove specific variant from cart
   */
  const removeFromCart = (productId, variantIdentifier) => {
    setCartItems((prev) =>
      prev.filter((item) => {
        const matches =
          item.cartItemId === variantIdentifier ||
          item.variant_id === variantIdentifier ||
          item.size_ml === variantIdentifier ||
          item.size === variantIdentifier ||
          (item.product_id === productId && item.size_ml === variantIdentifier);
        return !matches;
      })
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setAppliedCoupon(null);
  };

  const toggleWishlist = (product) => {
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        showToast(`Removed "${product.name}" from wishlist`);
        return prev.filter((p) => p.id !== product.id);
      } else {
        showToast(`Saved "${product.name}" to wishlist`);
        return [...prev, product];
      }
    });
  };

  const isInWishlist = (productId) => {
    return wishlist.some((p) => p.id === productId);
  };

  // Checks the code against the coupons table through the database (no hard-coded codes)
  const applyPromoCode = async (code) => {
    const res = await validateCouponCode(code, subtotal);
    if (!res.valid) {
      return { success: false, message: res.message };
    }
    setAppliedCoupon({
      code: res.code,
      discount_type: res.discount_type,
      discount_value: res.discount_value,
      minimum_order_amount: res.minimum_order_amount,
    });
    showToast(res.message);
    return { success: true, message: res.message };
  };

  const removePromoCode = () => setAppliedCoupon(null);

  // Calculations
  const itemCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cartItems.reduce(
    (acc, item) => acc + (Number(item.price) || Number(item.product?.price) || 0) * item.quantity,
    0
  );
  const freeShippingThreshold = shippingRule.threshold;
  const shipping = subtotal >= freeShippingThreshold || subtotal === 0 ? 0 : shippingRule.fee;
  // Recomputed whenever the cart changes; 0 if the subtotal drops below the coupon minimum
  const discountAmount = computeCouponDiscount(appliedCoupon, subtotal);
  const promoCode = appliedCoupon?.code || '';
  const discountPercent = appliedCoupon?.discount_type === 'percentage' ? appliedCoupon.discount_value : 0;
  const couponNotice =
    appliedCoupon && discountAmount === 0 && appliedCoupon.minimum_order_amount > subtotal
      ? `Add items worth ${Math.ceil(appliedCoupon.minimum_order_amount - subtotal)} more to use ${appliedCoupon.code}.`
      : '';
  const total = Math.max(0, subtotal - discountAmount + shipping);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        itemCount,
        subtotal,
        freeShippingThreshold,
        shipping,
        discountAmount,
        discountPercent,
        promoCode,
        applyPromoCode,
        removePromoCode,
        appliedCoupon,
        couponNotice,
        total,
        wishlist,
        toggleWishlist,
        isInWishlist,
        isCartOpen,
        setIsCartOpen,
        isCheckoutOpen,
        setIsCheckoutOpen,
        isWishlistOpen,
        setIsWishlistOpen,
        isSearchOpen,
        setIsSearchOpen,
        selectedProduct,
        setSelectedProduct,
        selectedCategory,
        setSelectedCategory,
        toastMessage,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
