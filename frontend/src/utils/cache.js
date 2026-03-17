const TTL = 5 * 60 * 1000;
const PREFIX = 'fcp_';
const mem = new Map();

export const cache = {
  set(key, data) {
    const entry = { data, ts: Date.now() };
    mem.set(key, entry);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch {}
  },
  get(key) {
    const m = mem.get(key);
    if (m) { if (Date.now() - m.ts < TTL) return m.data; mem.delete(key); }
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const e = JSON.parse(raw);
      if (Date.now() - e.ts >= TTL) { localStorage.removeItem(PREFIX + key); return null; }
      mem.set(key, e);
      return e.data;
    } catch { return null; }
  },
  del(key)  { mem.delete(key); try { localStorage.removeItem(PREFIX + key); } catch {} },
  clear()   { mem.clear(); try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch {} },
};