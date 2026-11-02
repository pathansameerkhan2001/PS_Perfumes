import crypto from 'node:crypto';
import { emailEnabled } from './_lib/email.js';
import { processDueNotifications } from './_lib/notifications.js';
import { json } from './_lib/http.js';

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

function isAuthorized(request, secret) {
  return crypto.timingSafeEqual(digest(request.headers.get('authorization')), digest(`Bearer ${secret}`));
}

/**
 * Called on a schedule by a trusted server, never by a browser. Each call handles one bounded
 * batch; a row left behind by a crashed call is recovered when its lease runs out.
 */
export async function POST(request) {
  const secret = process.env.NOTIFICATION_WORKER_SECRET;
  if (!secret) {
    console.error('process-notifications: NOTIFICATION_WORKER_SECRET is not configured');
    return json({ error: 'Worker is not configured' }, 500);
  }
  if (!isAuthorized(request, secret)) return json({ error: 'Unauthorized' }, 401);

  // Claiming nothing keeps every attempt until the settings are fixed
  if (!emailEnabled()) {
    console.error('process-notifications: RESEND_API_KEY or EMAIL_FROM is not set');
    return json({ error: 'E-mail is not configured' }, 503);
  }

  try {
    return json(await processDueNotifications());
  } catch (err) {
    console.error('process-notifications:', err.message);
    return json({ error: 'Temporary failure' }, 500);
  }
}
