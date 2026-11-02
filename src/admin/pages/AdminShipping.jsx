import React, { useEffect, useMemo, useState } from 'react';
import { Truck, MapPin, Layers, Plus, Pencil, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getShippingConfig,
  updateShippingConfig,
  getShippingZones,
  saveShippingZone,
  deleteShippingZone,
  getShippingPincodes,
  saveShippingPincode,
  deleteShippingPincode,
} from '../../services/shipping';
import { formatINR } from '../../utils/formatCurrency';

/*
 * Admin → Shipping: delivery PIN codes, zones and the owner's decisions. Nothing here is pre-filled:
 * every PIN code and charge is entered by the owner. Checkout uses these only after "Use PIN code
 * rates" is switched on, which the database allows once every decision is recorded and at least one
 * PIN code can be delivered to. Until then the standard rule in Store Settings applies.
 */

const EMPTY_ZONE = { id: null, name: '', charge: '', is_active: true, notes: '' };
const EMPTY_PINCODE = { id: null, pincode: '', is_serviceable: true, charge: '', zone_id: '', is_active: true, notes: '' };

// '' = not decided, which keeps PIN code rates off
const fallbackChoice = (config) => (config?.fallback_allowed == null ? '' : config.fallback_allowed ? 'allowed' : 'not_allowed');

