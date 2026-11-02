import { before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ENV, anon, captured, checkoutResponse, db, jsonResponse, logs, makeDue, minutesAway, newOrder, orderRow, outbox,
  resetStubs, service, stub, types, verifyRequest, waitForRest, webhookRequest, workerRequest,
} from './helpers.mjs';

const { POST: webhook } = await import('../../api/razorpay-webhook.js');
const { POST: verify } = await import('../../api/verify-payment.js');
const { POST: worker } = await import('../../api/process-notifications.js');
const { POST: createOrder } = await import('../../api/create-order.js');
const { callRpc } = await import('../../api/_lib/supabaseAdmin.js');
const { customerEmail } = await import('../../api/_lib/email.js');
const { finalizePayment } = await import('../../api/_lib/finalizePayment.js');

// The checkout's browser module, with the one build-time value Vite would fill in
const browserSource = fs.readFileSync('src/services/payments.js', 'utf8')
  .replace(/import\.meta\.env\.VITE_RAZORPAY_KEY_ID/g, "'rzp_test_fake'");
assert.ok(!browserSource.includes('import.meta'));
const browserFile = path.join(os.tmpdir(), `ps-payments-${crypto.randomUUID()}.mjs`);
fs.writeFileSync(browserFile, browserSource);
const browser = await import(pathToFileURL(browserFile).href);

const ZERO_LEASE = '00000000-0000-0000-0000-000000000000';
const rpcNames = () => stub.rpcCalls.map((call) => call.name);
const sendWebhook = (entity, name) => webhook(webhookRequest(captured(entity, name)));
const paidOrder = async () => {
  const order = await newOrder();
  assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
  return order;
};
const unknownAlert = (pay) => callRpc('enqueue_payment_alert', { p_notification_type: 'unknown_order', p_razorpay_payment_id: pay });
const runWorker = async () => (await worker(workerRequest())).json();
// Failing again and again, the way a long Resend outage would
const failAllResend = () => { stub.resend = () => jsonResponse({ name: 'application_error' }, 500); };

before(waitForRest);
beforeEach(async () => {
  resetStubs();
  await db('test_reset');
  await db('test_shipping', { p_pincode: null, p_charge: null });
});

describe('design checks: Migration 10 through real PostgREST', () => {
  test('the service key really acts as service_role, and the anon key as anon', async () => {
    assert.equal(await callRpc('test_whoami'), 'service_role');
    assert.equal((await anon.rpc('test_whoami')).data, 'anon');
  });

  test('anon is refused on all five functions', async () => {
    const calls = {
      finalize_payment_and_enqueue: { p_razorpay_order_id: 'order_X', p_razorpay_payment_id: 'pay_X', p_amount_paise: 1 },
      enqueue_payment_alert: { p_notification_type: 'unknown_order', p_razorpay_payment_id: 'pay_X' },
      claim_notifications: {},
      complete_notification: { p_id: ZERO_LEASE, p_lease_token: ZERO_LEASE, p_resend_id: 'x' },
      fail_notification: { p_id: ZERO_LEASE, p_lease_token: ZERO_LEASE, p_error: 'x' },
    };
    for (const [name, args] of Object.entries(calls)) {
      const { error } = await anon.rpc(name, args);
      assert.equal(error?.code, '42501', name);
    }
  });

  test('service_role has functions only: the table itself is refused', async () => {
    const { error } = await service.from('notification_outbox').select('id');
    assert.equal(error?.code, '42501');
  });

  test('claim_notifications returns arrays, empty included', async () => {
    assert.deepEqual(await callRpc('claim_notifications', {}), []);
    await unknownAlert('pay_Shape1');
    const rows = await callRpc('claim_notifications', { p_limit: 5, p_lease_seconds: 30, p_order_id: null });
    assert.ok(Array.isArray(rows));
    assert.deepEqual(Object.keys(rows[0]).sort(), ['attempt_count', 'dedupe_key', 'id', 'lease_token', 'notification_type', 'order_id', 'payload', 'razorpay_order_id', 'razorpay_payment_id']);
  });

  test('scalar returns: enqueue and complete give booleans, a lost lease gives false or null', async () => {
    assert.equal(await unknownAlert('pay_Shape2'), true);
    assert.equal(await unknownAlert('pay_Shape2'), false);
    const [row] = await callRpc('claim_notifications', {});
    assert.equal(await callRpc('complete_notification', { p_id: row.id, p_lease_token: ZERO_LEASE, p_resend_id: 'x' }), false);
    assert.equal(await callRpc('fail_notification', { p_id: row.id, p_lease_token: ZERO_LEASE, p_error: 'x' }), null);
    assert.equal(await callRpc('fail_notification', { p_id: row.id, p_lease_token: row.lease_token, p_error: 'x' }), 'pending');
  });

  test('finalize return shape for all five results', async () => {
    const order = await newOrder();
    const call = (rz, pay, amount) => finalizePayment({ razorpayOrderId: rz, razorpayPaymentId: pay, amountPaise: amount });
    assert.deepEqual(await call(order.rz, order.pay, order.paise), { result: 'paid', order_id: order.id, notifications_queued: 2 });
    assert.deepEqual(await call(order.rz, order.pay, order.paise), { result: 'already_paid', order_id: order.id, notifications_queued: 0 });
    const second = await call(order.rz, `${order.pay}x`, order.paise);
    assert.equal(second.result, 'duplicate_payment');
    assert.equal(second.notifications_queued, 1);
    assert.equal(second.new_flag, true);
    assert.ok(second.order_number);
    assert.deepEqual(await call(order.rz, `${order.pay}y`, 1), { result: 'amount_mismatch', order_id: order.id, notifications_queued: 1 });
    assert.deepEqual(await call('order_Nope1', `${order.pay}z`, 500), { result: 'not_found', notifications_queued: 1 });
  });

  test('P0001 keeps its code through callRpc, and a null amount never pays', async () => {
    const order = await newOrder();
    await assert.rejects(
      callRpc('finalize_payment_and_enqueue', { p_razorpay_order_id: order.rz, p_razorpay_payment_id: order.pay, p_amount_paise: null }),
      (err) => err.code === 'P0001' && /amount is required/.test(err.dbMessage),
    );
    assert.equal((await orderRow(order.rz)).payment_status, 'pending');
  });

  test('a missing amount key is not a function PostgREST can find', async () => {
    const { error } = await service.rpc('finalize_payment_and_enqueue', { p_razorpay_order_id: 'order_X', p_razorpay_payment_id: 'pay_X' });
    assert.equal(error?.code, 'PGRST202');
  });
});

