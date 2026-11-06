/**
 * SMS delivery. Uses Africa's Talking (widely used in Uganda) when AT_USERNAME and AT_API_KEY are set;
 * otherwise messages are logged and reported as "queued" so the rest of the app works in development.
 */
export async function sendSms(to, message) {
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  if (!username || !apiKey) {
    console.log(`[sms:dev] to ${to}: ${message}`);
    return { status: 'queued', provider: 'dev-log' };
  }
  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const form = new URLSearchParams({ username, to, message });
  if (process.env.AT_SENDER_ID) form.set('from', process.env.AT_SENDER_ID);
  try {
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    const r = data?.SMSMessageData?.Recipients?.[0];
    const ok = res.ok && r && (r.statusCode === 100 || r.statusCode === 101 || r.statusCode === 102);
    return { status: ok ? 'sent' : 'failed', provider: 'africastalking', detail: r?.status || data?.SMSMessageData?.Message };
  } catch (e) {
    return { status: 'failed', provider: 'africastalking', detail: e.message };
  }
}
