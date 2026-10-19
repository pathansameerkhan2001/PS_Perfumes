import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, UserCheck, X } from 'lucide-react';
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  ADMIN_ROLES,
} from '../../services/adminUsers';
import './AdminProductForm.css';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [busyId, setBusyId] = useState(null);

  const [form, setForm] = useState({
    email: '',
    role: 'admin',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setForm({
      email: '',
      role: 'admin',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) {
      setErrorMsg('Please specify the e-mail of an existing Supabase Auth user.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      await createAdminUser(form);
      setIsModalOpen(false);
      setNotice({ type: 'success', text: `Admin access granted to ${form.email.trim()}.` });
      await loadData();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, email) => {
    if (!window.confirm(`Remove admin access for ${email}?`)) return;
    setBusyId(id);
    setNotice(null);
    try {
      await deleteAdminUser(id);
      setNotice({ type: 'success', text: `Admin access removed for ${email}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
      await loadData();
    }
  };

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    setBusyId(user.id);
    setNotice(null);
    try {
      await updateAdminUser(user.id, { status: newStatus });
      setNotice({ type: 'success', text: `${user.email} is now ${newStatus}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
      await loadData();
    }
  };

  if (loading) {
    return <div className="ps-admin-loading">Verifying security clearances...</div>;
  }

  return (
    <div className="ps-admin-combos-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">ACCESS & PRIVILEGES</span>
          <h1 className="ps-admin-page-title">Admin Console Users</h1>
        </div>

        <button
          type="button"
          className="ps-btn-gold-primary ps-admin-header-btn"
          onClick={handleOpenAdd}
        >
          <Plus size={16} />
          <span>INVITE ADMIN</span>
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '0 0 12px' }}>
        Only a super_admin can grant, suspend or remove access. The person must first have a login created in
        Supabase Dashboard → Authentication → Users.
      </p>

      {notice && (
        <div className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'} role="status">
          {notice.text}
        </div>
      )}

      <div className="ps-admin-table-card">
        <div className="ps-admin-table-wrap">
          <table className="ps-admin-table">
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Email Address</th>
                <th>Assigned Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          background: 'rgba(200, 164, 93, 0.15)',
                          color: '#c8a45d',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '12px',
                        }}
                      >
                        {u.full_name?.slice(0, 2).toUpperCase() || 'AD'}
                      </div>
                      <strong>{u.full_name}</strong>
                    </div>
                  </td>
                  <td>
                    <span className="ps-cell-muted">{u.email}</span>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        background: '#141310',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        fontSize: '11.5px',
                        color: '#c8a45d',
                        fontWeight: 600,
                      }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`ps-status-pill ${
                        u.status === 'active' ? 'ps-status-confirmed' : 'ps-status-cancelled'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <div className="ps-table-actions">
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleToggleStatus(u)}
                        disabled={busyId === u.id}
                        title={u.status === 'active' ? 'Suspend Access' : 'Activate Access'}
                      >
                        <UserCheck size={16} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDelete(u.id, u.email)}
                        disabled={busyId === u.id}
                        title="Revoke Clearance"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Invite / Add Admin */}
      {isModalOpen && (
        <div className="ps-admin-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="ps-admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3>Invite Atelier Administrator</h3>
              <button
                type="button"
                className="ps-modal-close"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}

            <form onSubmit={handleSave}>
              <div className="ps-form-group">
                <label>Email Address *</label>
                <input
                  type="email"
                  placeholder="person@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>

              <div className="ps-form-group">
                <label>Assigned Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ADMIN_ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="ps-modal-actions">
                <button
                  type="button"
                  className="ps-builder-btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ps-builder-btn-save"
                  disabled={saving}
                >
                  {saving ? 'Granting...' : 'Grant Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