describe('webhook: payment outcomes', () => {
  test('paid: stored, order paid, nothing sent', async () => {
    const order = await newOrder();
    const res = await sendWebhook(stub.payments[order.pay]);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });
    assert.equal((await orderRow(order.rz)).payment_status, 'paid');
    assert.deepEqual(types(await outbox()), ['customer_receipt', 'owner_paid']);
    assert.equal(stub.resendCalls.length, 0);
  });

  test('already_paid: redelivery and order.paid add nothing', async () => {
    const order = await paidOrder();
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
    assert.equal((await sendWebhook(stub.payments[order.pay], 'order.paid')).status, 200);
    assert.equal((await outbox()).length, 2);
  });

  test('five deliveries at once: one result, two rows', async () => {
    const order = await newOrder();
    const results = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(stub.payments[order.pay])));
    assert.ok(results.every((res) => res.status === 200));
    assert.equal((await outbox()).length, 2);
  });

  test('duplicate_payment: one alert, however often it arrives', async () => {
    const order = await paidOrder();
    const second = { ...stub.payments[order.pay], id: `${order.pay}b` };
    await sendWebhook(second);
    await sendWebhook(second);
    assert.deepEqual(types(await outbox()), ['customer_receipt', 'duplicate_payment', 'owner_paid']);
    assert.equal((await orderRow(order.rz)).razorpay_payment_id, order.pay);
  });

  test('amount_mismatch: order stays unpaid, alert has both amounts', async () => {
    const order = await newOrder();
    const res = await sendWebhook({ ...stub.payments[order.pay], amount: 100 });
    assert.equal(res.status, 200);
    assert.equal((await orderRow(order.rz)).payment_status, 'pending');
    const [row] = await outbox();
    assert.equal(row.notification_type, 'amount_mismatch');
    assert.deepEqual(row.payload, { amount_paise: 100, expected_paise: order.paise });
  });

  test('not_found: unknown order is alerted with no order link', async () => {
    const res = await sendWebhook({ id: 'pay_Unknown1', order_id: 'order_Unknown1', amount: 5000, currency: 'INR', status: 'captured' });
    assert.equal(res.status, 200);
    const [row] = await outbox();
    assert.equal(row.notification_type, 'unknown_order');
    assert.equal(row.order_id, null);
  });

  test('cancelled before payment: refund notices', async () => {
    const order = await newOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: 'cancelled', p_payment_status: null });
    await sendWebhook(stub.payments[order.pay]);
    assert.deepEqual(types(await outbox()), ['customer_paid_after_cancel', 'owner_refund_needed']);
  });

  test('returns without waiting for Resend, even if Resend would hang', async () => {
    stub.resend = () => new Promise(() => {});
    const order = await newOrder();
    const started = Date.now();
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
    assert.ok(Date.now() - started < 2000);
    assert.equal(stub.resendCalls.length, 0);
  });
});

describe('webhook: refused and invalid events', () => {
  for (const [label, amount] of [['missing', undefined], ['null', null], ['zero', 0], ['negative', -100], ['decimal', 109900.5], ['string', '109900']]) {
    test(`amount ${label}: not finalized, alert stored, acknowledged`, async () => {
      const order = await newOrder();
      const res = await sendWebhook({ ...stub.payments[order.pay], amount });
      assert.equal(res.status, 200);
      assert.ok(!rpcNames().includes('finalize_payment_and_enqueue'));
      assert.equal((await orderRow(order.rz)).payment_status, 'pending');
      const [row] = await outbox();
      assert.equal(row.notification_type, 'amount_mismatch');
      assert.deepEqual(row.payload, {});
    });
  }

  test('non-INR captured payment: not finalized, alert stored without its amount', async () => {
    const order = await newOrder();
    const res = await sendWebhook({ ...stub.payments[order.pay], currency: 'USD' });
    assert.equal(res.status, 200);
    assert.ok(!rpcNames().includes('finalize_payment_and_enqueue'));
    assert.equal((await orderRow(order.rz)).payment_status, 'pending');
    const [row] = await outbox();
    assert.equal(row.notification_type, 'amount_mismatch');
    assert.deepEqual(row.payload, {});
    await sendWebhook({ ...stub.payments[order.pay], currency: 'USD' });
    assert.equal((await outbox()).length, 1);
  });

  test('invalid signature: 400, nothing touched', async () => {
    const order = await newOrder();
    const res = await webhook(webhookRequest(captured(stub.payments[order.pay]), 'wrong-secret'));
    assert.equal(res.status, 400);
    assert.deepEqual(rpcNames(), []);
    assert.equal((await orderRow(order.rz)).payment_status, 'pending');
  });

  test('payment not captured: ignored as before', async () => {
    const order = await newOrder();
    const res = await sendWebhook({ ...stub.payments[order.pay], status: 'authorized' });
    assert.equal(res.status, 200);
    assert.deepEqual(rpcNames(), []);
  });

  test('event without an order: ignored as before', async () => {
    assert.equal((await sendWebhook({ id: 'pay_NoOrder' })).status, 200);
    assert.deepEqual(rpcNames(), []);
  });

  test('payment.failed still records the failure and queues nothing', async () => {
    const order = await newOrder();
    const res = await sendWebhook({ ...stub.payments[order.pay], status: 'failed', error_description: 'Declined' }, 'payment.failed');
    assert.equal(res.status, 200);
    assert.equal((await orderRow(order.rz)).payment_status, 'failed');
    assert.equal((await outbox()).length, 0);
  });

  test('unusable payment id: logged sanitized and acknowledged, since the outbox needs it', async () => {
    const res = await sendWebhook({ id: 'bad id; drop', order_id: 'order_Bad1', amount: 5000, currency: 'INR', status: 'captured' });
    assert.equal(res.status, 200);
    assert.equal((await outbox()).length, 0);
    assert.ok(!rpcNames().includes('finalize_payment_and_enqueue'));
    assert.ok(logs.some((line) => line.includes('payment_incident') && line.includes('[invalid]')));
    assert.ok(!logs.some((line) => line.includes('bad id; drop')));
  });

  test('unusable order id with a good payment id: alert stored without it', async () => {
    const res = await sendWebhook({ id: 'pay_BadOrder1', order_id: 'not valid!', amount: 5000, currency: 'INR', status: 'captured' });
    assert.equal(res.status, 200);
    const [row] = await outbox();
    assert.equal(row.razorpay_order_id, null);
  });
});

