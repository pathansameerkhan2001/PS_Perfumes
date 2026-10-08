import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import PSPerfumesLogo from '../../components/common/PSPerfumesLogo';
import { useAdminAuth } from '../hooks/useAdminAuth';
import './AdminLogin.css';

/**
 * PS PERFUMES — Luxury Administration Authentication Portal
 * Dark Charcoal Atmosphere (#11100F) + Champagne Gold Accents (#C9A96E)
 */
export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const { isAuthenticated, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const target = location.state?.from?.pathname || '/admin';
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim()) {
      setErrorMessage('Please enter your administrator email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        const target = location.state?.from?.pathname || '/admin';
        navigate(target, { replace: true });
      }
    } catch {
      setErrorMessage('An unexpected error occurred during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your email above before requesting a password reset.');
      return;
    }
    setForgotSent(true);
    setErrorMessage('');
  };

  return (
    <div className="ps-admin-login-wrapper">
      <div className="ps-admin-login-card">
        {/* Brand Header */}
        <div className="ps-login-brand-header">
          <div className="ps-login-logo-wrap">
            <PSPerfumesLogo size="md" variant="standalone" />
          </div>
          <span className="ps-login-tagline">ADMINISTRATION</span>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="ps-login-alert is-error" role="alert">
            <AlertCircle size={15} className="ps-alert-icon" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Forgot Password Confirmation */}
        {forgotSent && (
          <div className="ps-login-alert is-info" role="status">
            <span>Password recovery instructions have been dispatched to {email}.</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="ps-login-form">
          <div className="ps-login-field">
            <label htmlFor="admin-email" className="ps-login-label">
              Email Address
            </label>
            <div className="ps-login-input-box">
              <Mail size={16} className="ps-login-input-icon" />
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="brandnix.in@gmail.com"
                required
                autoComplete="email"
                className="ps-login-input"
              />
            </div>
          </div>

          <div className="ps-login-field">
            <div className="ps-login-label-row">
              <label htmlFor="admin-password" className="ps-login-label">
                Password
              </label>
              <button
                type="button"
                className="ps-login-forgot-btn"
                onClick={handleForgotPassword}
              >
                Forgot Password?
              </button>
            </div>
            <div className="ps-login-input-box">
              <Lock size={16} className="ps-login-input-icon" />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                className="ps-login-input"
              />
              <button
                type="button"
                className="ps-login-eye-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="ps-login-submit-btn"
          >
            {isSubmitting ? (
              <span className="ps-login-spinner" />
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Footer Note */}
        <div className="ps-login-card-footer">
          <p className="ps-login-security-notice">
            Authorized Atelier Personnel Only
          </p>
        </div>
      </div>
    </div>
  );
}
