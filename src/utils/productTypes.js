/**
 * PS PERFUMES — category-aware product configuration.
 *
 * Every product variant is stored in the existing product_variants columns (no schema change):
 *   bottle_type → the variant's OPTION  (Perfumes/Attars: "Glass Bottle" / "PVC Bottle";
 *                                        Bakhoor: package; Incense: pack; Burners: material/design)
 *   size_ml     → the variant's SIZE    (Perfumes/Attars: "50 ml"; Bakhoor: "50 g";
 *                                        Incense: "20 sticks"; Burners: "Medium")
 * Both columns are free text, and checkout (place_order) prices each line from its variant id,
 * so these labels flow through cart, checkout, orders and receipts unchanged.
 *
 * A product whose variants need no option (e.g. Bakhoor sold only by weight) stores the option
 * as "Standard" (the column is NOT NULL); the storefront never displays that word.
 *
 * The product's type is saved in its fragrance_notes metadata (product_type) by Admin →
 * Products, and is otherwise detected from its category (slug or name).
 */

/** Stored option when a variant has no option of its own (never shown to customers). */
export const DEFAULT_OPTION_LABEL = 'Standard';

export const PRODUCT_TYPES = {
  perfume: {
    key: 'perfume',
    kind: 'bottle',
    title: 'Perfume',
    optionLabel: 'Bottle Type',
    sizeLabel: 'Size',
  },
  attar: {
    key: 'attar',
    kind: 'bottle',
    title: 'Attar',
    optionLabel: 'Bottle Type',
    sizeLabel: 'Size',
  },
  bakhoor: {
    key: 'bakhoor',
    kind: 'custom',
    title: 'Bakhoor',
    optionLabel: 'Package',
    optionPlaceholder: 'e.g. Tin, Gift box (optional)',
    sizeLabel: 'Weight',
    sizePlaceholder: 'e.g. 50 g',
    help: 'Add one row per weight / package. Each row has its own price, stock and SKU.',
  },
  incense: {
    key: 'incense',
    kind: 'custom',
    title: 'Incense Sticks',
    optionLabel: 'Pack',
    optionPlaceholder: 'e.g. Single pack, Pack of 3 (optional)',
    sizeLabel: 'Stick Count',
    sizePlaceholder: 'e.g. 20 sticks',
    help: 'Add one row per stick count / pack. Each row has its own price, stock and SKU.',
  },
  burner: {
    key: 'burner',
    kind: 'custom',
    title: 'Bakhoor Burner',
    optionLabel: 'Material / Design',
    optionPlaceholder: 'e.g. Brass, Ceramic (optional)',
    sizeLabel: 'Size',
    sizePlaceholder: 'e.g. Medium (15 cm)',
    help: 'Add one row per size and material / design. Each row has its own price, stock and SKU.',
  },
  home: {
    key: 'home',
    kind: 'custom',
    title: 'Home Fragrance',
    optionLabel: 'Option',
    optionPlaceholder: 'e.g. Gift box (optional)',
    sizeLabel: 'Size',
    sizePlaceholder: 'e.g. 100 g',
    help: 'Add one row per variant. Each row has its own price, stock and SKU.',
  },
};

const text = (v) => String(v || '').toLowerCase();

/**
 * The product type for a category, from its slug / name and those of its main category.
 * Order matters: "Bakhoor Burners" is a burner, not bakhoor.
 */
export function detectProductType(category, mainCategory = null) {
  const own = `${text(category?.slug)} ${text(category?.name)}`;
  const main = `${text(mainCategory?.slug)} ${text(mainCategory?.name)}`;
  const all = `${own} ${main}`;
  if (/burner/.test(own)) return 'burner';
  if (/incen[cs]e/.test(own)) return 'incense';
  if (/bakh(o|u)+r/.test(own)) return 'bakhoor';
  if (/home[\s-]?fragrance/.test(all)) return 'home';
  if (/attar/.test(all)) return 'attar';
  return 'perfume';
}

export const isCustomType = (typeKey) => PRODUCT_TYPES[typeKey]?.kind === 'custom';

const BOTTLE_RE = /glass|pvc/i;
const ML_RE = /^\s*\d+(\.\d+)?\s*ml\s*$/i;

/** True when every variant is a classic bottle / ml variant (Perfumes, Attars). */
export function hasBottleVariants(variants) {
  const list = (Array.isArray(variants) ? variants : []).filter(Boolean);
  if (list.length === 0) return true;
  return list.every((v) => BOTTLE_RE.test(String(v.bottle_type || '')) && ML_RE.test(String(v.size_ml || '')));
}

/**
 * The storefront type of a product: the saved product_type, else the category, and in any case
 * a custom type when its variants are not bottle / ml variants (so options always display right).
 */
export function productTypeOf(product) {
  const saved = product?.product_type;
  let key = PRODUCT_TYPES[saved]
    ? saved
    : detectProductType({ slug: product?.category_slug, name: product?.category });
  if (!isCustomType(key) && !hasBottleVariants(product?.variants)) key = 'home';
  return PRODUCT_TYPES[key];
}

/** "6", "6ml", "6 ML" → "6 ml"; any other label is kept as entered ("50 g", "20 sticks"). */
export function formatSizeLabel(size) {
  const s = String(size || '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ml)?$/i);
  return m ? `${Number(m[1])} ml` : s;
}

/**
 * Whether a bag line qualifies for the "Complimentary 2x2ml Travel Sample" message:
 *   Perfumes → yes; Attars → only when the product is marked eligible in Admin → Products;
 *   Bakhoor, Incense Sticks, Bakhoor Burners (Home Fragrance) → never.
 * Combo sets keep the message they always had.
 */
export function isTravelSampleEligible(item) {
  const product = item?.product || item;
  if (!product) return false;
  const isCombo = product.category === 'Combo Pack' || String(item?.variant_id || '').startsWith('combo-');
  if (isCombo) return true;
  const type = productTypeOf(product);
  if (type.kind === 'custom') return false;
  if (type.key === 'attar') return product.sample_eligible === true;
  return true;
}

/** True for the hidden placeholder option. */
export const isDefaultOption = (option) =>
  !String(option || '').trim() || String(option).trim().toLowerCase() === DEFAULT_OPTION_LABEL.toLowerCase();

/** Customer-facing variant label, e.g. "Glass Bottle · 50 ml", "Gift Box · 50 g", "20 sticks". */
export function variantDisplayLabel(variant, separator = ' · ') {
  const option = isDefaultOption(variant?.bottle_type) ? '' : String(variant.bottle_type).trim();
  const size = formatSizeLabel(variant?.size_ml || variant?.size);
  return [option, size].filter(Boolean).join(separator);
}