describe('webhook: failures', () => {
  test('database unreachable: 500, then redelivery completes it', async () => {
    const order = await newOrder();
    stub.rpcFail.finalize_payment_and_enqueue = 'network';
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 500);
    assert.equal((await orderRow(order.rz)).payment_status, 'pending');
    assert.equal((await outbox()).length, 0);
    stub.rpcFail = {};
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
    assert.equal((await orderRow(order.rz)).payment_status, 'paid');
    assert.equal((await outbox()).length, 2);
  });

  test('PostgREST 503: retryable', async () => {
    const order = await newOrder();
    stub.rpcFail.finalize_payment_and_enqueue = { status: 503, body: { code: 'PGRST001', message: 'Could not connect' } };
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 500);
  });

  test('P0001 from finalize: acknowledged only after the incident is stored', async () => {
    const order = await newOrder();
    stub.rpcFail.finalize_payment_and_enqueue = { status: 400, body: { code: 'P0001', message: 'Unexpected payment outcome' } };
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
    assert.deepEqual(types(await outbox()), ['amount_mismatch']);
    assert.ok(logs.some((line) => line.includes('refused_by_database')));
  });

  test('P0001, then the incident cannot be stored for now: 500, so Razorpay retries', async () => {
    const order = await newOrder();
    stub.rpcFail.finalize_payment_and_enqueue = { status: 400, body: { code: 'P0001', message: 'Unexpected payment outcome' } };
    stub.rpcFail.enqueue_payment_alert = 'network';
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 500);
    delete stub.rpcFail.enqueue_payment_alert;
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
    assert.equal((await outbox()).length, 1);
  });

  test('P0001 from the incident itself: logged and acknowledged, no endless retry', async () => {
    const order = await newOrder();
    stub.rpcFail.enqueue_payment_alert = { status: 400, body: { code: 'P0001', message: 'Invalid Razorpay identifier' } };
    assert.equal((await sendWebhook({ ...stub.payments[order.pay], currency: 'USD' })).status, 200);
    assert.ok(logs.some((line) => line.includes('payment_incident_not_stored')));
  });

  test('non-INR with the database down: 500, not a silent loss', async () => {
    const order = await newOrder();
    stub.rpcFail.enqueue_payment_alert = 'network';
    assert.equal((await sendWebhook({ ...stub.payments[order.pay], currency: 'USD' })).status, 500);
  });
});

describe('verify-payment', () => {
  test('sends both e-mails at once, keyed by dedupe_key, only then marks sent', async () => {
    const order = await newOrder();
    const res = await verify(verifyRequest(order));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.verified, true);
    assert.equal(body.order.payment_status, 'paid');
    const rows = await outbox();
    assert.ok(rows.every((row) => row.status === 'sent' && row.resend_id.startsWith('re_fake_') && row.delivered_at));
    assert.deepEqual(stub.delivered.map((call) => call.key).sort(), rows.map((row) => row.dedupe_key).sort());
    const saved = await orderRow(order.rz);
    assert.ok(saved.customer_email_sent_at && saved.owner_email_sent_at);
  });

  test('passes the amount Razorpay reports; anything the browser sends is ignored', async () => {
    const order = await newOrder();
    await verify(verifyRequest(order, { amount: 1, amount_paise: 1 }));
    const call = stub.rpcCalls.find((entry) => entry.name === 'finalize_payment_and_enqueue');
    assert.equal(call.args.p_amount_paise, stub.payments[order.pay].amount);
  });

  test('authorized payment is captured, then finalized and e-mailed', async () => {
    const order = await newOrder();
    stub.payments[order.pay].status = 'authorized';
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.deepEqual(stub.captures, [{ id: order.pay, body: { amount: order.paise, currency: 'INR' } }]);
    assert.equal(stub.delivered.length, 2);
  });

  test('capture reports another amount: that amount is what gets checked, so it is not paid', async () => {
    const order = await newOrder();
    stub.payments[order.pay].status = 'authorized';
    stub.captureAmount = 100;
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 409);
    assert.equal((await orderRow(order.rz)).payment_status, 'pending');
    assert.deepEqual(types(await outbox()), ['amount_mismatch']);
  });

  test('Resend failure does not change a verified payment; the row stays for retry', async () => {
    const order = await newOrder();
    failAllResend();
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).verified, true);
    const rows = await outbox();
    assert.ok(rows.every((row) => row.status === 'pending' && row.attempt_count === 1));
    assert.equal((await orderRow(order.rz)).customer_email_sent_at, null);
  });

  test('Resend timeout does not change a verified payment', async () => {
    const order = await newOrder();
    stub.resend = () => { throw new DOMException('timed out', 'TimeoutError'); };
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.ok((await outbox()).every((row) => row.last_error === 'Resend timed out'));
  });

  test('claim failure does not change a verified payment; rows stay untouched', async () => {
    const order = await newOrder();
    stub.rpcFail.claim_notifications = 'network';
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.ok((await outbox()).every((row) => row.status === 'pending' && row.attempt_count === 0));
  });

  test('fail_notification failure does not change it either; the lease recovers the row', async () => {
    const order = await newOrder();
    failAllResend();
    stub.rpcFail.fail_notification = 'network';
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.ok((await outbox()).every((row) => row.status === 'processing'));
    resetStubs();
    await makeDue();
    assert.equal((await runWorker()).sent, 2);
  });

  test('accepted, then complete fails: retry resends the same key and nothing goes out twice', async () => {
    const order = await newOrder();
    stub.rpcFail.complete_notification = 'network';
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.equal(stub.delivered.length, 2);
    assert.ok((await outbox()).every((row) => row.status === 'processing'));
    delete stub.rpcFail.complete_notification;
    await makeDue();
    assert.equal((await runWorker()).sent, 2);
    assert.equal(stub.delivered.length, 2);
    assert.equal(stub.resendCalls.length, 4);
  });

  test('missing e-mail settings: payment verified, nothing claimed, no attempt used', async () => {
    const order = await newOrder();
    delete process.env.RESEND_API_KEY;
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.ok(!rpcNames().includes('claim_notifications'));
    assert.ok((await outbox()).every((row) => row.status === 'pending' && row.attempt_count === 0));
  });

  test('amount mismatch: same 400 answer, alert with both amounts, not finalized', async () => {
    const order = await newOrder();
    stub.payments[order.pay].amount = 100;
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'The payment could not be verified.' });
    assert.ok(!rpcNames().includes('finalize_payment_and_enqueue'));
    const [row] = await outbox();
    assert.deepEqual(row.payload, { amount_paise: 100, expected_paise: order.paise });
    assert.equal(row.order_id, order.id);
  });

  test('wrong currency: same 400, alert leaves out the foreign amount', async () => {
    const order = await newOrder();
    stub.payments[order.pay].currency = 'USD';
    assert.equal((await verify(verifyRequest(order))).status, 400);
    assert.deepEqual((await outbox())[0].payload, { expected_paise: order.paise });
  });

  test('payment belongs to another order: same 400, alert stored', async () => {
    const order = await newOrder();
    stub.payments[order.pay].order_id = 'order_Other1';
    assert.equal((await verify(verifyRequest(order))).status, 400);
    assert.deepEqual(types(await outbox()), ['amount_mismatch']);
  });

  test('alert failure does not change the 400', async () => {
    const order = await newOrder();
    stub.payments[order.pay].amount = 100;
    stub.rpcFail.enqueue_payment_alert = 'network';
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'The payment could not be verified.' });
  });

  test('webhook and browser mismatch alerts share one key', async () => {
    const order = await newOrder();
    stub.payments[order.pay].amount = 100;
    await verify(verifyRequest(order));
    await sendWebhook(stub.payments[order.pay]);
    assert.equal((await outbox()).length, 1);
  });

  test('duplicate payment: same 409, and the owner is told at once', async () => {
    const order = await paidOrder();
    const second = `${order.pay}b`;
    stub.payments[second] = { ...stub.payments[order.pay], id: second };
    const res = await verify(verifyRequest({ rz: order.rz, pay: second }));
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: 'The payment needs a manual check. Please contact us and do not pay again.', pending: true });
    assert.ok(stub.delivered.some((call) => call.body.subject.startsWith('Refund needed: second payment')));
  });

  test('authorized on a cancelled order: same 409, nothing captured', async () => {
    const order = await newOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: 'cancelled', p_payment_status: null });
    stub.payments[order.pay].status = 'authorized';
    assert.equal((await verify(verifyRequest(order))).status, 409);
    assert.deepEqual(stub.captures, []);
  });

  const secondAuthorized = (order) => {
    const pay = `${order.pay}b`;
    stub.payments[pay] = { ...stub.payments[order.pay], id: pay, status: 'authorized' };
    return { rz: order.rz, pay };
  };

  test('second payment authorized on a paid order: not captured, the first payment stays', async () => {
    const order = await paidOrder();
    const second = secondAuthorized(order);
    const res = await verify(verifyRequest(second));
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.alreadyPaid, true);
    assert.equal(body.pending, undefined);
    assert.deepEqual(stub.captures, []);
    const saved = await orderRow(order.rz);
    assert.equal(saved.razorpay_payment_id, order.pay);
    assert.equal(saved.duplicate_payment_id, null);
    // Nothing was taken, so no refund alert
    assert.deepEqual(types(await outbox()), ['customer_receipt', 'owner_paid']);
  });

  test('if Razorpay captures that second payment anyway, the webhook still raises the refund alert', async () => {
    const order = await paidOrder();
    const second = secondAuthorized(order);
    await verify(verifyRequest(second));
    stub.payments[second.pay].status = 'captured';
    assert.equal((await sendWebhook(stub.payments[second.pay])).status, 200);
    assert.equal((await orderRow(order.rz)).duplicate_payment_id, second.pay);
    assert.deepEqual(types(await outbox()), ['customer_receipt', 'duplicate_payment', 'owner_paid']);
  });

  test('second payment authorized on a refunded order: not captured', async () => {
    const order = await paidOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: null, p_payment_status: 'refunded' });
    const res = await verify(verifyRequest(secondAuthorized(order)));
    assert.equal(res.status, 409);
    assert.deepEqual(stub.captures, []);
  });

  test('Razorpay reports the payment refunded: structured 409, not pending, nothing finalized', async () => {
    const order = await paidOrder();
    stub.payments[order.pay].status = 'refunded';
    const before = stub.rpcCalls.length;
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.refunded, true);
    assert.equal(body.pending, undefined);
    assert.ok(!stub.rpcCalls.slice(before).some((call) => call.name === 'finalize_payment_and_enqueue'));
  });

  test('order refunded in the database: no missing receipt, structured 409', async () => {
    const order = await paidOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: null, p_payment_status: 'refunded' });
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.refunded, true);
    assert.equal(body.verified, undefined);
    assert.equal(body.order, undefined);
  });

  test('no receipt for a paid order: pending, never a success without one', async () => {
    const order = await newOrder();
    stub.rpcFail.get_order_receipt = { status: 200, body: null };
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: 'We could not confirm the payment yet.', pending: true });
    assert.equal((await orderRow(order.rz)).payment_status, 'paid');
  });

  test('invalid signature: same 400, no RPC', async () => {
    const order = await newOrder();
    const res = await verify(verifyRequest(order, { razorpay_signature: 'wrong' }));
    assert.equal(res.status, 400);
    assert.deepEqual(rpcNames(), []);
  });

  test('database failure during finalize: same 502 pending answer', async () => {
    const order = await newOrder();
    stub.rpcFail.finalize_payment_and_enqueue = 'network';
    const res = await verify(verifyRequest(order));
    assert.equal(res.status, 502);
    assert.equal((await res.json()).pending, true);
  });

  test('webhook first, then the browser: the browser delivers; each person gets one e-mail', async () => {
    const order = await paidOrder();
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.equal(stub.delivered.length, 2);
  });

  test('browser and webhook together: each person gets one e-mail', async () => {
    const order = await newOrder();
    await Promise.all([verify(verifyRequest(order)), verify(verifyRequest(order)), sendWebhook(stub.payments[order.pay])]);
    await runWorker();
    assert.equal(stub.delivered.length, 2);
    assert.equal(new Set(stub.delivered.map((call) => call.key)).size, 2);
  });
});

