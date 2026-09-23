/**
 * PS PERFUMES — Indian Currency (INR ₹) Formatting Utility
 * Formats numbers into Indian numbering system (e.g. ₹549, ₹1,499, ₹10,999)
 */

export function formatINR(amount, options = {}) {
  const { showDecimals = false } = options;
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }

  const num = Number(amount);
  if (showDecimals) {
    return `₹${num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

export default formatINR;
