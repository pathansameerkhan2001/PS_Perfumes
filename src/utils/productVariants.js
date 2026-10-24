/**
 * Variant helpers shared by the storefront product cards.
 * Prices always come from the product's real variants (never hardcoded).
 */

export const variantPrice = (v) => Number(v?.sale_price || v?.price) || 0;
export const variantStock = (v) => Number(v?.stock_quantity ?? v?.stock ?? 0);
const isGlass = (v) => !String(v?.bottle_type || '').toLowerCase().includes('pvc');
const sizeValue = (v) => parseFloat(v?.size_ml) || Number.MAX_SAFE_INTEGER;

/** Active variants with a price above zero: the ones a customer can actually buy. */
export function purchasableVariants(product) {
  return (Array.isArray(product?.variants) ? product.variants : []).filter(
    (v) => v && v.is_active !== false && v.active !== false && variantPrice(v) > 0
  );
}

/**
 * The variant a product card shows and adds to the bag: the lowest-priced variant in stock
 * (Glass before PVC at the same price, then the smaller size). When nothing is in stock, the
 * lowest-priced variant is returned so the card can still show a price; callers check stock.
 * The customer chooses any other bottle or size on the product page.
 */
export function defaultVariant(product) {
  const list = purchasableVariants(product);
  if (list.length === 0) return null;
  const rank = (a, b) =>
    variantPrice(a) - variantPrice(b) ||
    Number(isGlass(b)) - Number(isGlass(a)) ||
    sizeValue(a) - sizeValue(b);
  const inStock = list.filter((v) => variantStock(v) > 0).sort(rank);
  return inStock[0] || [...list].sort(rank)[0];
}

/** Strike-through price only for a genuine reduction on that same variant. */
export function variantComparePrice(v) {
  const price = variantPrice(v);
  const compare = Number(v?.compare_at_price) || (Number(v?.sale_price) > 0 && Number(v?.price) > Number(v?.sale_price) ? Number(v.price) : 0);
  return compare > price ? compare : 0;
}
