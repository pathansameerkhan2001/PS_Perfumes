// Shared test setup. Requests to Supabase go to real PostgREST; Razorpay and Resend are stubs; any
// other host is refused. Importing this file sets fake credentials, so import it before api/.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const REST = 'http://ps-api-test-rest:3000';

function signJwt(role) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ role, exp: 4102444800 })}`;
  return `${body}.${crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url')}`;
}

export const ENV = {
  SUPABASE_URL: REST,
  SUPABASE_SECRET_KEY: signJwt('service_role'),
  RAZORPAY_KEY_ID: 'rzp_test_fake',
  RAZORPAY_KEY_SECRET: 'fake-key-secret',
  RAZORPAY_WEBHOOK_SECRET: 'fake-webhook-secret',
  RESEND_API_KEY: 're_fake_key',
  EMAIL_FROM: 'PS PERFUMES <orders@test.invalid>',
  OWNER_NOTIFICATION_EMAIL: 'owner@test.invalid',
  NOTIFICATION_WORKER_SECRET: 'fake-worker-secret',
  SITE_URL: 'https://shop.test.invalid',
};
Object.assign(process.env, ENV);

const realFetch = globalThis.fetch;

/** Reset before every test. */
export const stub = {};

export function resetStubs() {
  Object.assign(process.env, ENV);
  delete process.env.RAZORPAY_NEW_ORDERS_DISABLED;
  delete process.env.VERCEL_ENV;
  Object.assign(stub, {
    rpcCalls: [],
    rpcFail: {},           // name -> 'network', or { status, body } as PostgREST would answer
    payments: {},          // pay id -> Razorpay payment entity
    captures: [],
    rzOrders: [],          // bodies of the Razorpay orders created
    captureAmount: null,   // what a capture reports, when it differs from the payment
    resendCalls: [],       // every request, accepted or not
    delivered: [],         // what actually went out: a repeated key does not count twice
    keys: new Map(),
    resend: null,          // (request, callNumber) => Response, or throw; null accepts
    browser: null,         // (path, init) => Response, for the browser's calls to /api/...
  });
}
resetStubs();

export const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function rest(url, init) {
  const name = url.includes('/rpc/') ? url.split('/rpc/')[1].split('?')[0] : null;
  if (name && !name.startsWith('test_')) {
    stub.rpcCalls.push({ name, args: init.body ? JSON.parse(init.body) : {} });
    const failure = stub.rpcFail[name];
    if (failure === 'network') throw new TypeError('fetch failed');
    if (failure) return jsonResponse(failure.body, failure.status);
  }
  return realFetch(url.replace('/rest/v1', ''), init);
}

// Razorpay order ids are unique across the whole run, as the database requires
let rzOrderSerial = 0;

function razorpay(url, init) {
  const { pathname } = new URL(url);
  if (pathname === '/v1/orders') {
    const body = JSON.parse(init.body);
    rzOrderSerial += 1;
    const order = { id: `order_Stub${rzOrderSerial}`, amount: body.amount, currency: body.currency, status: 'created' };
    stub.rzOrders.push(body);
    return jsonResponse(order);
  }
  const id = pathname.split('/')[3];
  if (pathname.endsWith('/capture')) {
    stub.captures.push({ id, body: JSON.parse(init.body) });
    stub.payments[id].status = 'captured';
    if (stub.captureAmount) stub.payments[id].amount = stub.captureAmount;
  }
  return stub.payments[id] ? jsonResponse(stub.payments[id]) : jsonResponse({ error: { description: 'Not found' } }, 404);
}

// Behaves as Resend documents: a repeated key sends nothing and a changed body is refused
async function resend(_url, init) {
  const headers = new Headers(init.headers);
  const request = { key: headers.get('idempotency-key'), authorization: headers.get('authorization'), body: JSON.parse(init.body) };
  stub.resendCalls.push(request);
  if (stub.resend) {
    const response = await stub.resend(request, stub.resendCalls.length);
    if (response) return response;
  }
  const seen = stub.keys.get(request.key);
  if (seen) {
    if (seen.body !== init.body) return jsonResponse({ name: 'invalid_idempotent_request', message: 'changed' }, 409);
    return jsonResponse({ id: seen.id });
  }
  const id = `re_fake_${stub.keys.size + 1}`;
  stub.keys.set(request.key, { id, body: init.body });
  stub.delivered.push(request);
  return jsonResponse({ id });
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url ?? input);
  if (url.startsWith(`${REST}/`)) return rest(url, init);
  if (url.startsWith('https://api.razorpay.com/')) return razorpay(url, init);
  if (url.startsWith('https://api.resend.com/')) return resend(url, init);
  if (url.startsWith('/api/') && stub.browser) return stub.browser(url, init);
  throw new Error(`Blocked host in test: ${url}`);
};

export const service = createClient(REST, ENV.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
export const anon = createClient(REST, signJwt('anon'), { auth: { persistSession: false, autoRefreshToken: false } });

export async function db(name, args = {}) {
  const { data, error } = await service.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

export const outbox = () => db('test_outbox');
export const orderRow = (rz) => db('test_order', { p_rz: rz });
export const makeDue = () => db('test_make_due');

export async function waitForRest() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await realFetch(`${REST}/`)).status < 500) return;
    } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('PostgREST did not start');
}

let serial = 0;

/** An unpaid Razorpay order and, unless told otherwise, a matching captured payment. */
export async function newOrder() {
  serial += 1;
  const tag = `${Date.now().toString(36)}${serial}`;
  const rz = `order_T${tag}`;
  const pay = `pay_T${tag}`;
  const { id, paise } = await db('test_new_order', { p_key: crypto.randomUUID(), p_rz: rz });
  stub.payments[pay] = { id: pay, order_id: rz, amount: paise, currency: 'INR', status: 'captured' };
  return { id, rz, pay, paise };
}

export function webhookRequest(event, secret = ENV.RAZORPAY_WEBHOOK_SECRET) {
  const body = JSON.stringify(event);
  return new Request('http://test.invalid/api/razorpay-webhook', {
    method: 'POST',
    headers: { 'x-razorpay-signature': crypto.createHmac('sha256', secret).update(body).digest('hex') },
    body,
  });
}

export const captured = (entity, name = 'payment.captured') => ({ event: name, payload: { payment: { entity } } });

/** What Razorpay Checkout hands the browser after a payment. */
export function checkoutResponse({ rz, pay }) {
  const signature = crypto.createHmac('sha256', ENV.RAZORPAY_KEY_SECRET).update(`${rz}|${pay}`).digest('hex');
  return { razorpay_order_id: rz, razorpay_payment_id: pay, razorpay_signature: signature };
}

export function verifyRequest(order, extra = {}) {
  return new Request('http://test.invalid/api/verify-payment', {
    method: 'POST',
    body: JSON.stringify({ ...checkoutResponse(order), ...extra }),
  });
}

export const workerRequest = (authorization = `Bearer ${ENV.NOTIFICATION_WORKER_SECRET}`) =>
  new Request('http://test.invalid/api/process-notifications', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });

export const types = (rows) => rows.map((row) => row.notification_type).sort();
export const minutesAway = (row) => Math.round((new Date(row.next_attempt_at) - Date.now()) / 60000);

export function assertAmount(actual, expected) {
  assert.equal(Number(actual), expected);
}

/** Everything the code logged, for the check that no customer detail reaches the logs. */
export const logs = [];
for (const level of ['log', 'warn', 'error', 'info']) {
  const original = console[level];
  console[level] = (...args) => {
    logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    if (process.env.SHOW_LOGS) original(...args);
  };
}