describe('checkout verification in the browser (src/services/payments.js)', () => {
  const answer = (response) => { stub.browser = async () => response; };
  // The browser's calls reach the real handler, as they do once deployed
  const realServer = () => {
    stub.browser = (url, init) => verify(new Request(`http://test.invalid${url}`, init));
  };
  const isPending = (err) => err.pending === true;
  const someCheckout = { razorpay_order_id: 'order_X1', razorpay_payment_id: 'pay_X1', razorpay_signature: 'x' };

  test('verification answers 500: pending, never paid', async () => {
    answer(jsonResponse({ error: 'Temporary failure' }, 500));
    await assert.rejects(browser.verifyPayment(someCheckout), isPending);
  });

  test('platform error page instead of JSON (504): pending', async () => {
    answer(new Response('<html>An error occurred with this application.</html>', { status: 504 }));
    await assert.rejects(browser.verifyPayment(someCheckout), isPending);
  });

  test('non-JSON 200: pending, not a success', async () => {
    answer(new Response('<!doctype html><title>PS PERFUMES</title>', { status: 200 }));
    await assert.rejects(browser.verifyPayment(someCheckout), isPending);
  });

  test('unreadable body cut off mid-answer: pending', async () => {
    answer(new Response('{"verified":tr', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await assert.rejects(browser.verifyPayment(someCheckout), isPending);
  });

  test('verified but with no receipt: pending, never a success', async () => {
    answer(jsonResponse({ verified: true, order: null }));
    await assert.rejects(browser.verifyPayment(someCheckout), isPending);
  });

  test('no network: pending', async () => {
    stub.browser = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(browser.verifyPayment(someCheckout), isPending);
  });

  test('verification times out after 30 seconds: pending', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    stub.browser = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
    const result = browser.verifyPayment(someCheckout);
    t.mock.timers.tick(29999);
    let settled = false;
    result.then(() => {}, () => {}).finally(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    t.mock.timers.tick(1);
    await assert.rejects(result, isPending);
  });

  test('payment succeeds but browser verification fails: pending, then the check confirms it', async () => {
    realServer();
    const order = await newOrder();
    stub.rpcFail.finalize_payment_and_enqueue = 'network';
    await assert.rejects(browser.verifyPayment(checkoutResponse(order)), isPending);
    assert.equal((await orderRow(order.rz)).payment_status, 'pending');

    // The webhook completes the order meanwhile; the shopper presses Check Payment Status
    delete stub.rpcFail.finalize_payment_and_enqueue;
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
    const result = await browser.verifyPayment(checkoutResponse(order));
    assert.equal(result.verified, true);
    assert.equal(result.order.payment_status, 'paid');
    assert.equal(result.order.razorpay_payment_id, order.pay);
    assert.equal(stub.delivered.length, 2);
  });

  test('a definite refusal (wrong signature) is not pending', async () => {
    realServer();
    const order = await newOrder();
    await assert.rejects(
      browser.verifyPayment({ ...checkoutResponse(order), razorpay_signature: 'wrong' }),
      (err) => err.pending === false && err.message === 'The payment could not be verified.',
    );
  });

  test('refunded order: a clear refusal the page can show, no crash', async () => {
    realServer();
    const order = await paidOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: null, p_payment_status: 'refunded' });
    await assert.rejects(
      browser.verifyPayment(checkoutResponse(order)),
      (err) => err.pending === false && err.refunded === true && /refunded/.test(err.message),
    );
  });

  test('second payment on a paid order: a clear refusal, not pending', async () => {
    realServer();
    const order = await paidOrder();
    const pay = `${order.pay}b`;
    stub.payments[pay] = { ...stub.payments[order.pay], id: pay, status: 'authorized' };
    await assert.rejects(
      browser.verifyPayment(checkoutResponse({ rz: order.rz, pay })),
      (err) => err.pending === false && /already paid/.test(err.message),
    );
  });

  test('an unconfirmed payment survives a reload, and is forgotten once settled', () => {
    const store = new Map();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
      },
    });
    try {
      assert.equal(browser.getUnconfirmedPayment(), null);
      browser.rememberUnconfirmedPayment(someCheckout);
      assert.deepEqual(browser.getUnconfirmedPayment(), someCheckout);
      browser.rememberUnconfirmedPayment(null);
      assert.equal(browser.getUnconfirmedPayment(), null);
      store.set('ps_unconfirmed_payment', '{broken');
      assert.equal(browser.getUnconfirmedPayment(), null);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
      else delete globalThis.sessionStorage;
    }
  });

  test('without session storage (private mode), nothing throws', () => {
    assert.doesNotThrow(() => browser.rememberUnconfirmedPayment(someCheckout));
    assert.equal(typeof browser.getUnconfirmedPayment, 'function');
  });
});

