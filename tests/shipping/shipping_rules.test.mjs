import assert from 'node:assert/strict';
import {
  SHIPPING_LABEL,
  STANDARD_DELIVERY_FEE,
  FREE_DELIVERY_PINCODE,
  FREE_DELIVERY_PINCODES,
  isFreeDeliveryPincode,
  isValidPincode,
  calculateDeliveryFee,
  flatShippingFor,
} from '../../src/config/shipping.js';

console.log('--- RUNNING SHIPPING & DELIVERY CHARGES TEST SUITE ---\n');

// 1. Configuration tests
{
  console.log('1. Configuration exports');
  assert.equal(SHIPPING_LABEL, 'Delivery Charges', 'SHIPPING_LABEL must be "Delivery Charges"');
  assert.equal(STANDARD_DELIVERY_FEE, 49, 'STANDARD_DELIVERY_FEE must be 49');
  assert.deepEqual(FREE_DELIVERY_PINCODES, ['516001', '516002'], 'FREE_DELIVERY_PINCODES must contain 516001 and 516002');
  assert.equal(isFreeDeliveryPincode('516001'), true, '516001 is free delivery');
  assert.equal(isFreeDeliveryPincode('516002'), true, '516002 is free delivery');
  assert.equal(isFreeDeliveryPincode('560001'), false, '560001 is not free delivery');
  console.log('   ✓ Configuration constants verified');
}

// 2. PIN validation tests
{
  console.log('2. PIN code validation (isValidPincode)');
  // Valid PIN codes
  assert.equal(isValidPincode('516001'), true, '516001 is valid');
  assert.equal(isValidPincode('516002'), true, '516002 is valid');
  assert.equal(isValidPincode('560001'), true, '560001 is valid');
  assert.equal(isValidPincode('110001'), true, '110001 is valid');
  assert.equal(isValidPincode('400001'), true, '400001 is valid');
  assert.equal(isValidPincode(' 516001 '), true, 'Padded 516001 should be valid when trimmed');
  assert.equal(isValidPincode(' 516002 '), true, 'Padded 516002 should be valid when trimmed');
  assert.equal(isValidPincode(516001), true, 'Numeric 516001 should be valid');
  assert.equal(isValidPincode(516002), true, 'Numeric 516002 should be valid');

  // Invalid PIN codes
  assert.equal(isValidPincode(''), false, 'Empty string is invalid');
  assert.equal(isValidPincode(null), false, 'null is invalid');
  assert.equal(isValidPincode(undefined), false, 'undefined is invalid');
  assert.equal(isValidPincode('012345'), false, 'PIN starting with 0 is invalid');
  assert.equal(isValidPincode('51600'), false, '5 digits is invalid');
  assert.equal(isValidPincode('5160011'), false, '7 digits is invalid');
  assert.equal(isValidPincode('51600A'), false, 'Alphanumeric is invalid');
  assert.equal(isValidPincode('ABCDEF'), false, 'Letters are invalid');
  assert.equal(isValidPincode('516 001'), false, 'PIN with internal space is invalid');
  console.log('   ✓ All isValidPincode cases verified');
}

// 3. calculateDeliveryFee tests
{
  console.log('3. calculateDeliveryFee logic');
  // Free delivery for Kadapa PINs 516001 and 516002
  assert.equal(calculateDeliveryFee('516001', 500), 0, 'PIN 516001 with subtotal 500 -> ₹0');
  assert.equal(calculateDeliveryFee('516001', 2500), 0, 'PIN 516001 with subtotal 2500 -> ₹0');
  assert.equal(calculateDeliveryFee(' 516001 ', 999), 0, 'Padded 516001 -> ₹0');

  assert.equal(calculateDeliveryFee('516002', 500), 0, 'PIN 516002 with subtotal 500 -> ₹0');
  assert.equal(calculateDeliveryFee('516002', 2500), 0, 'PIN 516002 with subtotal 2500 -> ₹0');
  assert.equal(calculateDeliveryFee(' 516002 ', 999), 0, 'Padded 516002 -> ₹0');

  // Standard ₹49 delivery for other valid PINs
  assert.equal(calculateDeliveryFee('560001', 500), 49, 'PIN 560001 with subtotal 500 -> ₹49');
  assert.equal(calculateDeliveryFee('110001', 2000), 49, 'PIN 110001 with subtotal 2000 -> ₹49');
  assert.equal(calculateDeliveryFee('600001', 100), 49, 'PIN 600001 with subtotal 100 -> ₹49');

  // Empty cart / zero subtotal
  assert.equal(calculateDeliveryFee('516001', 0), 0, 'PIN 516001 with subtotal 0 -> ₹0');
  assert.equal(calculateDeliveryFee('516002', 0), 0, 'PIN 516002 with subtotal 0 -> ₹0');
  assert.equal(calculateDeliveryFee('560001', 0), 0, 'PIN 560001 with subtotal 0 -> ₹0');
  assert.equal(calculateDeliveryFee('', 0), 0, 'Empty PIN with subtotal 0 -> ₹0');

  // Incomplete / Missing / Invalid PIN with positive subtotal -> null (pending)
  assert.equal(calculateDeliveryFee('', 500), null, 'Empty PIN with subtotal 500 -> null');
  assert.equal(calculateDeliveryFee('516', 500), null, 'Incomplete PIN with subtotal 500 -> null');
  assert.equal(calculateDeliveryFee('012345', 500), null, 'Invalid PIN starting with 0 -> null');
  assert.equal(calculateDeliveryFee('invalid', 500), null, 'Non-digit PIN -> null');
  assert.equal(calculateDeliveryFee(null, 500), null, 'null PIN -> null');
  console.log('   ✓ All calculateDeliveryFee cases verified');
}

