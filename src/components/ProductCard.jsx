import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import { defaultVariant, variantPrice, variantStock, variantComparePrice } from '../utils/productVariants';
import { cardImageUrl, fullImageFallback } from '../lib/storage';
import { isComboRecord, toComboCartProduct } from '../services/combos';
import WishlistHeart from './common/WishlistHeart';
import ProductImage from './common/ProductImage';
import AddToCartButton from './common/AddToCartButton';
import './ProductCard.css';

const sizeLabel = (s) => {
  const v = String(s || '').trim();
  return !v || /ml|set/i.test(v) ? v : `${v} ml`;
};

/**
 * PS PERFUMES — the storefront product card, used by every product grid (homepage sections,
 * shop, collections, search, related products, wishlist).
 *
 * Image with a wishlist heart, name, the bottle and size of the variant shown, price and the
 * gold Add to Cart. The price belongs to the default variant (lowest-priced in stock) and Add to
 * Cart adds exactly that variant; other bottles and sizes are chosen on the product page.
 * A saved combo set (wishlist) is shown and added as the set.
 *
 * pending: the product's data is still being confirmed (wishlist refresh), so Add to Cart waits.
 */
function ProductCard({ product, priority = false, viewMode = 'grid', pending = false }) {
  const { addToCart, setSelectedProduct } = useCart();
  const navigate = useNavigate();

  const combo = isComboRecord(product) ? toComboCartProduct(product) : null;
  const fullImageSrc = product.main_image || product.image || product.image_url || '/assets/ps-perfumes-logo.webp';
  // Card-size version when the image was uploaded optimized (see lib/storage.js)
  const imageSrc = cardImageUrl(fullImageSrc);
  const slug = product.slug || product.id;

  const variant = combo ? combo.variant : defaultVariant(product);
  const price = variant ? variantPrice(variant) : 0;
  const comparePrice = combo ? Number(combo.product.compare_at_price) || 0 : variant ? variantComparePrice(variant) : 0;
  const isUnavailable = combo ? !combo.product.is_purchasable || !(price > 0) : !variant;
  const isSoldOut = !isUnavailable && (combo ? combo.product.stock_quantity <= 0 : variantStock(variant) <= 0);
  const detail = combo ? 'Combo set' : variant ? `${variant.bottle_type || 'Glass Bottle'} · ${sizeLabel(variant.size_ml)}` : '';

  // Combos have no product page: their quick view opens instead
  const openProduct = () => (combo ? setSelectedProduct(product) : navigate(`/product/${slug}`));

  return (
    <article
      className={`ps-pcard${viewMode === 'list' ? ' is-list' : ''}`}
      onClick={openProduct}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        // Only when the card itself has focus: Enter on a button must not also navigate
        if (e.key === 'Enter' && e.target === e.currentTarget) openProduct();
      }}
      aria-label={`View ${product.name}`}
    >
      <div className="ps-pcard-media">
        <ProductImage
          src={imageSrc}
          alt={product.name}
          className="ps-pcard-img"
          priority={priority}
          width={400}
          height={500}
          onError={fullImageFallback(fullImageSrc)}
        />
        <WishlistHeart product={product} className="ps-pcard-heart" />
      </div>

      <div className="ps-pcard-details">
        <h3 className="ps-pcard-title" title={product.name}>
          {product.name}
        </h3>
        <p className="ps-pcard-variant">{detail || ' '}</p>

        <div className="ps-pcard-pricing-row">
          {isUnavailable ? (
            <span className="ps-pcard-price is-muted">Currently unavailable</span>
          ) : (
            <>
              <span className="ps-pcard-price">{formatINR(price)}</span>
              {comparePrice > price && <span className="ps-pcard-orig-price">{formatINR(comparePrice)}</span>}
            </>
          )}
        </div>

        <AddToCartButton
          onAdd={() => (combo ? addToCart(product, 1) : addToCart(product, 1, variant))}
          loading={pending}
          disabled={isUnavailable || isSoldOut}
          disabledLabel={isSoldOut ? 'Sold out' : 'Unavailable'}
          addedLabel="Added"
          ariaLabel={
            isUnavailable
              ? `${product.name} is unavailable`
              : isSoldOut
              ? `${product.name} is sold out`
              : `Add ${product.name} (${detail}) to cart`
          }
        />
      </div>
    </article>
  );
}

// Grids re-render with their parent; a card only needs to when its own product changes
export default memo(ProductCard);