describe('Resend answers, through the worker', () => {
  const oneRow = async (respond) => {
    await paidOrderOneRow();
    stub.resend = respond;
    await runWorker();
    return (await outbox())[0];
  };
  // One row is enough here: an owner alert, with no order involved
  const paidOrderOneRow = () => unknownAlert(`pay_R${crypto.randomBytes(5).toString('hex')}`);

  test('accepted with an id: sent', async () => {
    const row = await oneRow(null);
    assert.equal(row.status, 'sent');
    assert.equal(row.resend_id, 're_fake_1');
  });

  test('accepted with no id: not marked sent', async () => {
    const row = await oneRow(() => jsonResponse({}));
    assert.equal(row.status, 'pending');
    assert.equal(row.attempt_count, 1);
    assert.equal(row.delivered_at, null);
  });

  test('429 with Retry-After: retried, later as asked', async () => {
    const row = await oneRow(() => jsonResponse({ name: 'rate_limit_exceeded' }, 429, { 'retry-after': '7200' }));
    assert.equal(row.status, 'pending');
    assert.equal(row.attempt_count, 1);
    assert.equal(minutesAway(row), 120);
    assert.equal(row.last_error, 'Resend 429 rate_limit_exceeded');
  });

  test('429 quota: retried', async () => {
    assert.equal((await oneRow(() => jsonResponse({ name: 'daily_quota_exceeded' }, 429))).status, 'pending');
  });

  for (const status of [500, 502, 503]) {
    test(`${status}: retried on the first delay`, async () => {
      const row = await oneRow(() => jsonResponse({ name: 'application_error' }, status));
      assert.equal(row.status, 'pending');
      assert.equal(row.attempt_count, 1);
      assert.equal(minutesAway(row), 1);
    });
  }

  test('timeout: retried', async () => {
    const row = await oneRow(() => { throw new DOMException('timed out', 'TimeoutError'); });
    assert.equal(row.status, 'pending');
    assert.equal(row.last_error, 'Resend timed out');
  });

  test('network failure: retried', async () => {
    const row = await oneRow(() => { throw new TypeError('fetch failed'); });
    assert.equal(row.status, 'pending');
    assert.equal(row.last_error, 'Resend could not be reached');
  });

  test('409 concurrent request: retried', async () => {
    assert.equal((await oneRow(() => jsonResponse({ name: 'concurrent_idempotent_requests' }, 409))).status, 'pending');
  });

  test('409 changed body: permanent, and the owner is told', async () => {
    const row = await oneRow((request) => (request.key.startsWith('failed/') ? null : jsonResponse({ name: 'invalid_idempotent_request' }, 409)));
    assert.equal(row.status, 'failed');
    assert.equal(stub.delivered.length, 1);
    assert.equal(stub.delivered[0].key, `failed/${row.id}`);
  });

  test('422: permanent at once, without the provider text', async () => {
    const row = await oneRow((request) => (request.key.startsWith('failed/') ? null : jsonResponse({ name: 'invalid_parameter', message: 'bad a@example.com' }, 422)));
    assert.equal(row.status, 'failed');
    assert.equal(row.attempt_count, 1);
    assert.equal(row.last_error, 'Resend 422 invalid_parameter');
  });

  for (const [status, name] of [[401, 'missing_api_key'], [403, 'restricted_api_key'], [403, 'validation_error']]) {
    test(`${status} ${name}: treated as settings, no attempt used, nothing failed`, async () => {
      const row = await oneRow(() => jsonResponse({ name }, status));
      assert.equal(row.status, 'pending');
      assert.equal(row.attempt_count, 0);
      assert.ok(logs.some((line) => line.includes('notification_rejected_by_settings')));
    });
  }

  test('an unrecognised error name is not stored', async () => {
    const row = await oneRow(() => jsonResponse({ name: 'x@y.example <b>' }, 500));
    assert.equal(row.last_error, 'Resend 500 error');
  });
});

