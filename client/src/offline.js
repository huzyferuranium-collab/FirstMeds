import { useEffect, useState } from 'react';
import { api, ApiError } from './api.js';

/**
 * Offline sales queue. Every sale gets a client_id, so sending it twice never creates two sales.
 * Sales made without internet are kept in localStorage and synced when the connection returns.
 */
const KEY = 'firstmeds.offlineQueue';
const listeners = new Set();

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (q) => {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(q));
};

export const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function queueSale(body) {
  const item = { ...body, client_id: body.client_id || newClientId(), offline_created_at: new Date().toISOString(), status: 'pending', error: null };
  write([...read(), item]);
  return item;
}

export const pendingSales = () => read();

export function removeQueued(clientId) { write(read().filter((x) => x.client_id !== clientId)); }

/** Is this error "no connection" (as opposed to the server rejecting the sale)? */
export const isNetworkError = (e) => !(e instanceof ApiError) || e.status === 503 || e.status === 0;

let syncing = false;
export async function syncNow() {
  if (syncing || !navigator.onLine) return { synced: 0 };
  syncing = true;
  let synced = 0;
  try {
    for (const item of read()) {
      if (item.status === 'failed') continue;
      const { status, error, ...body } = item;
      try {
        await api.post('/sales', body);
        removeQueued(item.client_id);
        synced++;
      } catch (e) {
        if (isNetworkError(e)) break; // still offline; try later
        // The server refused it (e.g. stock ran out meanwhile): keep it for a manager to review.
        write(read().map((x) => (x.client_id === item.client_id ? { ...x, status: 'failed', error: e.message } : x)));
      }
    }
  } finally {
    syncing = false;
  }
  return { synced };
}

export function retryFailed() {
  write(read().map((x) => ({ ...x, status: 'pending', error: null })));
  return syncNow();
}

/** React hook: online status + queue contents, syncing automatically. */
export function useOffline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [queue, setQueue] = useState(read());
  useEffect(() => {
    const on = () => { setOnline(true); syncNow(); };
    const off = () => setOnline(false);
    const l = (q) => setQueue(q);
    listeners.add(l);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => { if (navigator.onLine) syncNow(); }, 30000);
    syncNow();
    return () => { listeners.delete(l); window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, []);
  return { online, queue, pending: queue.filter((x) => x.status === 'pending').length, failed: queue.filter((x) => x.status === 'failed').length };
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}

/** Price a basket locally when the server can't be reached (server re-checks everything on sync). */
export function localQuote(cart, program, discount = 0) {
  const lines = cart.map((c) => ({ product_id: c.product_id, line_total: c.price * c.quantity }));
  const eligible = new Set(program?.products?.map((p) => p.id) || []);
  let subs = lines.map((l) => (program && eligible.has(l.product_id) ? Math.round((l.line_total * program.discount_percent) / 100) : 0));
  const sum = subs.reduce((a, b) => a + b, 0);
  if (program?.max_subsidy_per_visit && sum > program.max_subsidy_per_visit) {
    subs = subs.map((x) => Math.floor((x * program.max_subsidy_per_visit) / sum));
  }
  const subtotal = lines.reduce((a, l) => a + l.line_total, 0);
  const subsidy_total = subs.reduce((a, b) => a + b, 0);
  const discount_total = Math.min(Math.max(0, Number(discount) || 0), subtotal - subsidy_total);
  return {
    offline: true, subtotal, subsidy_total, discount_total, total: subtotal - subsidy_total - discount_total,
    lines: lines.map((l, i) => ({ ...l, subsidy: subs[i] })),
    program: program ? { id: program.id, name: program.name, discount_percent: program.discount_percent } : null,
  };
}
