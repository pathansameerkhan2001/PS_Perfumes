import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSiteSettings } from '../services/settings';
import { validateCouponCode, computeCouponDiscount } from '../services/coupons';

// Shipping rule used until Store Settings has saved values in the database
const DEFAULT_FREE_SHIPPING_THRESHOLD = 1500;
const DEFAULT_SHIPPING_FEE = 99;

const CartContext = createContext(null);

// A saved bag line checkout can actually price: a real product variant, or a combo set.
// Earlier versions could store invented variants (ids starting "var-"); place_order rejects
// those, so they are dropped when the bag is loaded instead of failing at checkout.
function isOrderableLine(item) {
  if (!item || !(Number(item.quantity) > 0)) return false;
  const id = String(item.variant_id || '');
  if (item.product?.category === 'Combo Pack' || id.startsWith('combo-')) return true;
  return id !== '' && !id.startsWith('var-');
}

// Number of unorderable lines removed from the saved bag (shown once after load)
let droppedOnLoad = 0;

export function CartProvider({ children }) {
  // Cart state persisted in localStorage
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem('ps_cart');
      const list = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(list)) return [];
      const kept = list.filter(isOrderableLine);
      droppedOnLoad = list.length - kept.length;
      return kept;
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

  // Tell the shopper once if lines from an older saved bag could not be kept (see isOrderableLine)
  useEffect(() => {
    if (droppedOnLoad > 0) {
      const n = droppedOnLoad;
      droppedOnLoad = 0;
      showToast(
        `${n} item${n > 1 ? 's' : ''} in your saved bag ${n > 1 ? 'are' : 'is'} no longer available and ${n > 1 ? 'were' : 'was'} removed. Please add ${n > 1 ? 'them' : 'it'} again.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    let variantId = null;
    let availableStock = null; // null = not tracked (combos)
    let capped = false;

    if (isCombo) {
      // Combos are sold as a set: keep their labels; checkout prices them from the combo itself
      const comboVariant = variantOrSize && typeof variantOrSize === 'object' ? variantOrSize : {};
      bottleType = comboVariant.bottle_type || 'Combo Collection';
      sizeMl = comboVariant.size_ml || 'Complete Set';
      unitPrice = Number(comboVariant.sale_price || comboVariant.price || product.price);
      variantId = comboVariant.id || comboVariant.variant_id || `combo-var-${product.id}`;
      // Unavailable combos (inactive, unavailable products, no stock) cannot be added
      if (product.is_purchasable === false) {
        showToast(`"${product.name}" is currently unavailable.`);
        return;
      }
      // Combo stock, when known, limits the quantity in the bag like a variant's stock
      if (product.stock_quantity !== undefined && product.stock_quantity !== null) {
        availableStock = Number(product.stock_quantity) || 0;
        if (availableStock <= 0) {
          showToast(`"${product.name}" is out of stock.`);
          return;
        }
      }
    } else {
      // Products: only a real, active variant of THIS product can go into the cart. Checkout
      // (place_order) prices each line from its variant id, so an invented variant would be
      // rejected there — after the shopper had already seen it in the bag.
      const realVariants = (Array.isArray(product.variants) ? product.variants : []).filter(
        (v) => v && v.id && v.is_active !== false && v.active !== false
      );
      const isPricedVariant = (v) => Number(v.sale_price || v.price) > 0;
      const stockOf = (v) => Number(v.stock_quantity ?? v.stock ?? 0);

      if (variantOrSize && typeof variantOrSize === 'object') {
        const wantedId = variantOrSize.id || variantOrSize.variant_id;
        selectedVariant = realVariants.find((v) => v.id === wantedId) || null;
      } else if (typeof variantOrSize === 'string') {
        const wantedSize = normalizeSize(variantOrSize);
        const wantedBottle = bottleTypeArg ? normalizeBottleType(bottleTypeArg) : null;
        selectedVariant =
          realVariants.find(
            (v) =>
              normalizeSize(v.size_ml) === wantedSize &&
              (!wantedBottle || normalizeBottleType(v.bottle_type) === wantedBottle)
          ) || null;
      } else {
        // No choice given (wishlist, video section): first in-stock priced variant
        selectedVariant =
          realVariants.find((v) => isPricedVariant(v) && stockOf(v) > 0) ||
          realVariants.find(isPricedVariant) ||
          null;
      }

      if (!selectedVariant || !isPricedVariant(selectedVariant)) {
        showToast(
          realVariants.length === 0
            ? `"${product.name}" is currently unavailable.`
            : `Please choose an available option for "${product.name}".`
        );
        return;
      }

      availableStock = stockOf(selectedVariant);
      if (availableStock <= 0) {
        showToast(`"${product.name}" (${selectedVariant.size_ml}) is out of stock.`);
        return;
      }

      bottleType = normalizeBottleType(selectedVariant.bottle_type);
      sizeMl = normalizeSize(selectedVariant.size_ml);
      // Same rule as place_order: the sale price when set, otherwise the price
      unitPrice = Number(selectedVariant.sale_price) > 0 ? Number(selectedVariant.sale_price) : Number(selectedVariant.price);
      variantId = selectedVariant.id;
    }

    // Never add an item without a real price
    if (!(unitPrice > 0)) {
      showToast(`"${product.name}" is currently unavailable.`);
      return;
    }

    const cartItemId = `${product.id}_${bottleType}_${sizeMl}`;

    // Do not let the bag hold more than the stock of this variant (checkout would refuse it)
    if (availableStock !== null) {
      const inBag = cartItems
        .filter((item) => item.variant_id === variantId || item.cartItemId === cartItemId)
        .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const canAdd = availableStock - inBag;
      if (canAdd <= 0) {
        showToast(`Only ${availableStock} of "${product.name}" (${sizeMl}) available — already in your bag.`);
        return;
      }
      if (quantity > canAdd) {
        quantity = canAdd;
        capped = true;
      }
    }

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

    showToast(
      capped
        ? `Added ${quantity} of "${product.name}" (${sizeMl}) — that is all we have in stock`
        : `Added "${product.name}" (${bottleType} • ${sizeMl}) to your bag`
    );
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
        if (!matches) return item;
        // Cap at the variant's (or combo's) stock as known when it was added; checkout re-checks
        const isComboLine = item.product?.category === 'Combo Pack';
        const variant = isComboLine ? null : item.product?.variants?.find((v) => v.id === item.variant_id);
        const max = isComboLine
          ? Number(item.product?.stock_quantity ?? 0)
          : variant
          ? Number(variant.stock_quantity ?? variant.stock ?? 0)
          : 0;
        return { ...item, quantity: max > 0 ? Math.min(quantity, max) : quantity };
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
