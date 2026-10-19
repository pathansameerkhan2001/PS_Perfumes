import React from 'react';
import { Truck, ShieldCheck, CreditCard, Gift } from 'lucide-react';
import BenefitItem from './BenefitItem';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatCurrency';
import './BenefitsBar.css';

const BENEFITS = [
  {
    id: 'shipping',
    icon: Truck,
    title: 'FREE SHIPPING',
    // Filled in from the cart's shipping rule (Store Settings) at render time
    description: '',
  },
  {
    id: 'original',
    icon: ShieldCheck,
    title: '100% ORIGINAL',
    description: 'Authentic Fragrances',
  },
  {
    id: 'checkout',
    icon: CreditCard,
    title: 'CASH ON DELIVERY',
    description: 'Pay when your order arrives',
  },
  {
    id: 'packaging',
    icon: Gift,
    title: 'LUXURY PACKAGING',
    description: 'Perfect for Gifting',
  },
];

export default function BenefitsBar() {
  const { freeShippingThreshold } = useCart();
  const shippingText = `On all orders over ${formatINR(freeShippingThreshold)}`;

  return (
    <section className="ps-benefits-bar" aria-label="Brand Guarantees & Pillars">
      <div className="ps-benefits-container">
        <div className="ps-benefits-grid">
          {BENEFITS.map((item, index) => (
            <BenefitItem
              key={item.id}
              icon={item.icon}
              title={item.title}
              description={item.id === 'shipping' ? shippingText : item.description}
              isLast={index === BENEFITS.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
