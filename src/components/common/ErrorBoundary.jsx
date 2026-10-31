import React from 'react';

/**
 * Keeps a rendering error inside one part of the site. Without a boundary React removes the whole
 * page and leaves it blank. It also catches a lazy page that fails to download after a new deploy.
 *
 * fallback: what to show instead (null shows nothing); leave it out for the reload message.
 * resetKey: when this value changes, the children are tried again.
 */
export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Rendering error:', error, info?.componentStack);
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div role="alert" style={{ minHeight: '60vh', padding: '80px 20px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-editorial)', fontSize: 30, fontWeight: 400, marginBottom: 12 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, marginBottom: 24 }}>
          Please reload the page. Your bag is saved on this device.
        </p>
        <button type="button" className="ps-btn-gold-primary" onClick={() => window.location.reload()}>
          RELOAD PAGE
        </button>
      </div>
    );
  }
}
