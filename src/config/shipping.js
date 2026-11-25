/**
 * Shipping rule shown on the storefront: one flat charge per order, no free-shipping threshold.
 * The database charges the same amount when the order is placed (place_order for COD,
 * place_order_core for Razorpay) once supabase/new-project/proposed-16-flat-shipping is applied.
 * Keep the two in step: change FLAT_SHIPPING_FEE only together with that migration.
 */
export const SHIPPING_LABEL = 'Air Shipping';
export const FLAT_SHIPPING_FEE = 49;

/** Shipping for a bag with this subtotal: nothing for an empty bag, otherwise the flat charge. */
export const flatShippingFor = (subtotal) => (Number(subtotal) > 0 ? FLAT_SHIPPING_FEE : 0);