describe('worker', () => {
  test('no secret configured: refuses everything', async () => {
    delete process.env.NOTIFICATION_WORKER_SECRET;
    assert.equal((await worker(workerRequest('Bearer undefined'))).status, 500);
    assert.deepEqual(rpcNames(), []);
  });

  for (const [label, header] of [['missing', null], ['wrong', 'Bearer nope'], ['no Bearer', ENV.NOTIFICATION_WORKER_SECRET]]) {
    test(`${label} secret: 401, nothing claimed`, async () => {
      assert.equal((await worker(workerRequest(header))).status, 401);
      assert.deepEqual(rpcNames(), []);
    });
  }

  test('correct secret: processes, and reports counts only', async () => {
    await paidOrder();
    const res = await worker(workerRequest());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { claimed: 2, sent: 2, retrying: 0, failed: 0, skipped: 0, lease_lost: 0, unconfirmed: 0 });
  });

  test('bounded batch: 25 due, 20 per call', async () => {
    for (let i = 0; i < 25; i += 1) await unknownAlert(`pay_Batch${i}`);
    assert.equal((await runWorker()).claimed, 20);
    assert.equal((await runWorker()).claimed, 5);
    assert.equal((await runWorker()).claimed, 0);
  });

  test('concurrent calls: nothing sent twice', async () => {
    for (let i = 0; i < 30; i += 1) await unknownAlert(`pay_Conc${i}`);
    const runs = await Promise.all([runWorker(), runWorker(), runWorker(), runWorker()]);
    await runWorker();
    assert.equal(stub.delivered.length, 30);
    assert.equal(stub.resendCalls.length, 30);
    assert.ok(runs.filter((run) => run.claimed > 0).length > 1);
  });

  test('expired lease: recovered, and the crash counts as an attempt', async () => {
    await unknownAlert('pay_Lease1');
    await callRpc('claim_notifications', { p_limit: 1, p_lease_seconds: 30 });
    assert.equal((await runWorker()).claimed, 0);
    await makeDue();
    assert.equal((await runWorker()).sent, 1);
    const [row] = await outbox();
    assert.equal(row.status, 'sent');
    assert.equal(row.attempt_count, 1);
  });

  test('missing RESEND_API_KEY or EMAIL_FROM: 503, nothing claimed, no attempt used', async () => {
    await unknownAlert('pay_Conf1');
    for (const name of ['RESEND_API_KEY', 'EMAIL_FROM']) {
      resetStubs();
      delete process.env[name];
      assert.equal((await worker(workerRequest())).status, 503);
      assert.deepEqual(rpcNames(), []);
    }
    assert.equal((await outbox())[0].attempt_count, 0);
  });

  test('missing owner address: customer still sent, owner row keeps its attempts', async () => {
    await paidOrder();
    delete process.env.OWNER_NOTIFICATION_EMAIL;
    await runWorker();
    const rows = await outbox();
    assert.equal(rows.find((row) => row.notification_type === 'customer_receipt').status, 'sent');
    const owner = rows.find((row) => row.notification_type === 'owner_paid');
    assert.equal(owner.status, 'pending');
    assert.equal(owner.attempt_count, 0);
  });

  test('all eight attempts, then one alert and no more', async () => {
    await unknownAlert('pay_Retry1');
    failAllResend();
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await makeDue();
      assert.equal((await runWorker()).claimed, 1);
      const [row] = await outbox();
      assert.equal(row.attempt_count, attempt);
      assert.equal(row.status, attempt < 8 ? 'pending' : 'failed');
    }
    assert.equal(stub.resendCalls.filter((call) => call.key === 'payment/pay_Retry1/unknown_order').length, 8);
    assert.equal(stub.resendCalls.filter((call) => call.key.startsWith('failed/')).length, 1);
    await makeDue();
    assert.equal((await runWorker()).claimed, 0);
  });

  test('a failed-delivery alert that itself fails stays one try and adds no row', async () => {
    await unknownAlert('pay_NoLoop1');
    stub.resend = () => jsonResponse({ name: 'invalid_parameter' }, 422);
    const summary = await runWorker();
    assert.equal(summary.failed, 1);
    assert.equal(stub.resendCalls.length, 2);
    assert.equal((await outbox()).length, 1);
    assert.ok(logs.some((line) => line.includes('notification_failure_alert_failed')));
    assert.equal((await runWorker()).claimed, 0);
    assert.equal(stub.resendCalls.length, 2);
  });

  test('failed-delivery alert says nothing about the customer', async () => {
    const order = await paidOrder();
    stub.resend = (request) => (request.key.startsWith('failed/') ? null : jsonResponse({ name: 'invalid_parameter' }, 422));
    await runWorker();
    const alerts = stub.delivered.filter((call) => call.key.startsWith('failed/'));
    assert.equal(alerts.length, 2);
    assert.ok(alerts.every((call) => call.body.to === ENV.OWNER_NOTIFICATION_EMAIL));
    assert.ok(alerts.every((call) => !/example\.com|9876543210|Kadapa/.test(call.body.html)));
    assert.ok(alerts[0].body.html.includes(order.rz));
  });

  test('KNOWN LIMIT: a crash on the final attempt fails inside the claim, so no alert is possible', async () => {
    await unknownAlert('pay_Gap1');
    await callRpc('claim_notifications', { p_limit: 1 });
    await db('test_set_attempts', { p_attempts: 7 });
    await makeDue();
    assert.equal((await runWorker()).claimed, 0);
    const [row] = await outbox();
    assert.equal(row.status, 'failed');
    assert.equal(row.attempt_count, 8);
    assert.equal(stub.resendCalls.length, 0);
  });
});