export default function AdminShipping() {
  const [config, setConfig] = useState(null);
  const [zones, setZones] = useState([]);
  const [pincodes, setPincodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [decisions, setDecisions] = useState({ fallback: '', fallbackCharge: '', freeRule: '', freeThreshold: '' });
  const [savingDecisions, setSavingDecisions] = useState(false);
  const [zoneForm, setZoneForm] = useState(null);
  const [pincodeForm, setPincodeForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, zoneRows, pincodeRows] = await Promise.all([getShippingConfig(), getShippingZones(), getShippingPincodes()]);
      setConfig(cfg);
      setZones(zoneRows);
      setPincodes(pincodeRows);
      setDecisions({
        fallback: fallbackChoice(cfg),
        fallbackCharge: cfg?.fallback_charge ?? '',
        freeRule: cfg?.free_shipping_rule || '',
        freeThreshold: cfg?.free_shipping_threshold ?? '',
      });
    } catch (err) {
      setNotice({ type: 'error', text: `${err.message} If Migration 11 is not applied yet, this page has nothing to manage.` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  // Mirrors the database rule (ps_shipping_ready), so the page can say why the switch is off
  const deliverable = pincodes.filter(
    (p) => p.is_active && p.is_serviceable && (p.charge != null || zoneById.get(p.zone_id)?.is_active)
  );
  const missing = [];
  if (config?.fallback_allowed == null) missing.push('Decide whether PIN codes that are not listed may use a fallback charge.');
  if (config?.free_shipping_rule == null) missing.push('Decide whether any free-shipping condition applies.');
  if (deliverable.length === 0 && !config?.fallback_allowed) missing.push('Enter at least one serviceable PIN code with a charge, or approve a fallback charge.');
  const pincodeMode = config?.mode === 'pincode';

  const run = async (action, success) => {
    setNotice(null);
    try {
      await action();
      setNotice({ type: 'success', text: success });
      await loadData();
      return true;
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
      return false;
    }
  };

  const handleMode = (mode) => {
    const text = mode === 'pincode'
      ? 'Checkout will now price delivery by PIN code and refuse PIN codes that are not covered. Continue?'
      : 'Checkout will go back to the standard rule in Store Settings. Continue?';
    if (!window.confirm(text)) return;
    run(() => updateShippingConfig({ mode }), mode === 'pincode' ? 'PIN code rates are on.' : 'The standard rule is back on.');
  };

  const handleDecisions = async (e) => {
    e.preventDefault();
    setSavingDecisions(true);
    await run(
      () =>
        updateShippingConfig({
          fallback_allowed: decisions.fallback === '' ? null : decisions.fallback === 'allowed',
          fallback_charge: decisions.fallback === 'allowed' ? Number(decisions.fallbackCharge) : null,
          free_shipping_rule: decisions.freeRule || null,
          free_shipping_threshold: decisions.freeRule === 'subtotal_threshold' ? Number(decisions.freeThreshold) : null,
        }),
      'Decisions saved.'
    );
    setSavingDecisions(false);
  };

  const submitForm = async (e, save, form, close, success) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await save(form);
      close(null);
      setNotice({ type: 'success', text: success });
      await loadData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const shownPincodes = pincodes.filter((p) => !search.trim() || p.pincode.startsWith(search.trim()));
  const chargeLabel = (p) => {
    if (!p.is_serviceable) return '—';
    if (p.charge != null) return Number(p.charge) === 0 ? 'FREE' : formatINR(p.charge, { showDecimals: true });
    const zone = zoneById.get(p.zone_id);
    return zone ? `${formatINR(zone.charge, { showDecimals: true })} (zone)` : '—';
  };

  if (loading && !config) return <div className="ps-admin-loading">Loading Shipping...</div>;

  return (
    <div className="ps-admin-shipping-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">DELIVERY</span>
          <h1 className="ps-admin-page-title">Shipping by PIN Code</h1>
        </div>
      </div>

      {notice && (
        <div className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'} role="status">
          {notice.text}
        </div>
      )}

      {config && (
        <>
          {/* Status */}
          <div className="ps-admin-form-card">
            <div className="ps-admin-card-header">
              <Truck size={20} className="ps-admin-gold-icon" />
              <h2 className="ps-admin-card-title">
                Checkout uses: {pincodeMode ? 'PIN code rates' : 'the standard rule (Store Settings)'}
              </h2>
            </div>
            {missing.length > 0 ? (
              <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13 }}>
                {missing.map((m) => (
                  <li key={m} style={{ marginBottom: 4 }}>
                    <AlertTriangle size={13} color="#e0a43c" style={{ marginRight: 6, verticalAlign: -2 }} />
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                <CheckCircle2 size={14} color="#22c55e" style={{ marginRight: 6, verticalAlign: -2 }} />
                Every decision is recorded and {deliverable.length} PIN code(s) can be delivered to
                {config.fallback_allowed ? ', plus any other valid PIN code at the fallback charge' : ''}.
              </p>
            )}
            {pincodeMode ? (
              <button type="button" className="ps-btn-cancel" onClick={() => handleMode('legacy')}>
                Return to the standard rule
              </button>
            ) : (
              <button
                type="button"
                className="ps-btn-gold-primary"
                style={{ padding: '10px 18px' }}
                disabled={missing.length > 0}
                onClick={() => handleMode('pincode')}
              >
                Use PIN code rates at checkout
              </button>
            )}
          </div>

          {/* Decisions */}
          <form className="ps-admin-form-card" onSubmit={handleDecisions}>
            <div className="ps-admin-card-header">
              <h2 className="ps-admin-card-title">Owner decisions</h2>
            </div>
            <div className="ps-admin-row-2">
              <div className="ps-admin-input-group">
                <label htmlFor="ship-fallback">PIN codes that are not listed</label>
                <select
                  id="ship-fallback"
                  value={decisions.fallback}
                  onChange={(e) => setDecisions({ ...decisions, fallback: e.target.value })}
                >
                  <option value="">Not decided</option>
                  <option value="not_allowed">Refuse them</option>
                  <option value="allowed">Deliver at a fallback charge</option>
                </select>
              </div>
              {decisions.fallback === 'allowed' && (
                <div className="ps-admin-input-group">
                  <label htmlFor="ship-fallback-charge">Fallback charge (₹)</label>
                  <input
                    id="ship-fallback-charge"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={decisions.fallbackCharge}
                    onChange={(e) => setDecisions({ ...decisions, fallbackCharge: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="ps-admin-row-2">
              <div className="ps-admin-input-group">
                <label htmlFor="ship-free">Free shipping</label>
                <select
                  id="ship-free"
                  value={decisions.freeRule}
                  onChange={(e) => setDecisions({ ...decisions, freeRule: e.target.value })}
                >
                  <option value="">Not decided</option>
                  <option value="none">No free shipping</option>
                  <option value="subtotal_threshold">Free when the item total reaches an amount</option>
                </select>
                <span className="ps-admin-input-hint">The item total is counted before any coupon, as today.</span>
              </div>
              {decisions.freeRule === 'subtotal_threshold' && (
                <div className="ps-admin-input-group">
                  <label htmlFor="ship-free-threshold">Free from an item total of (₹)</label>
                  <input
                    id="ship-free-threshold"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={decisions.freeThreshold}
                    onChange={(e) => setDecisions({ ...decisions, freeThreshold: e.target.value })}
                  />
                </div>
              )}
            </div>
            <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }} disabled={savingDecisions}>
              {savingDecisions ? 'Saving…' : 'Save decisions'}
            </button>
          </form>

          {/* Zones */}
          <div className="ps-admin-page-header" style={{ marginTop: 24 }}>
            <h2 className="ps-admin-card-title">
              <Layers size={18} className="ps-admin-gold-icon" style={{ marginRight: 8, verticalAlign: -3 }} />
              Delivery zones (optional)
            </h2>
            <button type="button" className="ps-btn-gold-primary ps-admin-header-btn" onClick={() => { setFormError(''); setZoneForm(EMPTY_ZONE); }}>
              <Plus size={16} />
              <span>ADD ZONE</span>
            </button>
          </div>
          {zones.length === 0 ? (
            <div className="ps-admin-empty-table">No zones. A PIN code can have its own charge instead.</div>
          ) : (
            <div className="ps-admin-table-container">
              <table className="ps-admin-products-table">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Charge</th>
                    <th>PIN codes</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z) => (
                    <tr key={z.id}>
                      <td><strong>{z.name}</strong></td>
                      <td>{Number(z.charge) === 0 ? 'FREE' : formatINR(z.charge, { showDecimals: true })}</td>
                      <td>{pincodes.filter((p) => p.zone_id === z.id).length}</td>
                      <td>{z.is_active ? 'ACTIVE' : 'OFF'}</td>
                      <td>
                        <button type="button" className="ps-action-icon-btn" title="Edit zone" onClick={() => { setFormError(''); setZoneForm({ ...z, notes: z.notes || '' }); }}>
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="ps-action-icon-btn is-delete"
                          title="Delete zone"
                          onClick={() => window.confirm(`Delete zone ${z.name}?`) && run(() => deleteShippingZone(z.id), 'Zone deleted.')}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* PIN codes */}
          <div className="ps-admin-page-header" style={{ marginTop: 24 }}>
            <h2 className="ps-admin-card-title">
              <MapPin size={18} className="ps-admin-gold-icon" style={{ marginRight: 8, verticalAlign: -3 }} />
              PIN codes ({pincodes.length})
            </h2>
            <button type="button" className="ps-btn-gold-primary ps-admin-header-btn" onClick={() => { setFormError(''); setPincodeForm(EMPTY_PINCODE); }}>
              <Plus size={16} />
              <span>ADD PIN CODE</span>
            </button>
          </div>
          {pincodes.length > 0 && (
            <div className="ps-form-group" style={{ maxWidth: 240 }}>
              <input type="search" inputMode="numeric" placeholder="Find a PIN code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}
          {pincodes.length === 0 ? (
            <div className="ps-admin-empty-table">No PIN codes entered yet.</div>
          ) : (
            <div className="ps-admin-table-container">
              <table className="ps-admin-products-table">
                <thead>
                  <tr>
                    <th>PIN code</th>
                    <th>Delivery</th>
                    <th>Charge</th>
                    <th>Zone</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shownPincodes.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.pincode}</strong></td>
                      <td>{p.is_serviceable ? 'Serviceable' : 'Not delivered'}</td>
                      <td>{chargeLabel(p)}</td>
                      <td>{zoneById.get(p.zone_id)?.name || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className={`ps-status-toggle-btn ${p.is_active ? 'is-active' : 'is-draft'}`}
                          onClick={() => run(() => saveShippingPincode({ ...p, is_active: !p.is_active }), `PIN code ${p.pincode} ${p.is_active ? 'switched off' : 'switched on'}.`)}
                        >
                          {p.is_active ? 'ACTIVE' : 'OFF'}
                        </button>
                      </td>
                      <td>
                        <button type="button" className="ps-action-icon-btn" title="Edit PIN code" onClick={() => { setFormError(''); setPincodeForm({ ...p, charge: p.charge ?? '', zone_id: p.zone_id || '', notes: p.notes || '' }); }}>
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="ps-action-icon-btn is-delete"
                          title="Delete PIN code"
                          onClick={() => window.confirm(`Delete PIN code ${p.pincode}?`) && run(() => deleteShippingPincode(p.id), 'PIN code deleted.')}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {zoneForm && (
        <div className="ps-admin-modal-overlay">
          <div className="ps-admin-modal-card" style={{ maxWidth: 440, textAlign: 'left' }}>
            <h2 className="ps-card-title" style={{ marginBottom: 16 }}>{zoneForm.id ? 'Edit Zone' : 'Add Zone'}</h2>
            <form
              onSubmit={(e) => submitForm(e, saveShippingZone, zoneForm, setZoneForm, `Zone ${zoneForm.name.trim()} saved.`)}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="ps-form-group">
                <label htmlFor="zone-name">Zone name *</label>
                <input id="zone-name" type="text" maxLength={80} required value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} />
              </div>
              <div className="ps-form-group">
                <label htmlFor="zone-charge">Delivery charge (₹) *</label>
                <input id="zone-charge" type="number" min="0" step="0.01" required value={zoneForm.charge} onChange={(e) => setZoneForm({ ...zoneForm, charge: e.target.value })} />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={zoneForm.is_active} onChange={(e) => setZoneForm({ ...zoneForm, is_active: e.target.checked })} />
                Active
              </label>
              <div className="ps-form-group">
                <label htmlFor="zone-notes">Notes</label>
                <input id="zone-notes" type="text" maxLength={500} value={zoneForm.notes} onChange={(e) => setZoneForm({ ...zoneForm, notes: e.target.value })} />
              </div>
              {formError && <div className="ps-form-error-banner">{formError}</div>}
              <div className="ps-modal-actions" style={{ marginTop: 8 }}>
                <button type="button" className="ps-btn-cancel" onClick={() => setZoneForm(null)}>Cancel</button>
                <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pincodeForm && (
        <div className="ps-admin-modal-overlay">
          <div className="ps-admin-modal-card" style={{ maxWidth: 440, textAlign: 'left' }}>
            <h2 className="ps-card-title" style={{ marginBottom: 16 }}>{pincodeForm.id ? 'Edit PIN Code' : 'Add PIN Code'}</h2>
            <form
              onSubmit={(e) => submitForm(e, saveShippingPincode, pincodeForm, setPincodeForm, `PIN code ${pincodeForm.pincode.trim()} saved.`)}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="ps-form-group">
                <label htmlFor="pin-code">PIN code *</label>
                <input
                  id="pin-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[1-9][0-9]{5}"
                  title="6 digits, not starting with 0"
                  required
                  value={pincodeForm.pincode}
                  onChange={(e) => setPincodeForm({ ...pincodeForm, pincode: e.target.value.replace(/\D/g, '') })}
                />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={pincodeForm.is_serviceable}
                  onChange={(e) => setPincodeForm({ ...pincodeForm, is_serviceable: e.target.checked })}
                />
                We deliver to this PIN code
              </label>
              {pincodeForm.is_serviceable && (
                <>
                  <div className="ps-form-group">
                    <label htmlFor="pin-zone">Zone</label>
                    <select id="pin-zone" value={pincodeForm.zone_id} onChange={(e) => setPincodeForm({ ...pincodeForm, zone_id: e.target.value })}>
                      <option value="">No zone</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({formatINR(z.charge, { showDecimals: true })}){z.is_active ? '' : ' — off'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ps-form-group">
                    <label htmlFor="pin-charge">{pincodeForm.zone_id ? "Own charge (₹), blank to use the zone's" : 'Delivery charge (₹) *'}</label>
                    <input
                      id="pin-charge"
                      type="number"
                      min="0"
                      step="0.01"
                      required={!pincodeForm.zone_id}
                      value={pincodeForm.charge}
                      onChange={(e) => setPincodeForm({ ...pincodeForm, charge: e.target.value })}
                    />
                  </div>
                </>
              )}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={pincodeForm.is_active} onChange={(e) => setPincodeForm({ ...pincodeForm, is_active: e.target.checked })} />
                Active (an inactive PIN code is treated as not listed)
              </label>
              <div className="ps-form-group">
                <label htmlFor="pin-notes">Notes</label>
                <input id="pin-notes" type="text" maxLength={500} value={pincodeForm.notes} onChange={(e) => setPincodeForm({ ...pincodeForm, notes: e.target.value })} />
              </div>
              {formError && <div className="ps-form-error-banner">{formError}</div>}
              <div className="ps-modal-actions" style={{ marginTop: 8 }}>
                <button type="button" className="ps-btn-cancel" onClick={() => setPincodeForm(null)}>Cancel</button>
                <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }} disabled={saving}>
                  {saving ? 'Saving…' : 'Save PIN Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
