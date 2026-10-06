import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, X, Tag } from 'lucide-react';
import { getProducts } from '../../services/products';
import ProductCard from '../../components/ProductCard';

const POPULAR_SEARCHES = ['Royal Amber', 'Noir Absolu', 'Oud', 'Attar', 'Bakhoor', 'Musk', 'Sandalwood'];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(queryParam);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSearchTerm(queryParam);
  }, [queryParam]);

  useEffect(() => {
    let mounted = true;
    async function doSearch() {
      if (!queryParam.trim()) {
        setProducts([]);
        return;
      }
      setLoading(true);
      try {
        const results = await getProducts({ search: queryParam.trim() });
        if (mounted) {
          setProducts(results);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }
    doSearch();
    return () => { mounted = false; };
  }, [queryParam]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      setSearchParams({ q: searchTerm.trim() });
    }
  };

  const handlePopularClick = (term) => {
    setSearchTerm(term);
    setSearchParams({ q: term });
  };

  return (
    <div className="ps-shop-page">
      <div className="ps-shop-hero-banner">
        <div className="ps-shop-hero-inner">
          <span className="ps-shop-tag">DISCOVER & EXPLORE</span>
          <h1 className="ps-shop-title">Search Our Fragrance Atelier</h1>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} style={{ maxWidth: 600, margin: '24px auto 0' }}>
            <div className="ps-promo-input-wrap" style={{ padding: '10px 16px', background: '#050505' }}>
              <Search size={20} color="#c8a45d" />
              <input
                type="text"
                placeholder="Search by perfume name, notes (e.g. Amber, Oud, Rose), or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ fontSize: 14, marginLeft: 8 }}
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSearchParams({});
                  }}
                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              )}
              <button
                type="submit"
                style={{
                  background: 'var(--color-gold)',
                  color: '#050505',
                  padding: '8px 18px',
                  borderRadius: 2,
                  fontWeight: 700,
                  fontSize: 12,
                  marginLeft: 8,
                }}
              >
                SEARCH
              </button>
            </div>
          </form>

          {/* Popular Tag Pills */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            <span style={{ fontSize: 11, color: 'var(--color-muted)', alignSelf: 'center' }}>Popular:</span>
            {POPULAR_SEARCHES.map((term) => (
              <button
                key={term}
                type="button"
                className="ps-filter-pill"
                onClick={() => handlePopularClick(term)}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ps-shop-container">
        {loading ? (
          <div className="ps-shop-skeletons">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="ps-shop-card-skeleton" />
            ))}
          </div>
        ) : queryParam && products.length === 0 ? (
          <div className="ps-shop-empty-state" style={{ margin: '40px auto', maxWidth: 540 }}>
            <h2 className="ps-empty-title">No Matching Fragrances</h2>
            <p className="ps-empty-desc">
              We couldn't find any formulations matching "{queryParam}". Try searching by category like Oud, Attar, or Floral.
            </p>
            <Link to="/shop" className="ps-btn-gold-primary">
              VIEW COMPLETE CATALOG
            </Link>
          </div>
        ) : products.length > 0 ? (
          <div>
            <div style={{ marginBottom: 24, fontSize: 13, color: 'var(--color-muted)' }}>
              Found <strong>{products.length}</strong> creations matching "{queryParam}":
            </div>
            <div className="ps-shop-products-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {products.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-muted)' }}>
            Enter a fragrance name or select a popular scent above to begin searching.
          </div>
        )}
      </div>
    </div>
  );
}
