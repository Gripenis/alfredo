/* Ristorante Alfredo – synk mellan telefoner via en egen Cloudflare Worker.
   Delat: recept (utom favorit/betyg), anteckningar, egna livsmedel, inköpslista.
   Personligt (synkas aldrig): favoriter, betyg, matlogg, mål, tillskott, inställningar.
   Offline först: ändringar köas lokalt och skickas när nätet finns. Senaste ändringen vinner. */
'use strict';

const SYNC_COLLS = ['recipes', 'customFoods', 'shopping'];
const PERSONAL_RECIPE_FIELDS = ['fav', 'rating', 'demo'];

const Sync = {
  st: { meta: {}, outbox: {}, cursor: 0, last: 0, err: '' },
  busy: false, again: false, timer: null, poll: null, imgHash: new Map(),

  enabled() { return !!(S.settings.syncUrl && S.settings.syncKey); },
  persist() { Store.set('syncState', this.st); },

  async init() {
    const v = await Store.get('syncState');
    if (v) Object.assign(this.st, v);
    window.addEventListener('online', () => this.run());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.run(); });
    this.poll = setInterval(() => { if (document.visibilityState === 'visible') this.run(); }, 30000);
    if (this.enabled()) { this.noteChange(SYNC_COLLS); this.run(); }
  },

  /* ---------- what is shared ---------- */
  items(coll) { const a = S[coll] || []; return coll === 'recipes' ? a.filter(r => !r.demo) : a; },
  shared(coll, it) {
    if (coll !== 'recipes') return it;
    const o = Object.assign({}, it); PERSONAL_RECIPE_FIELDS.forEach(f => delete o[f]); return o;
  },
  sig(coll, it) {
    const o = this.shared(coll, it);
    let img = '';
    if (o.image) {
      img = this.imgHash.get(o.image);
      if (!img) { img = o.image.length + ':' + hash(o.image); this.imgHash.set(o.image, img); }
    }
    const s = JSON.stringify(Object.assign({}, o, { image: img }));
    return s.length + ':' + hash(s);
  },

  /* ---------- detect local changes (called from save()) ---------- */
  noteChange(keys) {
    if (!this.enabled()) return;
    const { meta, outbox } = this.st;
    let changed = false;
    keys.filter(k => SYNC_COLLS.includes(k)).forEach(coll => {
      const seen = new Set();
      this.items(coll).forEach(it => {
        if (!it || !it.id) return;
        const k = coll + ':' + it.id; seen.add(k);
        const h = this.sig(coll, it), m = meta[k];
        if (m && !m.del && m.h === h) { if (outbox[k]) { delete outbox[k]; changed = true; } return; }
        if (!outbox[k] || outbox[k].del || outbox[k].h !== h) { outbox[k] = { ts: Date.now(), h }; changed = true; }
      });
      const pre = coll + ':';
      Object.keys(meta).forEach(k => {
        if (k.startsWith(pre) && !seen.has(k) && !meta[k].del && !(outbox[k] && outbox[k].del)) { outbox[k] = { ts: Date.now(), del: 1 }; changed = true; }
      });
      Object.keys(outbox).forEach(k => {
        if (k.startsWith(pre) && !seen.has(k) && !outbox[k].del) { delete outbox[k]; changed = true; } // skapad och raderad innan synk
      });
    });
    if (changed) { this.persist(); this.schedule(1500); }
  },
  schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), ms); },

  /* ---------- network ---------- */
  base() { return String(S.settings.syncUrl || '').trim().replace(/\/+$/, ''); },
  async call(path, body, url, key) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 30000);
    try {
      const res = await fetch((url || this.base()) + path, {
        method: body ? 'POST' : 'GET', signal: ctl ? ctl.signal : undefined,
        headers: Object.assign({ 'X-Sync-Key': key || S.settings.syncKey }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined, cache: 'no-store'
      });
      let j = null; try { j = await res.json(); } catch (e) {}
      if (res.status === 401) throw new Error('bad-key');
      if (!res.ok || !j || !j.ok) throw new Error((j && j.error) || ('http-' + res.status));
      return j;
    } catch (e) {
      if (e.message === 'bad-key' || /^http-|^no-|^bad-/.test(e.message)) throw e;
      throw new Error('offline');
    } finally { clearTimeout(tm); }
  },
  find(k) {
    const i = k.indexOf(':'), coll = k.slice(0, i), id = k.slice(i + 1);
    return { coll, id, it: (S[coll] || []).find(x => x.id === id) };
  },

  async run() {
    if (!this.enabled()) return;
    if (this.busy) { this.again = true; return; }
    if (navigator.onLine === false) { this.setErr('offline'); return; }
    this.busy = true; this.again = false; this.status('busy');
    try {
      for (let loop = 0; loop < 40; loop++) {
        const { outbox, meta } = this.st;
        const docs = [], sent = []; let bytes = 0, left = false;
        for (const k of Object.keys(outbox)) {
          const o = outbox[k];
          if (o.del) { docs.push({ k, ts: o.ts, del: 1 }); sent.push({ k, ts: o.ts, del: 1 }); continue; }
          const { coll, it } = this.find(k);
          if (!it) { delete outbox[k]; continue; }
          const data = JSON.stringify(this.shared(coll, it));
          if (docs.length && bytes + data.length > 1200000) { left = true; break; }
          if (docs.length >= 150) { left = true; break; }
          bytes += data.length;
          docs.push({ k, ts: o.ts, data }); sent.push({ k, ts: o.ts, h: this.sig(coll, it) });
        }
        const res = await this.call('/sync', { docs, since: this.st.cursor });
        sent.forEach(d => {
          meta[d.k] = d.del ? { del: 1 } : { h: d.h };
          if (outbox[d.k] && outbox[d.k].ts === d.ts) delete outbox[d.k];
        });
        this.apply(res.docs || []);
        this.st.cursor = res.cursor || this.st.cursor;
        this.persist();
        if (!res.more && !left) break;
      }
      this.st.last = Date.now(); this.st.err = ''; this.persist();
      this.status('ok');
    } catch (e) {
      this.setErr(e.message);
    } finally {
      this.busy = false;
      if (this.again) this.schedule(300);
    }
  },

  apply(docs) {
    if (!docs.length) return;
    const { meta, outbox } = this.st, touched = new Set();
    docs.forEach(d => {
      const { coll, id } = this.find(d.k);
      if (!SYNC_COLLS.includes(coll) || !id) return;
      const o = outbox[d.k];
      if (o && o.ts > d.ts) return; // min lokala ändring är nyare – den skickas nästa varv
      const arr = S[coll] || (S[coll] = []);
      const idx = arr.findIndex(x => x.id === id);
      if (d.del) {
        if (idx >= 0) { arr.splice(idx, 1); touched.add(coll); }
        meta[d.k] = { del: 1 }; delete outbox[d.k];
        return;
      }
      if (!d.data || typeof d.data !== 'object') return;
      let item = d.data; item.id = id;
      if (coll === 'recipes') {
        const old = idx >= 0 ? arr[idx] : null;
        item.fav = old ? !!old.fav : false; item.rating = old ? (old.rating || 0) : 0;
        if (old && old.demo) item.demo = true;
      }
      if (idx >= 0) arr[idx] = item; else if (coll === 'shopping') arr.unshift(item); else arr.push(item);
      meta[d.k] = { h: this.sig(coll, item) }; delete outbox[d.k];
      touched.add(coll);
    });
    if (!touched.size) return;
    touched.forEach(c => Store.set(c, S[c]));
    if (touched.has('customFoods')) { try { allFoods().forEach(f => NAME_CACHE.delete(f)); } catch (e) {} }
    this.refreshUI();
  },

  refreshUI() {
    const a = document.activeElement;
    const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    if (app.route === 'edit' || app.route === 'profile' || app.sheetOpen || typing) { app.pendingRender = true; return; }
    app.pendingRender = false;
    render();
  },

  /* ---------- status ---------- */
  setErr(code) { this.st.err = code; this.persist(); this.status('err'); },
  statusText() {
    if (!this.enabled()) return '';
    if (this.busy) return t('syncBusy');
    const e = this.st.err;
    if (e === 'bad-key') return t('syncBadKey');
    if (e === 'offline') return t('syncOffline') + (this.st.last ? ' · ' + t('syncLast', { time: this.when(this.st.last) }) : '');
    if (e) return t('syncError') + ' (' + e + ')';
    const n = Object.keys(this.st.outbox).length;
    return this.st.last ? t('syncLast', { time: this.when(this.st.last) }) + (n ? ' · ' + t('syncPending', { n }) : '') : t('syncNever');
  },
  when(ts) {
    const d = new Date(ts), now = new Date();
    const hm = d.toLocaleTimeString(lang() === 'sv' ? 'sv-SE' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString(lang() === 'sv' ? 'sv-SE' : 'en-GB', { day: 'numeric', month: 'short' }) + ' ' + hm;
  },
  status(kind) {
    const el = document.getElementById('sy-status');
    if (el) { el.textContent = this.statusText(); el.dataset.kind = kind; }
  },

  /* ---------- connect / disconnect ---------- */
  async connect(url, key) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    key = String(key || '').trim();
    if (!url || !key) throw new Error('missing');
    await this.call('/ping', null, url, key);
    S.settings.syncUrl = url; S.settings.syncKey = key;
    Store.set('settings', S.settings);
    this.reset();
    this.noteChange(SYNC_COLLS);
    await this.run();
  },
  disconnect() {
    S.settings.syncUrl = ''; S.settings.syncKey = '';
    Store.set('settings', S.settings);
    this.reset();
  },
  reset() { this.st = { meta: {}, outbox: {}, cursor: 0, last: 0, err: '' }; this.persist(); }
};
