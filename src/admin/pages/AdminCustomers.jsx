import React, { useState, useEffect } from 'react';
import { getOrders } from '../../services/orders';
import { Users, Mail, Phone, MapPin, ShoppingBag, IndianRupee, Search } from 'lucide-react';
import './AdminProducts.css';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchCustomers() {
      setLoading(true);
      setLoadError(null);
      try {
        const orders = await getOrders();
        // Aggregate customer profiles from orders. Only values recorded on the orders are
        // shown; missing details stay empty instead of being filled with placeholders.
        const customerMap = {};

        orders.forEach((order) => {
          const email = (order.email || '').trim().toLowerCase();
          const key = email || order.phone || order.customer_id || order.id;
          if (!customerMap[key]) {
            customerMap[key] = {
              key,
              name: order.customer_name || '',
              email: order.email || '',
              phone: order.phone || '',
              city: order.shipping_address?.city || '',
              state: order.shipping_address?.state || '',
              orderCount: 0,
              totalSpend: 0,
              lastOrderDate: order.created_at,
            };
          }
          customerMap[key].orderCount += 1;
          customerMap[key].totalSpend += Number(order.total || 0);
          if (new Date(order.created_at) > new Date(customerMap[key].lastOrderDate)) {
            customerMap[key].lastOrderDate = order.created_at;
          }
        });

        setCustomers(Object.values(customerMap));
      } catch (err) {
        console.error('Error fetching customers:', err);
        setLoadError(err?.message || 'Could not load orders.');
      } finally {
        setLoading(false);
      }
    }
    fetchCustomers();
  }, []);

  const query = searchQuery.trim().toLowerCase();
  const filtered = customers.filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query) ||
      c.phone.includes(query)
  );

  return (
    <div className="ps-admin-products-page">
      <div className="ps-admin-products-header">
        <div>
          <h1 className="ps-admin-page-title">Client Directory & Patrons</h1>
          <p className="ps-admin-page-subtitle">Loyal fragrance collectors, purchase history, and contact details</p>
        </div>
      </div>

      <div className="ps-admin-filter-bar">
        <div className="ps-admin-search-wrapper" style={{ flex: 1, maxWidth: '400px' }}>
          <Search size={16} className="ps-admin-search-icon" />
          <input
            type="text"
            placeholder="Search by client name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-admin-search-input"
          />
        </div>
        <div style={{ color: '#8F8A80', fontSize: '0.85rem' }}>
          Total Patrons: <strong>{loadError ? '—' : customers.length}</strong>
        </div>
      </div>

      {loading ? (
        <div className="ps-admin-loading-view">
          <div className="ps-admin-spinner" />
          <p>Loading patrons directory...</p>
        </div>
      ) : loadError ? (
        <div className="ps-form-error-banner" role="alert">
          Customers could not be loaded, so this list is unknown (not empty): {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="ps-admin-empty-state">
          <p>{customers.length === 0 ? 'No orders have been recorded yet, so there are no customers to list.' : 'No customers match this search.'}</p>
        </div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-table">
            <thead>
              <tr>
                <th>Client Name</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Orders</th>
                <th>Total Value</th>
                <th>Last Ordered</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.key}>
                  <td>
                    <div style={{ fontWeight: '600', color: 'var(--ps-admin-text-primary, #1A1714)', fontFamily: 'var(--font-serif)' }}>
                      {client.name || '—'}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
                      <span style={{ color: '#8C6D2F' }}>{client.email || '—'}</span>
                      <span style={{ color: 'var(--ps-admin-text-secondary, #746B61)' }}>{client.phone || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--ps-admin-text-secondary, #746B61)' }}>
                      <MapPin size={13} color="#C8A45D" />
                      <span>{[client.city, client.state].filter(Boolean).join(', ') || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShoppingBag size={14} color="#C8A45D" />
                      <span style={{ fontWeight: '600', color: 'var(--ps-admin-text-primary, #1A1714)' }}>{client.orderCount}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ color: '#8C6D2F', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      ₹{client.totalSpend.toLocaleString('en-IN')}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--ps-admin-text-secondary, #746B61)', whiteSpace: 'nowrap' }}>
                    {client.lastOrderDate
                      ? new Date(client.lastOrderDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
