/** JSON response for the browser; payment answers are never cached. */
export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** The request body as an object, or null when it is not valid JSON. */
export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

/** Whole paise from a rupee amount stored as numeric(12, 2). */
export function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}
