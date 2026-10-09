import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { getOrderByNumber } from '../../services/orders';
import { formatINR } from '../../utils/formatCurrency';
import './TrackOrderPage.css';

const STEPS = [
  { key: 'confirmed', label: 'Order Confirmed', icon: CheckCircle2, desc: 'Flacon formula queued' },
  { key: 'processing', label: 'Atelier Preparation', icon: Clock, desc: 'Hand-blended & sealed in Kadapa' },
  { key: 'shipped', label: 'In Transit', icon: Truck, desc: 'Dispatched via express pan-India courier' },
  { key: 'delivered', label: 'Delivered', icon: Package, desc: 'Received at destination' },
];

function getStepIndex(status) {
  const s = (status || 'pending').toLowerCase();
  if (s === 'delivered') return 3;
  if (s === 'shipped' || s === 'out_for_delivery') return 2;
  if (s === 'processing') return 1;
  return 0; // pending, confirmed
}

export default function TrackOrderPage() {
  const [searchParams] = useSearchParams();
  const initialRef = searchParams.get('ref') || '';
  const [orderQuery, setOrderQuery] = useState(initialRef);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleTrack = async (e) => {
    if (e) e.preventDefault();
    const clean = orderQuery.trim();
    if (!clean) return;

    setLoading(true);
    setNotFound(false);
    setSearched(true);

    try {
      const found = await getOrderByNumber(clean);
      if (found) {
        setOrder(found);
        setNotFound(false);
      } else {
        setOrder(null);
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSample = (num) => {
    setOrderQuery(num);
    setLoading(true);
    setNotFound(false);
    setSearched(true);
    getOrderByNumber(num)
      .then((found) => {
        if (found) {
          setOrder(found);
          setNotFound(false);
        } else {
          setOrder(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const activeStepIdx = order ? getStepIndex(order.order_status) : 0;

  return (
    <div className="ps-track-page">
      {/* Editorial Luxury Hero Banner */}
      <div className="ps-track-hero-banner">
        <div className="ps-track-hero-inner">
          <span className="ps-track-tag">ROYAL DISPATCH INQUIRY</span>
          <h1 className="ps-track-title">Consignment Tracking</h1>
          <p className="ps-track-sub">
            Monitor the dispatch, atelier preparation, and live delivery milestones of your PS PERFUMES flacons.
          </p>
        </div>
      </div>

      <div className="ps-track-container">
        {/* Search Card */}
        <div className="ps-track-search-card">
          <form className="ps-track-form" onSubmit={handleTrack}>
            <div className="ps-track-input-wrap">
              <Search size={18} className="ps-track-search-icon" />
              <input
                type="text"
                className="ps-track-input"
                placeholder="Enter Order Reference (e.g. PS-892401) or Email..."
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                autoFocus
                aria-label="Order Reference Number or Email"
              />
            </div>
            <button
              type="submit"
              className="ps-track-submit-btn"
              disabled={loading || !orderQuery.trim()}
            >
              {loading ? 'TRACKING...' : 'TRACK ORDER'}
            </button>
          </form>

          {/* Helpful Quick Sample Chips */}
          <div className="ps-track-sample-row">
            <span className="ps-sample-label">Sample References:</span>
            <button
              type="button"
              className="ps-sample-chip"
              onClick={() => handleQuickSample('PS-892401')}
            >
              PS-892401 (Processing)
            </button>
            <button
              type="button"
              className="ps-sample-chip"
              onClick={() => handleQuickSample('PS-892398')}
            >
              PS-892398 (Confirmed)
            </button>
          </div>
        </div>

        {/* Not Found State */}
        {searched && notFound && (
          <div className="ps-track-empty-state">
            <Package size={44} color="#c8a45d" />
            <h2 className="ps-empty-title">No Consignment Found</h2>
            <p className="ps-empty-desc">
              We could not find an active dispatch matching <strong>&ldquo;{orderQuery}&rdquo;</strong>.
              Please check your order reference receipt or connect with our concierge team.
            </p>
            <div className="ps-track-concierge-callout">
              <span>Need atelier assistance? Email us at </span>
              <a href="mailto:brandnix.in@gmail.com" className="ps-concierge-link">
                brandnix.in@gmail.com
              </a>
            </div>
          </div>
        )}

        {/* Found Order Details */}
        {order && (
          <div className="ps-track-result-wrapper">
            {/* Top Meta Card */}
            <div className="ps-track-meta-card">
              <div className="ps-meta-left">
                <span className="ps-meta-eyebrow">CONSIGNMENT REFERENCE</span>
                <h2 className="ps-meta-order-num">{order.order_number}</h2>
                <span className="ps-meta-date">
                  Placed on {new Date(order.created_at).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="ps-meta-right">
                <div className={`ps-status-pill ps-status-${(order.order_status || 'pending').toLowerCase()}`}>
                  <span className="ps-status-dot" />
                  <span className="ps-status-text">
                    {(order.order_status || 'Pending').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Stepper Timeline */}
            <div className="ps-track-timeline-card">
              <h3 className="ps-timeline-title">Dispatch Milestones</h3>
              <div className="ps-timeline-steps">
                {STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isDone = idx <= activeStepIdx;
                  const isCurrent = idx === activeStepIdx;

                  return (
                    <div
                      key={step.key}
                      className={`ps-timeline-step ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}
                    >
                      <div className="ps-timeline-step-icon-wrap">
                        <Icon size={18} />
                      </div>
                      <div className="ps-timeline-step-info">
                        <strong className="ps-step-label">{step.label}</strong>
                        <span className="ps-step-desc">{step.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Consignment Items & Destination Grid */}
            <div className="ps-track-grid-details">
              {/* Left: Items List */}
              <div className="ps-track-items-card">
                <h3 className="ps-card-heading">Sealed Fragrance Items</h3>
                <div className="ps-track-items-list">
                  {order.items?.map((it, idx) => (
                    <div key={idx} className="ps-track-item-row">
                      <div className="ps-track-item-img-wrap">
                        <img
                          src={it.product_image || '/assets/prod-royal-amber.webp'}
                          alt={it.product_name}
                          className="ps-track-item-img"
                          onError={(e) => {
                            e.currentTarget.src = '/assets/prod-royal-amber.webp';
                          }}
                        />
                      </div>
                      <div className="ps-track-item-info">
                        <h4 className="ps-track-item-name">{it.product_name}</h4>
                        <span className="ps-track-item-spec">
                          Qty: {it.quantity} {it.size ? `• ${it.size}` : ''}
                        </span>
                        <span className="ps-track-item-price">
                          {formatINR(it.price || it.total || 0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="ps-track-financial-summary">
                  <div className="ps-fin-row">
                    <span>Subtotal</span>
                    <span>{formatINR(order.subtotal || order.total || 0)}</span>
                  </div>
                  {order.shipping_fee > 0 && (
                    <div className="ps-fin-row">
                      <span>Shipping</span>
                      <span>{formatINR(order.shipping_fee)}</span>
                    </div>
                  )}
                  {order.discount > 0 && (
                    <div className="ps-fin-row ps-discount">
                      <span>Atelier Privilege Discount</span>
                      <span>-{formatINR(order.discount)}</span>
                    </div>
                  )}
                  <div className="ps-fin-row ps-total">
                    <span>Total Amount</span>
                    <span>{formatINR(order.total || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Right: Shipping Destination */}
              <div className="ps-track-dest-card">
                <h3 className="ps-card-heading">Delivery Sanctuary</h3>
                <div className="ps-dest-block">
                  <div className="ps-dest-row">
                    <MapPin size={18} color="#c8a45d" className="ps-dest-icon" />
                    <div>
                      <strong>{order.customer_name}</strong>
                      <p className="ps-dest-address">
                        {order.shipping_address?.address}<br />
                        {order.shipping_address?.landmark ? `${order.shipping_address.landmark}, ` : ''}
                        {order.shipping_address?.city}, {order.shipping_address?.state} – {order.shipping_address?.pincode}
                      </p>
                    </div>
                  </div>

                  <div className="ps-dest-row">
                    <ShieldCheck size={18} color="#c8a45d" className="ps-dest-icon" />
                    <div>
                      <strong>Payment Mode</strong>
                      <p className="ps-dest-payment">
                        {order.payment_method || 'Cash On Delivery (COD)'} •{' '}
                        <span className={`ps-pay-badge ps-pay-${(order.payment_status || 'pending').toLowerCase()}`}>
                          {(order.payment_status || 'Pending').toUpperCase()}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="ps-dest-trust-note">
                  <p>
                    Every PS PERFUMES flacon is hand-inspected and sealed in our Kadapa boutique before hand-off to premium express logistics.
                  </p>
                </div>

                <div className="ps-dest-cta-row">
                  <Link to="/shop" className="ps-dest-shop-btn">
                    <span>EXPLORE MORE FRAGRANCES</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
