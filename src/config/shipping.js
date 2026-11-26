/**
 * Delivery charges configuration for PS Perfumes storefront and checkout.
 * - PIN codes 516001 & 516002 (Kadapa atelier) -> Free delivery (₹0).
 * - All other valid 6-digit Indian PIN codes -> ₹49 delivery charge.
 * - Missing/incomplete/invalid PIN code -> null (pending calculation, checkout disabled).
 * - Empty cart / 0 subtotal -> ₹0.
 *
 * Keep in sync with backend database functions in place_order and place_order_core (Step 17 migration).
 */
export const SHIPPING_LABEL = 'Delivery Charges';
export const STANDARD_DELIVERY_FEE = 49;
export const FREE_DELIVERY_PINCODES = ['516001', '516002'];
export const FREE_DELIVERY_PINCODE = '516001, 516002';

/**
 * Validates whether a PIN code string matches standard 6-digit Indian postal code format.
 * First digit must be 1-9, followed by 5 digits.
 */
export function isValidPincode(pincode) {
  return /^[1-9]\d{5}$/.test(String(pincode || '').trim());
}

/**
 * Checks if a PIN code qualifies for free delivery (Kadapa PINs 516001 and 516002).
 */
export function isFreeDeliveryPincode(pincode) {
  const clean = String(pincode || '').trim();
  return FREE_DELIVERY_PINCODES.includes(clean);
}

/**
 * Calculates delivery fee based on PIN code and subtotal:
 * - Empty bag / 0 subtotal: 0
 * - Invalid or incomplete PIN code: null (cannot calculate until valid PIN provided)
 * - Kadapa PINs 516001 & 516002: 0 (FREE)
 * - All other valid PIN codes: 49
 *
 * @param {string|null|undefined} pincode
 * @param {number} subtotal
 * @returns {number|null}
 */
export function calculateDeliveryFee(pincode, subtotal) {
  if (Number(subtotal) <= 0) return 0;
  const cleanPin = String(pincode || '').trim();
  if (!isValidPincode(cleanPin)) return null;
  if (isFreeDeliveryPincode(cleanPin)) return 0;
  return STANDARD_DELIVERY_FEE;
}

/** Backward-compatible aliases */
export const FLAT_SHIPPING_FEE = STANDARD_DELIVERY_FEE;
export const flatShippingFor = (subtotal) => (Number(subtotal) > 0 ? STANDARD_DELIVERY_FEE : 0);
