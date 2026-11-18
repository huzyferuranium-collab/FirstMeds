import { randomInt } from 'node:crypto';

/**
 * URA EFRIS fiscalisation.
 *
 * Real integration uses URA's EFRIS system-to-system API (with a registered device number and
 * the taxpayer's private key) and returns a Fiscal Document Number (FDN) and verification code
 * printed on the receipt. Until those credentials exist we run in DEMO mode: a clearly-marked
 * placeholder FDN is generated so the receipt flow can be shown to pharmacies.
 */
export function fiscalise({ receipt_no }) {
  if (process.env.EFRIS_API_URL && process.env.EFRIS_DEVICE_NO) {
    // Placeholder for the live call; kept synchronous-safe by queuing in a real deployment.
    return { fdn: null, status: 'pending', receipt_no };
  }
  const fdn = `DEMO${String(randomInt(1e9, 1e10 - 1))}`;
  return { fdn, status: 'demo', receipt_no };
}