describe('templates and order state', () => {
  const subjects = () => stub.delivered.map((call) => call.body.subject).sort();

  test('active order: receipt and new-order mail', async () => {
    const order = await paidOrder();
    await runWorker();
    const saved = await orderRow(order.rz);
    assert.deepEqual(subjects(), [`New paid order ${saved.order_number} (₹1,099)`, `Payment received for order ${saved.order_number}`].sort());
    assert.ok(stub.delivered.some((call) => call.body.to === 'a@example.com'));
  });

  test('cancelled before payment: cancelled customer mail and refund-needed alert', async () => {
    const order = await newOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: 'cancelled', p_payment_status: null });
    await sendWebhook(stub.payments[order.pay]);
    await runWorker();
    const { order_number: number } = await orderRow(order.rz);
    assert.deepEqual(subjects(), [`Payment received for cancelled order ${number}`, `Refund needed: payment on cancelled order ${number}`].sort());
  });

  test('cancelled after queuing: templates follow the current status', async () => {
    const order = await paidOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: 'cancelled', p_payment_status: null });
    await runWorker();
    const { order_number: number } = await orderRow(order.rz);
    assert.deepEqual(subjects(), [`Payment received for cancelled order ${number}`, `Refund needed: payment on cancelled order ${number}`].sort());
  });

  test('duplicate payment alert', async () => {
    const order = await paidOrder();
    await sendWebhook({ ...stub.payments[order.pay], id: `${order.pay}b` });
    await runWorker();
    const { order_number: number } = await orderRow(order.rz);
    const alert = stub.delivered.find((call) => call.body.subject === `Refund needed: second payment on order ${number}`);
    assert.ok(alert.body.html.includes(`${order.pay}b`));
    assert.equal(alert.body.to, ENV.OWNER_NOTIFICATION_EMAIL);
  });

  test('amount mismatch alert shows both amounts', async () => {
    const order = await newOrder();
    await sendWebhook({ ...stub.payments[order.pay], amount: 100 });
    await runWorker();
    const [alert] = stub.delivered;
    assert.ok(alert.body.subject.startsWith('Check payment: it does not match order '));
    assert.ok(alert.body.html.includes('₹1') && alert.body.html.includes('₹1,099'));
  });

  test('alert with no amounts says so', async () => {
    const order = await newOrder();
    await sendWebhook({ ...stub.payments[order.pay], currency: 'USD' });
    await runWorker();
    assert.ok(stub.delivered[0].body.html.includes('Not available'));
  });

  test('unknown order alert looks up no order', async () => {
    await sendWebhook({ id: 'pay_Unk2', order_id: 'order_Unk2', amount: 5000, currency: 'INR', status: 'captured' });
    await runWorker();
    assert.ok(!rpcNames().includes('get_payment_order'));
    const [alert] = stub.delivered;
    assert.equal(alert.body.subject, 'Check payment: no order matches pay_Unk2');
    assert.ok(alert.body.html.includes('order_Unk2') && alert.body.html.includes('₹50'));
  });

  test('refunded order: no receipt, no owner mail, no failure alert', async () => {
    const order = await paidOrder();
    await db('test_set_order', { p_rz: order.rz, p_order_status: null, p_payment_status: 'refunded' });
    const summary = await runWorker();
    assert.equal(summary.skipped, 2);
    assert.equal(stub.resendCalls.length, 0);
    assert.ok((await outbox()).every((row) => row.status === 'failed' && row.last_error.startsWith('Skipped')));
  });

  test('deleted order: receipts fail safely and the owner is told', async () => {
    const order = await paidOrder();
    await db('test_delete_order', { p_rz: order.rz });
    const summary = await runWorker();
    assert.equal(summary.failed, 2);
    assert.ok(stub.resendCalls.every((call) => call.key.startsWith('failed/')));
    assert.ok((await outbox()).every((row) => row.status === 'failed' && row.order_id === null));
  });

  test('deleted order: an alert still goes out', async () => {
    const order = await paidOrder();
    await sendWebhook({ ...stub.payments[order.pay], id: `${order.pay}b` });
    await db('test_delete_order', { p_rz: order.rz });
    await runWorker();
    assert.ok(stub.delivered.some((call) => call.body.subject === 'Refund needed: second payment on an order that no longer exists'));
  });

  test('customer text is escaped', () => {
    const { html } = customerEmail({ order_status: 'confirmed', customer_name: '<img src=x>', shipping_address: {} });
    assert.ok(!html.includes('<img') && html.includes('&lt;img'));
  });
});

describe('old claim mechanism', () => {
  test('no API file calls it', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
    const files = walk('api');
    assert.ok(files.length >= 10);
    for (const file of files) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /claim_order_email|release_order_email/, file);
  });

  test('never called across a whole payment, and dates appear only on acceptance', async () => {
    const order = await newOrder();
    failAllResend();
    await verify(verifyRequest(order));
    assert.equal((await orderRow(order.rz)).customer_email_sent_at, null);
    stub.resend = null;
    await makeDue();
    await runWorker();
    assert.ok((await orderRow(order.rz)).customer_email_sent_at);
    assert.ok(!rpcNames().some((name) => /order_email/.test(name)));
  });
});

describe('COD and the kill switch', () => {
  const cod = async (key) => anon.rpc('place_order', {
    p_customer: { first_name: 'A', last_name: 'B', email: 'a@example.com', phone: '9876543210', address: '1 Street', city: 'Kadapa', state: 'AP', pincode: '516001', landmark: '' },
    p_items: [{ type: 'variant', variant_id: '00000000-0000-0000-0000-00000000000a', quantity: 1 }],
    p_coupon_code: null,
    p_payment_method: 'COD',
    p_idempotency_key: key,
  });

  test('COD order placed as a visitor queues nothing and calls no payment function', async () => {
    const key = crypto.randomUUID();
    const { data, error } = await cod(key);
    assert.equal(error, null);
    assert.ok(data.order_number);
    assert.equal((await cod(key)).data.replayed, true);
    assert.equal((await outbox()).length, 0);
    assert.ok(stub.rpcCalls.every((call) => call.name === 'place_order'));
  });

  test('the worker has nothing to do for COD', async () => {
    await cod(crypto.randomUUID());
    assert.equal((await runWorker()).claimed, 0);
  });

  const emptyOrder = () => new Request('http://test.invalid/api/create-order', { method: 'POST', body: '{}' });

  test('create-order: 503 with the kill switch on, no RPC', async () => {
    process.env.RAZORPAY_NEW_ORDERS_DISABLED = 'true';
    const res = await createOrder(emptyOrder());
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'Online payment is not available right now. Please choose Cash on Delivery.' });
    assert.deepEqual(rpcNames(), []);
  });

  test('create-order: control, with the switch off the request gets past it', async () => {
    assert.equal((await createOrder(emptyOrder())).status, 400);
  });

  // Fails closed: anything but empty or an explicit "off" blocks
  for (const value of ['true', 'TRUE', 'True', '  true  ', '\ttrue\n', '1', 'yes', 'on', 'ture']) {
    test(`create-order: kill switch ${JSON.stringify(value)} blocks new orders`, async () => {
      process.env.RAZORPAY_NEW_ORDERS_DISABLED = value;
      assert.equal((await createOrder(emptyOrder())).status, 503);
      assert.deepEqual(rpcNames(), []);
    });
  }

  for (const value of ['', '   ', 'false', 'FALSE', ' 0 ', 'no', 'off']) {
    test(`create-order: kill switch ${JSON.stringify(value)} leaves new orders open`, async () => {
      process.env.RAZORPAY_NEW_ORDERS_DISABLED = value;
      assert.equal((await createOrder(emptyOrder())).status, 400);
    });
  }

  test('the kill switch does not stop the webhook either', async () => {
    process.env.RAZORPAY_NEW_ORDERS_DISABLED = ' TRUE ';
    const order = await newOrder();
    assert.equal((await sendWebhook(stub.payments[order.pay])).status, 200);
    assert.equal((await orderRow(order.rz)).payment_status, 'paid');
  });

  test('create-order: test keys are refused in Production regardless', async () => {
    process.env.VERCEL_ENV = 'production';
    assert.equal((await createOrder(emptyOrder())).status, 503);
  });

  test('the kill switch does not stop payments under way', async () => {
    process.env.RAZORPAY_NEW_ORDERS_DISABLED = 'true';
    const order = await newOrder();
    assert.equal((await verify(verifyRequest(order))).status, 200);
    assert.equal((await runWorker()).claimed, 0);
    assert.equal(stub.delivered.length, 2);
  });
});

