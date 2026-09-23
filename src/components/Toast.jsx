import React from 'react';
import { CheckCircle, Sparkles } from 'lucide-react';
import { useCart } from '../context/CartContext';
import './Toast.css';

export default function Toast() {
  const { toastMessage } = useCart();

  if (!toastMessage) return null;

  return (
    <div className="ps-toast-banner" role="status" aria-live="polite">
      <div className="ps-toast-content">
        <Sparkles size={16} color="#c5a059" />
        <span className="ps-toast-text">{toastMessage}</span>
      </div>
    </div>
  );
}
