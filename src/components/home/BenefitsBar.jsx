import React from 'react';
import { Truck, ShieldCheck, CreditCard, Gift } from 'lucide-react';
import BenefitItem from './BenefitItem';
import './BenefitsBar.css';

const BENEFITS = [
  {
    id: 'shipping',
    icon: Truck,
    title: 'FREE SHIPPING',
    description: 'On all orders over ₹1,500',
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
    title: 'SECURE CHECKOUT',
    description: 'Multiple Payment Options',
  },
  {
    id: 'packaging',
    icon: Gift,
    title: 'LUXURY PACKAGING',
    description: 'Perfect for Gifting',
  },
];

export default function BenefitsBar() {
  return (
    <section className="ps-benefits-bar" aria-label="Brand Guarantees & Pillars">
      <div className="ps-benefits-container">
        <div className="ps-benefits-grid">
          {BENEFITS.map((item, index) => (
            <BenefitItem
              key={item.id}
              icon={item.icon}
              title={item.title}
              description={item.description}
              isLast={index === BENEFITS.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