describe('shipping by PIN code (Migration 11)', () => {
  // 516001 at 120 is a test fixture, not a business rate
  const customer = (pincode, extra = {}) => ({
    first_name: 'A', last_name: 'B', email: 'a@example.com', phone: '9876543210',
    address: '1 Street', city: 'Kadapa', state: 'AP', pincode, landmark: '', ...extra,
  });
  const orderRequest = (pincode, extra = {}, body = {}) => new Request('http://test.invalid/api/create-order', {
    method: 'POST',
    body: JSON.stringify({
      customer: customer(pincode, extra),
      items: [{ type: 'variant', variant_id: '00000000-0000-0000-0000-00000000000a', quantity: 1 }],
      couponCode: '',
      attemptKey: crypto.randomUUID(),
      ...body,
    }),
  });

  test('legacy mode: create-order charges the standard rule, as before', async () => {
    const res = await createOrder(orderRequest('516001'));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).amount, 109900);
    assert.equal(stub.rzOrders[0].amount, 109900);
  });

  test('pincode mode: the Razorpay amount includes the PIN code charge', async () => {
    await db('test_shipping', { p_pincode: '516001', p_charge: 120 });
    const res = await createOrder(orderRequest('516001'));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).amount, 112000);
    assert.deepEqual(stub.rzOrders.map((order) => order.amount), [112000]);
  });

  test('pincode mode: an unsupported PIN code is refused with the shopper message, no Razorpay order', async () => {
    await db('test_shipping', { p_pincode: '516001', p_charge: 120 });
    const res = await createOrder(orderRequest('560001'));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /^Sorry, we do not deliver to PIN code 560001 yet\./);
    assert.equal(stub.rzOrders.length, 0);
  });

  test('shipping or totals sent by the browser are ignored', async () => {
    await db('test_shipping', { p_pincode: '516001', p_charge: 120 });
    const res = await createOrder(orderRequest('516001', { shipping_amount: 0 }, { shipping: 0, total: 1, amount: 100 }));
    assert.equal((await res.json()).amount, 112000);
  });

  test('visitors get a quote, never the rate rows', async () => {
    await db('test_shipping', { p_pincode: '516001', p_charge: 120 });
    const { data, error } = await anon.rpc('get_shipping_quote', { p_pincode: '516001', p_subtotal: 1000 });
    assert.equal(error, null);
    assert.deepEqual(data, { ok: true, mode: 'pincode', amount: 120, message: null, free_shipping_threshold: null });
    const refused = (await anon.rpc('get_shipping_quote', { p_pincode: '560001', p_subtotal: 1000 })).data;
    assert.equal(refused.ok, false);
    assert.match(refused.message, /do not deliver to PIN code 560001/);
    assert.notEqual((await anon.from('shipping_pincodes').select('*')).error, null);
  });

  test('legacy quote for visitors', async () => {
    const { data } = await anon.rpc('get_shipping_quote', { p_pincode: null, p_subtotal: 1000 });
    assert.equal(data.mode, 'legacy');
    assert.equal(data.amount, 99);
  });

  test('COD in pincode mode: priced on the server, refused for an unsupported PIN code', async () => {
    await db('test_shipping', { p_pincode: '516001', p_charge: 120 });
    const items = [{ type: 'variant', variant_id: '00000000-0000-0000-0000-00000000000a', quantity: 1 }];
    const ok = await anon.rpc('place_order', { p_customer: customer('516001', { shipping_amount: 0 }), p_items: items, p_coupon_code: null, p_payment_method: 'COD', p_idempotency_key: crypto.randomUUID() });
    assert.equal(ok.error, null);
    assert.equal(Number(ok.data.shipping_amount), 120);
    assert.equal(Number(ok.data.total_amount), 1120);
    const refused = await anon.rpc('place_order', { p_customer: customer('560001'), p_items: items, p_coupon_code: null, p_payment_method: 'COD', p_idempotency_key: crypto.randomUUID() });
    assert.equal(refused.error.code, 'P0001');
    assert.match(refused.error.message, /do not deliver to PIN code 560001/);
  });
});

describe('nothing else moved', () => {
  // place_order and place_order_core are the Migration 11 versions; the payment functions are untouched
  test('database function fingerprints as expected', async () => {
    const { mark_order_paid, place_order, place_order_core, ps_orders_payment_guard } = await db('test_fingerprints');
    assert.deepEqual({ mark_order_paid, place_order, place_order_core, ps_orders_payment_guard }, {
      mark_order_paid: 'ae7666b99cc00a000ebe74611c4e1f24',
      place_order: '5bb8e3ce49eafb371a0644a783c921a2',
      place_order_core: 'b229458111f7d02b5e3a26f642bcdfbb',
      ps_orders_payment_guard: 'acfa79d5e0d9f1f6adabc914cb1ba7fe',
    });
  });

  test('the old e-mail functions still exist in the database', async () => {
    const { claim_order_email, release_order_email } = await db('test_fingerprints');
    assert.ok(claim_order_email && release_order_email);
  });

  test('migration files unchanged', () => {
    const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(`supabase/new-project/${file}`)).digest('hex');
    assert.equal(md5('08_checkout_hardening.sql'), 'aa62c871b2e0c4dd415e636a12d746d3');
    assert.equal(md5('proposed-09-v2/09v2_razorpay_payments.sql'), '5d807a61da0fb149f49fdce737dc919f');
    assert.equal(md5('proposed-09-v2-r1/09v2r1_verify_readonly.sql'), '246864ce0deda5107b2384ca1925b088');
    assert.equal(md5('proposed-10-outbox/10_outbox.sql'), 'a4a3b22e0b3c00bcb310dfd27689ae3d');
    assert.equal(md5('proposed-11-shipping/11_shipping.sql'), '4117d3a1bebca4da69b38bbc6a88f246');
  });

  test('the environment holds no real settings', () => {
    assert.equal(fs.existsSync('.env'), false);
    assert.ok(fs.existsSync('package.json'));
    assert.ok(!Object.keys(process.env).some((name) => /^VITE_/.test(name)));
  });

  // Last, so that it covers everything logged above
  test('no customer detail in any log line', () => {
    assert.ok(logs.length > 20);
    assert.deepEqual(logs.filter((line) => /example\.com|9876543210|Kadapa|516001/.test(line)), []);
  });
});