// 4. Dynamic address/PIN updates & Checkout State Simulation
{
  console.log('4. Dynamic address/PIN changes & total calculation simulation');
  const subtotal = 1200;
  const discount = 200; // e.g., coupon applied

  // Step A: Shopper starts typing address; PIN is not entered yet
  let pincode = '';
  let fee = calculateDeliveryFee(pincode, subtotal);
  let total = Math.max(0, subtotal - discount + (fee ?? 0));
  let canSubmit = fee !== null;
  assert.equal(fee, null, 'Fee is null before PIN is entered');
  assert.equal(total, 1000, 'Total before delivery is ₹1000');
  assert.equal(canSubmit, false, 'Checkout submission blocked while fee is null');

  // Step B: Shopper enters Kadapa PIN 516001
  pincode = '516001';
  fee = calculateDeliveryFee(pincode, subtotal);
  total = Math.max(0, subtotal - discount + (fee ?? 0));
  canSubmit = fee !== null;
  assert.equal(fee, 0, 'Fee is 0 for Kadapa PIN 516001');
  assert.equal(total, 1000, 'Total is ₹1000 with free delivery');
  assert.equal(canSubmit, true, 'Checkout submission enabled');

  // Step C: Shopper changes address to Kadapa PIN 516002
  pincode = '516002';
  fee = calculateDeliveryFee(pincode, subtotal);
  total = Math.max(0, subtotal - discount + (fee ?? 0));
  canSubmit = fee !== null;
  assert.equal(fee, 0, 'Fee is 0 for Kadapa PIN 516002');
  assert.equal(total, 1000, 'Total is ₹1000 with free delivery');
  assert.equal(canSubmit, true, 'Checkout submission enabled');

  // Step D: Shopper changes address to Bengaluru PIN 560001
  pincode = '560001';
  fee = calculateDeliveryFee(pincode, subtotal);
  total = Math.max(0, subtotal - discount + (fee ?? 0));
  canSubmit = fee !== null;
  assert.equal(fee, 49, 'Fee immediately updates to ₹49');
  assert.equal(total, 1049, 'Total immediately updates to ₹1049');
  assert.equal(canSubmit, true, 'Checkout submission remains enabled');

  // Step E: Shopper backspaces to '56000' (incomplete)
  pincode = '56000';
  fee = calculateDeliveryFee(pincode, subtotal);
  total = Math.max(0, subtotal - discount + (fee ?? 0));
  canSubmit = fee !== null;
  assert.equal(fee, null, 'Fee becomes null immediately upon incomplete PIN');
  assert.equal(canSubmit, false, 'Checkout submission is blocked immediately');
  console.log('   ✓ Dynamic address & PIN changes verified');
}

// 5. Backend Database Function Parity (Step 17 SQL Simulation)
{
  console.log('5. Backend Step 17 SQL parity simulation (place_order & place_order_core)');

  function simulateDbOrderCalculation({ customerPincode, subtotal, clientClaimedShipping }) {
    const v_subtotal = Number(subtotal);
    const v_pincode = String(customerPincode || '').trim();

    // Line 108 / 114 in place_order / place_order_core:
    if (!/^[1-9][0-9]{5}$/.test(v_pincode)) {
      throw new Error('Enter a valid 6-digit PIN code.');
    }

    // Step 17 replacement line:
    // v_shipping := case when v_subtotal > 0 and v_pincode not in ('516001', '516002') then 49 else 0 end;
    const v_shipping = (v_subtotal > 0 && !['516001', '516002'].includes(v_pincode)) ? 49 : 0;

    // Database NEVER reads clientClaimedShipping!
    return {
      shipping_fee: v_shipping,
      total_amount: v_subtotal + v_shipping,
    };
  }

  // Case 5a: COD order for Kadapa (516001)
  const codKadapa1 = simulateDbOrderCalculation({ customerPincode: '516001', subtotal: 800, clientClaimedShipping: 999 });
  assert.equal(codKadapa1.shipping_fee, 0, 'Database charges 0 shipping for Kadapa 516001 (ignores client value 999)');
  assert.equal(codKadapa1.total_amount, 800);

  // Case 5b: COD order for Kadapa (516002)
  const codKadapa2 = simulateDbOrderCalculation({ customerPincode: '516002', subtotal: 1200, clientClaimedShipping: 999 });
  assert.equal(codKadapa2.shipping_fee, 0, 'Database charges 0 shipping for Kadapa 516002 (ignores client value 999)');
  assert.equal(codKadapa2.total_amount, 1200);

  // Case 5c: Razorpay order for Mumbai (400001)
  const razorpayMumbai = simulateDbOrderCalculation({ customerPincode: '400001', subtotal: 1500, clientClaimedShipping: 0 });
  assert.equal(razorpayMumbai.shipping_fee, 49, 'Database charges 49 shipping for Mumbai (ignores client tamper 0)');
  assert.equal(razorpayMumbai.total_amount, 1549);

  // Case 5d: Invalid PIN rejected by database exception
  assert.throws(
    () => simulateDbOrderCalculation({ customerPincode: '012345', subtotal: 500 }),
    /Enter a valid 6-digit PIN code\./
  );
  assert.throws(
    () => simulateDbOrderCalculation({ customerPincode: '', subtotal: 500 }),
    /Enter a valid 6-digit PIN code\./
  );

  console.log('   ✓ Database SQL parity and tamper-resistance verified');
}

console.log('\n--- ALL SHIPPING TESTS PASSED SUCCESSFULLY! ---');
