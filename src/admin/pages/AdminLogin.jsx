import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, ArrowRight } from 'lucide-react';
import { signIn, getAuthSession } from '../../lib/auth';
import { ADMIN_EMAIL } from '../../lib/supabase';
import PSPerfumesLogo from '../../components/common/PSPerfumesLogo';
import './AdminLogin.css';

export default function AdminLogin() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function checkExisting() {
      const { user, role } = await getAuthSession();
      if (user && role === 'admin') {
        navigate('/admin', { replace: true });
      }
    }
    checkExisting();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const { user, role, error } = await signIn(email, password);
      if (error) {
        setErrorMsg(error);
      } else if (role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        setErrorMsg('Access denied. This portal is restricted to authorized brand administrators.');
      }
    } catch {
      setErrorMsg('An unexpected authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ps-admin-login-page">
      <div className="ps-admin-login-card">
        <div className="ps-admin-login-header">
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
            <PSPerfumesLogo size="md" variant="standalone" />
          </Link>
          <span className="ps-admin-badge-tag">EXECUTIVE ATELIER PORTAL</span>
          <h1 className="ps-admin-login-title">Administrator Authentication</h1>
          <p className="ps-admin-login-sub">
            Authorized management suite for PS PERFUMES product catalog, orders, inventory, and Instagram broadcasts.
          </p>
        </div>

        {errorMsg && <div className="ps-admin-login-err">{errorMsg}</div>}

        <form onSubmit={handleLogin} className="ps-admin-login-form">
          <div className="ps-admin-input-group">
            <label htmlFor="admin-email">Administrator Email</label>
            <div className="ps-admin-input-box">
              <Mail size={16} color="#c8a45d" />
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="brandnix.in@gmail.com"
                required
              />
            </div>
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="admin-pass">Security Password</label>
            <div className="ps-admin-input-box">
              <Lock size={16} color="#c8a45d" />
              <input
                id="admin-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (min 6 characters)"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="ps-btn-gold-primary ps-admin-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span>AUTHENTICATING CREDENTIALS...</span>
            ) : (
              <>
                <span>ENTER ATELIER CONSOLE</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <div className="ps-admin-login-footer">
          <ShieldCheck size={14} color="#c8a45d" />
          <span>Restricted to {ADMIN_EMAIL}</span>
        </div>
      </div>
    </div>
  );
}
