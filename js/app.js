/* Ristorante Alfredo – app logic. Plain JS, no dependencies, works offline. */
'use strict';

const APP_VERSION = '1.0.0';
const DAY = 86400000;
const DEFAULT_ON = ['vitA','vitD','vitC','b12','folate','fe','ca','mg','zn','iod','se','kalium'];

/* ================= Storage (IndexedDB with localStorage fallback) ================= */
const Store = {
  db: null, fallback: false,
  open() {
    return new Promise(res => {
      try {
        const rq = indexedDB.open('ristorante-alfredo', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => { this.db = rq.result; res(); };
        rq.onerror = () => { this.fallback = true; res(); };
      } catch (e) { this.fallback = true; res(); }
    });
  },
  get(k) {
    if (this.fallback || !this.db) { try { return Promise.resolve(JSON.parse(localStorage.getItem('ra:' + k))); } catch (e) { return Promise.resolve(null); } }
    return new Promise(res => {
      const tx = this.db.transaction('kv', 'readonly').objectStore('kv').get(k);
      tx.onsuccess = () => res(tx.result === undefined ? null : tx.result);
      tx.onerror = () => res(null);
    });
  },
  set(k, v) {
    if (this.fallback || !this.db) { try { localStorage.setItem('ra:' + k, JSON.stringify(v)); } catch (e) {} return Promise.resolve(); }
    return new Promise(res => {
      const tx = this.db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = res; tx.onerror = res;
    });
  },
  clear() {
    try { Object.keys(localStorage).filter(k => k.startsWith('ra')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    if (!this.db) return Promise.resolve();
    return new Promise(res => { const tx = this.db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = res; tx.onerror = res; });
  }
};

const KEYS = ['recipes','customFoods','log','supplements','goals','customNutrients','settings','shopping','skipped'];
const S = {};
const DEFAULT_SETTINGS = {
  lang: 'sv', name: '', sex: 'm', age: 30,
  theme: { preset: 'cream', bg: '#F5EDE0', accent: '#7B1E2B' },
  suits: true, wakeLock: true, defaultServings: 4
};

async function loadAll() {
  await Store.open();
  for (const k of KEYS) S[k] = await Store.get(k);
  S.recipes = S.recipes || [];
  S.customFoods = S.customFoods || [];
  S.log = S.log || [];
  S.supplements = S.supplements || [];
  S.customNutrients = S.customNutrients || [];
  S.shopping = S.shopping || [];
  S.skipped = S.skipped || { day: '', ids: [] };
  S.settings = Object.assign({}, DEFAULT_SETTINGS, S.settings || {});
  S.settings.theme = Object.assign({}, DEFAULT_SETTINGS.theme, S.settings.theme || {});
  S.goals = S.goals || {};
  ensureGoals();
}
let persistAsked = false;
function save(...keys) {
  keys.forEach(k => Store.set(k, S[k]));
  if (!persistAsked && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
}

/* ================= Helpers ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => S.settings.lang === 'en' ? 'en' : 'sv';
function t(key, vars) {
  let s = (I18N[lang()] && I18N[lang()][key]) || I18N.sv[key] || key;
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
  return s;
}
const dayKey = (ts = Date.now()) => { const d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

function fmt(n, maxDec) {
  if (n == null || isNaN(n)) return '';
  let d = maxDec != null ? maxDec : (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  const p = Math.pow(10, d);
  const r = Math.round(n * p) / p;
  return r.toLocaleString(lang() === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: d });
}
const FRACTIONS = [[.25, '¼'], [.5, '½'], [.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
function fmtAmount(n, unit) {
  if (!n) return '';
  const type = UNITS[unit] ? UNITS[unit].t : 'w';
  if (type === 'p' || ['dl', 'msk', 'tsk', 'krm', 'l'].includes(unit)) {
    const whole = Math.floor(n + 1e-9), frac = n - whole;
    if (frac < 0.06) return String(whole || fmt(n));
    for (const [v, ch] of FRACTIONS) if (Math.abs(frac - v) < 0.06) return (whole ? whole + ' ' : '') + ch;
    return fmt(n, 1);
  }
  if (n >= 100) return fmt(Math.round(n / 5) * 5, 0);
  return fmt(n, n >= 10 ? 0 : 1);
}
function parseAmount(str) {
  if (str == null) return NaN;
  let s = String(str).trim().replace(',', '.');
  if (!s) return NaN;
  const uni = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3 };
  let total = 0, any = false;
  for (const part of s.split(/\s+/)) {
    if (uni[part]) { total += uni[part]; any = true; continue; }
    const m = part.match(/^(\d+(?:\.\d+)?)([½¼¾⅓⅔])$/);
    if (m) { total += parseFloat(m[1]) + uni[m[2]]; any = true; continue; }
    if (part.includes('/')) { const [a, b] = part.split('/').map(Number); if (b) { total += a / b; any = true; continue; } return NaN; }
    const v = parseFloat(part); if (isNaN(v)) return NaN; total += v; any = true;
  }
  return any ? total : NaN;
}
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
function relDays(ts) {
  if (!ts) return t('neverCooked');
  const d = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  return d <= 0 ? t('today') : d === 1 ? t('yesterday') : t('daysAgo', { n: d });
}
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ================= Icons ================= */
const IC = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.3-3.7 4.2-5.5 7.5-5.5s6.2 1.8 7.5 5.5"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/></svg>',
  micros: '<svg viewBox="0 0 24 24"><path d="M12 3.5c3.6 4.2 5.5 7.4 5.5 10a5.5 5.5 0 0 1-11 0c0-2.6 1.9-5.8 5.5-10z"/><path d="M9.6 14.4a2.5 2.5 0 0 0 2.4 2.3"/></svg>',
  pill: '<svg viewBox="0 0 24 24"><rect x="3.2" y="8.6" width="17.6" height="6.8" rx="3.4" transform="rotate(-40 12 12)"/><path d="m9.6 9.2 5.2 5.6"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3.5 4.5h2.2l2 10.2h10.1l1.9-7.2H6.6"/><circle cx="9.3" cy="19" r="1.4"/><circle cx="16.6" cy="19" r="1.4"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><path d="M7 7.5h10M12 4v3.5M5 20h14"/><path d="M7 7.5 4 14a3 3 0 0 0 6 0zM17 7.5 14 14a3 3 0 0 0 6 0zM12 7.5V20"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7zM13.5 6.7l3.8 3.8"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5.5 12.5 4.2 4.2 8.8-9.4"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m6.5 14.5 5.5-5.5 5.5 5.5"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m6.5 9.5 5.5 5.5 5.5-5.5"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.5 3.6-3.4M13 10.4C13.9 8.5 15 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8.5h3.2L9 6h6l1.8 2.5H20V18H4z"/><circle cx="12" cy="13" r="3.3"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m15.5 15.5 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.8l4 3.7M6 11H5v9h14v-9h-1"/></svg>'
};

/* ================= Units ================= */
const UNITS = {
  g: { t: 'w', f: 1 }, hg: { t: 'w', f: 100 }, kg: { t: 'w', f: 1000 },
  krm: { t: 'v', f: 1 }, tsk: { t: 'v', f: 5 }, msk: { t: 'v', f: 15 }, ml: { t: 'v', f: 1 }, cl: { t: 'v', f: 10 }, dl: { t: 'v', f: 100 }, l: { t: 'v', f: 1000 },
  st: { t: 'p' }, klyfta: { t: 'p' }, skiva: { t: 'p' }, burk: { t: 'p' }, forp: { t: 'p' }, bit: { t: 'p' }, kula: { t: 'p' }, kruka: { t: 'p' }, nave: { t: 'p' }, klick: { t: 'p' },
  skvatt: { t: 'x' }, nypa: { t: 'x' }, smak: { t: 'x' }
};
const PIECE_UNITS = ['st', 'klyfta', 'skiva', 'burk', 'forp', 'bit', 'kula', 'kruka', 'nave', 'klick'];
const HANDFUL_CATS = ['veg', 'herb', 'fruit', 'nut'];
const unitLabel = (u, n) => { const l = UNIT_LABELS[lang()][u] || [u, u]; return n != null && n > 1 ? l[1] : l[0]; };

function unitsFor(food) {
  const groups = { w: ['g', 'hg', 'kg'], v: [], p: [], x: ['skvatt', 'nypa', 'smak'] };
  if (!food || food.d) groups.v = ['krm', 'tsk', 'msk', 'ml', 'cl', 'dl', 'l'];
  if (!food) groups.p = PIECE_UNITS.slice();
  else {
    groups.p = PIECE_UNITS.filter(u => food.pc && food.pc[u]);
    if (!groups.p.includes('nave') && HANDFUL_CATS.includes(food.cat)) groups.p.push('nave');
  }
  return groups;
}
function defaultUnitFor(food) {
  if (!food) return 'g';
  const pc = food.pc || {};
  for (const u of ['klyfta', 'st', 'burk', 'skiva', 'kula', 'bit']) if (pc[u]) return u;
  if (['spice'].includes(food.cat)) return 'tsk';
  if (['fat', 'sauce'].includes(food.cat) && food.d) return 'msk';
  if (['dairy', 'drink'].includes(food.cat) && food.d) return 'dl';
  if (food.cat === 'herb') return 'nave';
  return 'g';
}
function pieceGrams(food, unit) {
  if (!food) return null;
  if (food.pc && food.pc[unit]) return food.pc[unit];
  if (unit === 'nave' && HANDFUL_CATS.includes(food.cat)) return 30;
  return null;
}
/* grams for an ingredient line, or {vague:true}, or {g:null} when it can't be computed */
function gramsOf(item, food) {
  const u = UNITS[item.unit]; if (!u) return { g: null };
  if (u.t === 'x') return { vague: true };
  const a = Number(item.amount); if (!a || a <= 0) return { g: null };
  if (u.t === 'w') return { g: a * u.f };
  if (u.t === 'v') return food && food.d ? { g: a * u.f * food.d } : { g: null };
  const pg = pieceGrams(food, item.unit);
  return pg ? { g: a * pg } : { g: null };
}

/* ================= Foods & nutrients ================= */
let FOOD_INDEX = null;
function allFoods() { return S.customFoods.concat(FOOD_DB); }
function foodById(id) {
  if (!id) return null;
  if (!FOOD_INDEX) { FOOD_INDEX = {}; FOOD_DB.forEach(f => FOOD_INDEX[f.id] = f); }
  return S.customFoods.find(f => f.id === id) || FOOD_INDEX[id] || null;
}
const foodName = f => f ? (f.custom ? f.sv : (f[lang()] || f.sv)) : '';
const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function searchFoods(q, limit = 7) {
  q = normalize(q); if (q.length < 1) return [];
  const out = [];
  for (const f of allFoods()) {
    const names = [f.sv, f.en].concat(f.al || []).map(normalize);
    let best = 99;
    names.forEach(n => {
      if (n === q) best = Math.min(best, 0);
      else if (n.startsWith(q)) best = Math.min(best, 1);
      else if (n.split(/[\s\/(),-]+/).some(w => w.startsWith(q))) best = Math.min(best, 2);
      else if (q.length >= 3 && n.includes(q)) best = Math.min(best, 3);
    });
    if (best < 99) out.push([best, f]);
  }
  out.sort((a, b) => a[0] - b[0] || (b[1].custom ? 1 : 0) - (a[1].custom ? 1 : 0) || foodName(a[1]).length - foodName(b[1]).length);
  return out.slice(0, limit).map(x => x[1]);
}
function nutList() {
  return NUTRIENT_KEYS.map(k => ({ key: k, u: NUTRIENT_META[k].u, name: NUTRIENT_META[k][lang()] }))
    .concat(S.customNutrients.map(c => ({ key: c.key, u: c.u, name: c.name, custom: true })));
}
const nutName = k => { const m = NUTRIENT_META[k]; if (m) return m[lang()]; const c = S.customNutrients.find(x => x.key === k); return c ? c.name : k; };
const nutUnit = k => { const m = NUTRIENT_META[k]; if (m) return m.u; const c = S.customNutrients.find(x => x.key === k); return c ? c.u : ''; };

function ensureGoals() {
  const st = S.settings;
  NUTRIENT_KEYS.forEach(k => {
    const g = S.goals[k];
    if (!g) S.goals[k] = { daily: defaultDailyTarget(k, st.sex, st.age), on: DEFAULT_ON.includes(k), custom: false };
    else if (!g.custom) g.daily = defaultDailyTarget(k, st.sex, st.age);
  });
}
const trackedKeys = () => nutList().map(n => n.key).filter(k => S.goals[k] && S.goals[k].on && S.goals[k].daily > 0);

/* Nutrients of a recipe. factor scales the whole recipe. */
function recipeNutrition(r, factor = 1) {
  const n = {}, vague = [], missing = [];
  (r.groups || []).forEach(g => (g.items || []).forEach(it => {
    if (!it.name && !it.foodId) return;
    const food = foodById(it.foodId);
    const res = gramsOf(it, food);
    if (res.vague) { if (food) vague.push(food.id); return; }
    if (!food || res.g == null) { if (it.name) missing.push(it.name); return; }
    const k = res.g / 100 * factor;
    Object.keys(food.n).forEach(key => { n[key] = (n[key] || 0) + food.n[key] * k; });
  }));
  return { n, vague, missing };
}

/* ================= Week window, needs and recommendations ================= */
function windowLogs() { const from = Date.now() - 7 * DAY; return S.log.filter(l => l.ts >= from); }
function suppTotals() {
  const out = {};
  S.supplements.filter(s => s.active !== false).forEach(s => {
    const days = Math.max(0, Math.min(7, Number(s.days) || 0));
    Object.keys(s.n || {}).forEach(k => { out[k] = (out[k] || 0) + (Number(s.n[k]) || 0) * days; });
  });
  return out;
}
function coveredMap(logs) {
  const map = {};
  const keys = trackedKeys();
  logs.forEach(l => (l.vague || []).forEach(fid => {
    const f = foodById(fid); if (!f || f.cat === 'spice') return;
    keys.forEach(k => {
      const daily = S.goals[k].daily;
      if (f.n[k] && f.n[k] >= 0.2 * daily) { (map[k] = map[k] || []); const nm = foodName(f); if (!map[k].includes(nm)) map[k].push(nm); }
    });
  }));
  return map;
}
function computeNeeds() {
  const logs = windowLogs();
  const food = {};
  logs.forEach(l => Object.keys(l.n || {}).forEach(k => { food[k] = (food[k] || 0) + l.n[k]; }));
  const supp = suppTotals();
  const covered = coveredMap(logs);
  const out = {};
  trackedKeys().forEach(k => {
    const T = S.goals[k].daily * 7;
    const H = (food[k] || 0) + (supp[k] || 0);
    const cov = !!covered[k];
    const need = cov ? 0 : Math.max(0, T - H);
    out[k] = { T, food: food[k] || 0, supp: supp[k] || 0, H, pct: T ? H / T : 0, covered: covered[k] || null, need, frac: T ? need / T : 0 };
  });
  return out;
}
function lastEatenMap() {
  const m = {}; S.log.forEach(l => { if (!m[l.rid] || l.ts > m[l.rid]) m[l.rid] = l.ts; }); return m;
}
function rankRecipes() {
  const needs = computeNeeds(), last = lastEatenMap();
  const now = Date.now();
  const ranked = S.recipes.map(r => {
    const serv = Math.max(1, Number(r.servings) || 1);
    const nut = recipeNutrition(r, 1 / serv).n;
    let score = 0; const contrib = [];
    Object.keys(needs).forEach(k => {
      const nd = needs[k]; const v = nut[k] || 0;
      if (!v || !nd.T) return;
      if (nd.need > 0) {
        score += nd.frac * Math.min(v, nd.need) / nd.T;
        contrib.push({ k, pct: v / nd.T, w: nd.frac * Math.min(v, nd.need) / nd.T });
      }
    });
    const ago = last[r.id] ? (now - last[r.id]) / DAY : 999;
    if (ago < 2) score *= 0.35; else if (ago < 4) score *= 0.7;
    contrib.sort((a, b) => b.w - a.w);
    return { r, score, contrib, last: last[r.id] || 0 };
  });
  const hasScore = ranked.some(x => x.score > 0.0005);
  ranked.sort((a, b) => hasScore
    ? (b.score - a.score) || (a.last - b.last)
    : (a.last - b.last) || ((b.r.fav ? 1 : 0) - (a.r.fav ? 1 : 0)) || (b.r.createdAt - a.r.createdAt));
  return { ranked, hasScore };
}

/* ================= Theme ================= */
const PRESETS = [
  { id: 'cream', sv: 'Grädde & vinröd', en: 'Cream & wine', bg: '#F5EDE0', accent: '#7B1E2B' },
  { id: 'olive', sv: 'Olivlund', en: 'Olive grove', bg: '#F2EEE1', accent: '#4E5A2C' },
  { id: 'terra', sv: 'Terrakotta', en: 'Terracotta', bg: '#F7EEE5', accent: '#A4482C' },
  { id: 'harbour', sv: 'Hamnen', en: 'Harbour', bg: '#EEF0EE', accent: '#1E4A66' },
  { id: 'cacao', sv: 'Kakao', en: 'Cocoa', bg: '#F3EBE3', accent: '#4A2E25' },
  { id: 'night', sv: 'Midnatt', en: 'Midnight', bg: '#1C1614', accent: '#A3343F' }
];
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const rgbToHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, p) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * p)); };
function lum(h) { const c = hexToRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
function applyTheme() {
  const { bg, accent } = S.settings.theme;
  const dark = lum(bg) < 0.25;
  const text = dark ? '#F2E9DF' : mix('#2A1A16', accent, 0.12);
  const v = {
    '--bg': bg,
    '--surface': dark ? mix(bg, '#ffffff', 0.07) : mix(bg, '#ffffff', 0.6),
    '--surface-2': dark ? mix(bg, '#ffffff', 0.12) : mix(bg, '#000000', 0.045),
    '--text': text,
    '--muted': mix(text, bg, 0.42),
    '--line': mix(text, bg, dark ? 0.82 : 0.86),
    '--accent': accent,
    '--accent-ink': lum(accent) > 0.5 ? '#231512' : '#FBF2E6',
    '--accent-soft': mix(accent, bg, dark ? 0.72 : 0.86),
    '--accent-text': dark ? mix(accent, '#ffffff', 0.45) : accent,
    '--card-edge': dark ? mix(bg, '#ffffff', 0.16) : mix(bg, '#ffffff', 0.85),
    '--glow': dark ? 'transparent' : 'rgba(255,255,255,.35)',
    '--shadow': dark ? '0 6px 18px rgba(0,0,0,.45)' : '0 6px 18px ' + 'rgba(60,30,20,.13)'
  };
  const root = document.documentElement;
  Object.keys(v).forEach(k => root.style.setProperty(k, v[k]));
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', accent);
}

/* ================= Router ================= */
const app = { route: 'home', params: [], scroll: {}, wake: null, sheetOpen: false, editor: null, homeQuery: '' };
const FULL_PAGES = ['recipe', 'edit', 'profile'];

function parseHash() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
  return { route: parts[0] || 'home', params: parts.slice(1) };
}
function go(path, replace) { if (replace) location.replace('#/' + path); else location.hash = '#/' + path; }
function goBack(fallback = 'home') {
  if (app.navCount > 0) history.back(); else go(fallback, true);
}

function render() {
  const prev = app.route + '/' + app.params.join('/');
  app.scroll[prev] = window.scrollY;
  const { route, params } = parseHash();
  app.route = route; app.params = params;
  releaseWake();
  closeSheet(true);
  const full = FULL_PAGES.includes(route);
  document.body.classList.toggle('full-page', full);
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.go === route));
  const view = $('#view');
  view.className = 'view view-' + route;
  const fn = { home: renderHome, micros: renderMicros, supplements: renderSupps, shopping: renderShopping, converter: renderConverter, recipe: renderRecipe, edit: renderEditor, profile: renderProfile }[route] || renderHome;
  fn(view, params);
  const key = route + '/' + params.join('/');
  requestAnimationFrame(() => window.scrollTo(0, app.scroll[key] || 0));
}

function renderChrome() {
  $('#topbar').innerHTML = `
    <button class="tb-btn" id="tb-add" aria-label="${esc(t('addRecipes'))}">${IC.plus}</button>
    <div class="tb-title"><span class="tb-r">Ristorante</span> <span class="tb-a">Alfredo</span></div>
    <button class="tb-btn" id="tb-profile" aria-label="${esc(t('profile'))}">${IC.user}</button>`;
  $('#tb-add').onclick = () => go('edit/new');
  $('#tb-profile').onclick = () => go('profile');
  const tabs = [['home', IC.home, 'tabHome'], ['micros', IC.micros, 'tabMicros'], ['supplements', IC.pill, 'tabSupps'], ['shopping', IC.cart, 'tabShop'], ['converter', IC.scale, 'tabConvert']];
  $('#tabbar').innerHTML = tabs.map(([r, ic, k]) => `<button data-go="${r}" class="${app.route === r ? 'on' : ''}">${ic}<span>${esc(t(k))}</span></button>`).join('');
  $$('#tabbar button').forEach(b => b.onclick = () => { if (app.route === b.dataset.go) window.scrollTo({ top: 0, behavior: 'smooth' }); else go(b.dataset.go); });
  document.documentElement.lang = lang();
}

/* ================= Playing cards ================= */
const SUITS = ['♥', '♦', '♣', '♠'];
function suitOf(r) { return SUITS[hash((r.tags && r.tags[0]) || r.title || 'x') % 4]; }
function cardArt(r, big) {
  const suit = suitOf(r);
  if (r.image) return `<img src="${r.image}" alt="" loading="lazy" decoding="async">`;
  const initial = esc((r.title || '?').trim().charAt(0).toUpperCase());
  return `<span class="art-ph ${big ? 'big' : ''}"><span class="ph-suit s-${SUITS.indexOf(suit)}">${suit}</span><span class="ph-init">${initial}</span></span>`;
}
function cardHTML(r, sub) {
  const suit = suitOf(r), red = suit === '♥' || suit === '♦';
  const rank = esc((r.title || '?').trim().charAt(0).toUpperCase());
  const corner = S.settings.suits ? `<span class="pc-idx ${red ? 'red' : ''}"><b>${rank}</b><i>${suit}</i></span>` : '';
  return `<button class="pcard" data-open="${esc(r.id)}">
    ${corner}${S.settings.suits ? corner.replace('pc-idx', 'pc-idx br') : ''}
    <span class="pc-art">${cardArt(r)}</span>
    <span class="pc-title">${esc(r.title)}</span>
    ${sub ? `<span class="pc-sub">${esc(sub)}</span>` : ''}
    ${r.fav ? `<span class="pc-fav">${IC.star}</span>` : ''}
  </button>`;
}
function bindCards(root) { $$('[data-open]', root).forEach(el => el.onclick = () => go('recipe/' + el.dataset.open)); }

/* ================= Home ================= */
function renderHome(view) {
  if (S.skipped.day !== dayKey()) S.skipped = { day: dayKey(), ids: [] };
  if (!S.recipes.length) {
    view.innerHTML = `<section class="hero hero-empty">
      <div class="hero-card welcome">
        <div class="welcome-suits"><span>♥</span><span>♣</span><span>♦</span><span>♠</span></div>
        <h1>${esc(t('welcomeTitle'))}</h1>
        <p>${esc(t('welcomeText'))}</p>
        <button class="btn primary" id="w-add">${IC.plus}<span>${esc(t('addFirst'))}</span></button>
        <button class="btn ghost" id="w-samples">${esc(t('loadSamples'))}</button>
      </div></section>`;
    $('#w-add').onclick = () => go('edit/new');
    $('#w-samples').onclick = () => { loadSamples(); toast(t('samplesLoaded')); render(); };
    return;
  }
  const { ranked, hasScore } = rankRecipes();
  let pool = ranked.filter(x => !S.skipped.ids.includes(x.r.id));
  if (!pool.length) { S.skipped.ids = []; save('skipped'); pool = ranked; }
  const top = pool[0];
  const r = top.r;
  const last = lastEatenMap();
  let reason;
  if (hasScore && top.score > 0.0005) {
    reason = `<div class="hero-chips">${top.contrib.slice(0, 3).map(c => `<span class="chip">${esc(nutName(c.k))} <b>${fmt(Math.min(c.pct, 9.99) * 100, 0)} %</b></span>`).join('')}</div>
      <div class="hero-note">${esc(t('ofWeekly'))} · ${esc(t('todaysPickSub'))}</div>`;
  } else {
    const anyData = S.recipes.some(x => Object.keys(recipeNutrition(x).n).length);
    reason = `<div class="hero-note">${esc(anyData ? t('todaysPickFallback') : t('todaysPickNoData'))}</div>`;
  }
  const rows = [];
  const recommended = pool.slice(1, 13).map(x => x.r);
  if (recommended.length) rows.push([t('rowRecommended'), recommended]);
  const favs = S.recipes.filter(x => x.fav);
  if (favs.length) rows.push([t('rowFavorites'), favs]);
  const weekAgo = Date.now() - 7 * DAY;
  const notInAWhile = S.recipes.filter(x => !last[x.id] || last[x.id] < weekAgo).sort((a, b) => (last[a.id] || 0) - (last[b.id] || 0));
  if (notInAWhile.length) rows.push([t('rowNotInAWhile'), notInAWhile, true]);
  const recent = S.recipes.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
  rows.push([t('rowRecent'), recent]);
  const tagCount = {};
  S.recipes.forEach(x => (x.tags || []).forEach(tg => tagCount[tg] = (tagCount[tg] || 0) + 1));
  Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b)).forEach(tg => rows.push([tg, S.recipes.filter(x => (x.tags || []).includes(tg))]));

  view.innerHTML = `
    <section class="hero">
      <div class="hero-card" data-open="${esc(r.id)}">
        <div class="hero-art">${cardArt(r, true)}</div>
        <div class="hero-shade"></div>
        <div class="hero-label"><span class="hero-suit">${suitOf(r)}</span>${esc(t('todaysPick'))}</div>
        ${S.recipes.length > 1 ? `<button class="hero-skip" id="hero-skip" aria-label="${esc(t('showAnother'))}">${IC.shuffle}</button>` : ''}
        <div class="hero-body">
          <h1>${esc(r.title)}</h1>
          <div class="hero-meta">${r.time ? `<span>${IC.clock}${esc(r.time)} ${esc(t('minutes'))}</span>` : ''}<span>${esc(t('lastCooked'))}: ${esc(relDays(last[r.id]))}</span></div>
          ${reason}
        </div>
        <button class="hero-done" id="hero-done">${IC.check}<span>${esc(t('alreadyCompleted'))}</span></button>
      </div>
    </section>
    <div class="home-search">${IC.search}<input id="home-q" type="search" placeholder="${esc(t('searchRecipes'))}" value="${esc(app.homeQuery)}" autocomplete="off"></div>
    <div id="home-rows"></div>`;
  const rowsEl = $('#home-rows');
  const drawRows = () => {
    const q = normalize(app.homeQuery);
    if (q) {
      const hits = S.recipes.filter(x => normalize([x.title, (x.tags || []).join(' '), (x.groups || []).map(g => g.items.map(i => i.name).join(' ')).join(' ')].join(' ')).includes(q));
      rowsEl.innerHTML = hits.length ? `<div class="grid">${hits.map(x => cardHTML(x)).join('')}</div>` : `<p class="empty">${esc(t('noResults'))}</p>`;
    } else {
      rowsEl.innerHTML = rows.map(([title, list, showAgo]) => `<section class="row"><h2>${esc(title)}</h2><div class="row-scroll">${list.map(x => cardHTML(x, showAgo ? relDays(last[x.id]) : '')).join('')}</div></section>`).join('');
    }
    bindCards(rowsEl);
  };
  drawRows();
  $('#home-q').oninput = e => { app.homeQuery = e.target.value; drawRows(); };
  $('.hero-card').onclick = e => { if (e.target.closest('button')) return; go('recipe/' + r.id); };
  $('#hero-done').onclick = e => { e.stopPropagation(); openComplete(r, Number(r.servings) || 1, () => render()); };
  const sk = $('#hero-skip');
  if (sk) sk.onclick = e => { e.stopPropagation(); S.skipped.ids.push(r.id); save('skipped'); render(); };
}

/* ================= Recipe page ================= */
function stepState(rid) { try { return JSON.parse(localStorage.getItem('ra-steps-' + rid)) || []; } catch (e) { return []; } }
function setStepState(rid, arr) { try { localStorage.setItem('ra-steps-' + rid, JSON.stringify(arr)); } catch (e) {} }

function renderRecipe(view, [id]) {
  const r = S.recipes.find(x => x.id === id);
  if (!r) { go('home', true); return; }
  const base = Math.max(1, Number(r.servings) || 1);
  if (app.servFor !== r.id) { app.servFor = r.id; app.serv = base; }
  const factor = () => app.serv / base;
  const last = lastEatenMap()[r.id];

  view.innerHTML = `
    <article class="rp">
      <div class="rp-top">
        <button class="circle" id="rp-back" aria-label="${esc(t('back'))}">${IC.back}</button>
        <div class="rp-top-title">${esc(r.title)}</div>
        <button class="circle ${r.fav ? 'on' : ''}" id="rp-fav" aria-label="${esc(t('favorite'))}">${IC.star}</button>
        <button class="circle" id="rp-edit" aria-label="${esc(t('edit'))}">${IC.edit}</button>
      </div>
      <div class="rp-hero">${cardArt(r, true)}</div>
      <header class="rp-head">
        <h1>${esc(r.title)}</h1>
        ${(r.tags || []).length ? `<div class="tags">${r.tags.map(tg => `<span class="tag">${esc(tg)}</span>`).join('')}</div>` : ''}
        <div class="rp-meta">
          <div class="stepper" aria-label="${esc(t('servingsLabel'))}">
            <button id="sv-minus">−</button><span id="sv-val">${app.serv}</span><button id="sv-plus">+</button>
            <em>${esc(t('servings'))}</em>
          </div>
          ${r.time ? `<span class="meta-item">${IC.clock}${esc(r.time)} ${esc(t('minutes'))}</span>` : ''}
          <span class="meta-item muted">${esc(t('lastCooked'))}: ${esc(relDays(last))}</span>
        </div>
      </header>
      <div class="rp-cols">
        <div class="rp-col rp-left">
          <section class="panel">
            <div class="panel-h"><h2>${esc(t('ingredients'))}</h2>
              <button class="link-btn" id="rp-shop">${IC.cart}<span>${esc(t('addToShopping'))}</span></button></div>
            <div id="ing-list"></div>
          </section>
          <details class="panel nutri" id="rp-nutri"><summary><h2>${esc(t('nutritionPerPortion'))}</h2></summary><div id="nutri-body"></div></details>
        </div>
        <div class="rp-col rp-right">
          <section class="panel">
            <div class="panel-h"><h2>${esc(t('steps'))}</h2><button class="link-btn" id="rp-reset">${esc(t('stepsReset'))}</button></div>
            <ol class="steps" id="steps"></ol>
          </section>
          <section class="panel">
            <h2>${esc(t('notes'))}</h2>
            <div class="rating" id="rating">${[1, 2, 3, 4, 5].map(i => `<button data-r="${i}" class="${(r.rating || 0) >= i ? 'on' : ''}" aria-label="${i}">${IC.star}</button>`).join('')}</div>
            <textarea id="rp-notes" rows="3" placeholder="${esc(t('notesPlaceholder'))}">${esc(r.notes || '')}</textarea>
          </section>
          <button class="btn primary big" id="rp-done">${IC.check}<span>${esc(t('completed'))}</span></button>
        </div>
      </div>
    </article>`;

  const drawIngredients = () => {
    const f = factor();
    const groups = (r.groups || []).filter(g => g.items && g.items.some(i => i.name));
    $('#ing-list').innerHTML = groups.length ? groups.map(g => `
      <div class="ing-group">${g.name ? `<h3>${esc(g.name)}</h3>` : ''}
        <ul>${g.items.filter(i => i.name).map(i => {
          const u = UNITS[i.unit];
          let amt;
          if (u && u.t === 'x') amt = VAGUE_PHRASE[lang()][i.unit];
          else if (i.amount) { const a = Number(i.amount) * f; amt = fmtAmount(a, i.unit) + ' ' + unitLabel(i.unit, a); }
          else amt = '';
          return `<li><span class="amt">${esc(amt)}</span><span class="nm">${esc(i.name)}</span></li>`;
        }).join('')}</ul></div>`).join('') : `<p class="empty">${esc(t('noIngredients'))}</p>`;
  };
  const drawNutrition = () => {
    const res = recipeNutrition(r, 1 / base);
    const keys = trackedKeys().filter(k => res.n[k]);
    let html = keys.length ? `<ul class="nutri-list">${keys.map(k => {
      const pct = res.n[k] / S.goals[k].daily;
      return `<li><span>${esc(nutName(k))}</span><span class="nv">${fmt(res.n[k])} ${esc(nutUnit(k))}</span><span class="bar"><i style="width:${Math.min(100, pct * 100)}%"></i></span><span class="np">${fmt(pct * 100, 0)} %</span></li>`;
    }).join('')}</ul>` : `<p class="empty">${esc(t('nutritionNone'))}</p>`;
    const vagueNames = [...new Set(res.vague.map(foodById).filter(f => f && f.cat !== 'spice').map(foodName))];
    if (vagueNames.length) html += `<p class="fine">${esc(t('coveredBy', { list: vagueNames.join(', ') }))}</p>`;
    if (res.missing.length) html += `<p class="fine">${esc(t('notCounted', { list: [...new Set(res.missing)].join(', ') }))}</p>`;
    $('#nutri-body').innerHTML = html;
  };
  const drawSteps = () => {
    const done = stepState(r.id);
    const steps = (r.steps || []).filter(s => s.text && s.text.trim());
    $('#steps').innerHTML = steps.length ? steps.map((s, i) => `
      <li class="${done.includes(s.id) ? 'done' : ''}" data-s="${esc(s.id)}">
        <button class="cb" aria-label="${i + 1}">${IC.check}</button>
        <div><span class="sn">${i + 1}</span><p>${esc(s.text)}</p></div>
      </li>`).join('') : `<p class="empty">${esc(t('noSteps'))}</p>`;
    $$('#steps li').forEach(li => li.onclick = () => {
      const arr = stepState(r.id); const sid = li.dataset.s;
      const i = arr.indexOf(sid); if (i >= 0) arr.splice(i, 1); else arr.push(sid);
      setStepState(r.id, arr); li.classList.toggle('done');
    });
  };
  drawIngredients(); drawNutrition(); drawSteps();

  $('#sv-minus').onclick = () => { if (app.serv > 1) { app.serv--; $('#sv-val').textContent = app.serv; drawIngredients(); } };
  $('#sv-plus').onclick = () => { if (app.serv < 99) { app.serv++; $('#sv-val').textContent = app.serv; drawIngredients(); } };
  $('#rp-back').onclick = () => goBack();
  $('#rp-edit').onclick = () => go('edit/' + r.id);
  $('#rp-fav').onclick = e => { r.fav = !r.fav; save('recipes'); e.currentTarget.classList.toggle('on', r.fav); };
  $('#rp-reset').onclick = () => { setStepState(r.id, []); drawSteps(); };
  $('#rp-shop').onclick = () => { addRecipeToShopping(r, factor()); toast(t('addedToShopping')); };
  $$('#rating button').forEach(b => b.onclick = () => {
    const v = Number(b.dataset.r); r.rating = r.rating === v ? 0 : v; save('recipes');
    $$('#rating button').forEach(x => x.classList.toggle('on', Number(x.dataset.r) <= r.rating));
  });
  let nt; $('#rp-notes').oninput = e => { r.notes = e.target.value; clearTimeout(nt); nt = setTimeout(() => save('recipes'), 400); };
  $('#rp-done').onclick = () => openComplete(r, app.serv, () => { setStepState(r.id, []); drawSteps(); });
  if (S.settings.wakeLock) requestWake();
}

/* ---- screen wake lock ---- */
async function requestWake() {
  try { if ('wakeLock' in navigator) { app.wake = await navigator.wakeLock.request('screen'); } } catch (e) {}
}
function releaseWake() { try { if (app.wake) app.wake.release(); } catch (e) {} app.wake = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.route === 'recipe' && S.settings && S.settings.wakeLock) requestWake();
});

/* ================= Completion sheet ================= */
function openComplete(r, servNow, after) {
  const base = Math.max(1, Number(r.servings) || 1);
  const factor = servNow / base;
  const totalServ = servNow;
  let pct = Math.round(100 / totalServ / 5) * 5 || 5;
  let ignore = false;
  openSheet(`
    <h2>${esc(t('howMuch'))}</h2>
    <p class="sheet-sub">${esc(r.title)}</p>
    <div class="pct-display"><b id="cp-pct">${pct} %</b> <span>${esc(t('ofDish'))}</span></div>
    <div class="pct-sub" id="cp-por"></div>
    <input type="range" id="cp-range" min="0" max="100" step="5" value="${pct}">
    <div class="quick">
      <button data-p="${100 / totalServ}">${esc(t('onePortion'))}</button>
      <button data-p="25">¼</button><button data-p="${100 / 3}">⅓</button><button data-p="50">½</button><button data-p="${200 / 3}">⅔</button><button data-p="100">${esc(t('whole'))}</button>
    </div>
    <label class="switch-row"><span><b>${esc(t('ignoreLabel'))}</b><small>${esc(t('ignoreHelp'))}</small></span><input type="checkbox" id="cp-ign" class="switch"></label>
    <div class="sheet-actions"><button class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn primary" id="cp-save">${esc(t('save'))}</button></div>`,
  sh => {
    const rng = $('#cp-range', sh);
    const upd = () => {
      $('#cp-pct', sh).textContent = (ignore ? 50 : pct) + ' %';
      $('#cp-por', sh).textContent = t('portionsEq', { n: fmt((ignore ? 50 : pct) / 100 * totalServ, 1), t: totalServ });
      rng.disabled = ignore; sh.classList.toggle('ignored', ignore);
    };
    rng.oninput = () => { pct = Number(rng.value); upd(); };
    $$('.quick button', sh).forEach(b => b.onclick = () => { if (ignore) return; pct = Math.round(Number(b.dataset.p)); rng.value = pct; upd(); });
    $('#cp-ign', sh).onchange = e => { ignore = e.target.checked; upd(); };
    upd();
    $('#cp-save', sh).onclick = () => {
      const frac = (ignore ? 50 : pct) / 100;
      if (frac <= 0) { closeSheet(); return; }
      const res = recipeNutrition(r, factor * frac);
      S.log.push({ id: uid(), rid: r.id, title: r.title, ts: Date.now(), frac, ignored: ignore, n: res.n, vague: [...new Set(res.vague)] });
      S.log = S.log.filter(l => l.ts > Date.now() - 400 * DAY);
      save('log');
      closeSheet();
      toast(t('logged'));
      if (after) after();
    };
  });
}

/* ================= Sheets ================= */
function openSheet(html, onMount) {
  const root = $('#sheet-root');
  app.sheetToken = (app.sheetToken || 0) + 1;
  root.innerHTML = `<div class="sheet-bg"></div><div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
  root.classList.add('open');
  app.sheetOpen = true;
  document.body.classList.add('lock');
  const sh = $('.sheet', root);
  $('.sheet-bg', root).onclick = () => closeSheet();
  $$('[data-close]', sh).forEach(b => b.onclick = () => closeSheet());
  if (onMount) onMount(sh);
  requestAnimationFrame(() => root.classList.add('in'));
  return sh;
}
function closeSheet(instant) {
  const root = $('#sheet-root');
  if (!app.sheetOpen) return;
  app.sheetOpen = false;
  document.body.classList.remove('lock');
  root.classList.remove('in');
  const token = app.sheetToken = (app.sheetToken || 0) + 1;
  const done = () => { if (app.sheetOpen || token !== app.sheetToken) return; root.classList.remove('open'); root.innerHTML = ''; };
  if (instant) done(); else setTimeout(done, 220);
}

/* ================= Editor ================= */
function blankRecipe() {
  return { id: uid(), title: '', image: '', tags: [], servings: S.settings.defaultServings || 4, time: '', fav: false, notes: '', rating: 0, createdAt: Date.now(),
    groups: [{ id: uid(), name: '', items: [newItem()] }], steps: [{ id: uid(), text: '' }] };
}
function newItem() { return { id: uid(), name: '', foodId: null, amount: '', unit: 'g' }; }

function renderEditor(view, [id]) {
  const existing = id && id !== 'new' ? S.recipes.find(x => x.id === id) : null;
  if (!app.editor || app.editor.forId !== (id || 'new')) {
    app.editor = { forId: id || 'new', r: existing ? clone(existing) : blankRecipe(), dirty: false };
  }
  const ED = app.editor;
  const r = ED.r;
  const dirty = () => { ED.dirty = true; };

  view.innerHTML = `
    <div class="ed">
      <div class="ed-top">
        <button class="txt-btn" id="ed-cancel">${esc(t('cancel'))}</button>
        <div class="ed-title">${esc(existing ? t('editRecipe') : t('newRecipe'))}</div>
        <button class="txt-btn strong" id="ed-save">${esc(t('save'))}</button>
      </div>
      <div class="ed-body">
        <div class="photo-pick" id="ed-photo">${r.image ? `<img src="${r.image}" alt="">` : `<span>${IC.camera}<em>${esc(t('addPhoto'))}</em></span>`}</div>
        <input type="file" id="ed-file" accept="image/*" hidden>
        ${r.image ? `<button class="link-btn danger center" id="ed-rmphoto">${esc(t('removePhoto'))}</button>` : ''}
        <label class="field"><span>${esc(t('title'))}</span><input id="ed-name" value="${esc(r.title)}" placeholder="${esc(t('titlePh'))}" autocomplete="off"></label>
        <div class="field-row">
          <div class="field"><span>${esc(t('servingsLabel'))}</span>
            <div class="stepper"><button id="ed-sv-m">−</button><span id="ed-sv">${r.servings}</span><button id="ed-sv-p">+</button></div></div>
          <label class="field"><span>${esc(t('time'))}</span><input id="ed-time" inputmode="numeric" value="${esc(r.time)}" placeholder="30"></label>
        </div>
        <div class="field"><span>${esc(t('tags'))}</span>
          <div class="tag-edit" id="ed-tags"></div>
          <small class="help">${esc(t('tagsHelp'))}</small></div>
        <h2 class="ed-h">${esc(t('ingredients'))}</h2>
        <div id="ed-groups"></div>
        <button class="btn ghost wide" id="ed-addgroup">${IC.plus}<span>${esc(t('addIngCategory'))}</span></button>
        <h2 class="ed-h">${esc(t('steps'))}</h2>
        <div id="ed-steps"></div>
        <button class="btn ghost wide" id="ed-addstep">${IC.plus}<span>${esc(t('addStep'))}</span></button>
        ${existing ? `<button class="btn danger wide" id="ed-delete">${IC.trash}<span>${esc(t('deleteRecipe'))}</span></button>` : ''}
      </div>
    </div>`;

  // photo
  $('#ed-photo').onclick = () => $('#ed-file').click();
  $('#ed-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { r.image = await compressImage(file); dirty(); renderEditor(view, [id]); } catch (err) { toast('⚠︎'); }
  };
  const rm = $('#ed-rmphoto'); if (rm) rm.onclick = () => { r.image = ''; dirty(); renderEditor(view, [id]); };
  $('#ed-name').oninput = e => { r.title = e.target.value; dirty(); };
  $('#ed-time').oninput = e => { r.time = e.target.value.replace(/[^\d]/g, ''); dirty(); };
  $('#ed-sv-m').onclick = () => { if (r.servings > 1) { r.servings--; $('#ed-sv').textContent = r.servings; dirty(); } };
  $('#ed-sv-p').onclick = () => { if (r.servings < 99) { r.servings++; $('#ed-sv').textContent = r.servings; dirty(); } };

  // tags
  const drawTags = () => {
    const known = [...new Set(S.recipes.flatMap(x => x.tags || []).concat(DEFAULT_TAGS[lang()]))];
    const sugg = known.filter(tg => !r.tags.includes(tg));
    $('#ed-tags').innerHTML = `
      <div class="tags">${r.tags.map(tg => `<button class="tag on" data-tag="${esc(tg)}">${esc(tg)} ×</button>`).join('')}
        <input id="ed-tag-in" placeholder="${esc(t('tagPh'))}" enterkeyhint="done" autocomplete="off"></div>
      <div class="tags sugg">${sugg.map(tg => `<button class="tag" data-add="${esc(tg)}">+ ${esc(tg)}</button>`).join('')}</div>`;
    $$('#ed-tags [data-tag]').forEach(b => b.onclick = () => { r.tags = r.tags.filter(x => x !== b.dataset.tag); dirty(); drawTags(); });
    $$('#ed-tags [data-add]').forEach(b => b.onclick = () => { r.tags.push(b.dataset.add); dirty(); drawTags(); });
    const inp = $('#ed-tag-in');
    const commit = () => { const v = inp.value.trim(); if (v && !r.tags.includes(v)) { r.tags.push(v); dirty(); drawTags(); $('#ed-tag-in').focus(); } };
    inp.onkeydown = e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } };
    inp.onblur = () => { if (inp.value.trim()) commit(); };
  };
  drawTags();

  // ingredient groups
  const drawGroups = (focusSel) => {
    $('#ed-groups').innerHTML = r.groups.map((g, gi) => `
      <section class="ed-group" data-g="${g.id}">
        <div class="ed-group-h">
          <input class="grp-name" value="${esc(g.name)}" placeholder="${esc(t('ingCategoryPh'))}" aria-label="${esc(t('ingCategory'))}">
          ${r.groups.length > 1 ? `<button class="icon-btn" data-gup="${gi}" aria-label="${esc(t('moveUp'))}" ${gi === 0 ? 'disabled' : ''}>${IC.up}</button>
          <button class="icon-btn" data-gdel="${gi}" aria-label="${esc(t('removeCategory'))}">${IC.trash}</button>` : ''}
        </div>
        ${g.items.map(it => ingRowHTML(it)).join('')}
        <button class="link-btn" data-additem="${g.id}">${IC.plus}<span>${esc(t('addIngredient'))}</span></button>
      </section>`).join('');
    bindGroups();
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
  };
  const findItem = (gid, iid) => { const g = r.groups.find(x => x.id === gid); return { g, it: g && g.items.find(x => x.id === iid) }; };
  const bindGroups = () => {
    $$('.grp-name').forEach(inp => inp.oninput = () => { r.groups.find(g => g.id === inp.closest('.ed-group').dataset.g).name = inp.value; dirty(); });
    $$('[data-gup]').forEach(b => b.onclick = () => { const i = Number(b.dataset.gup); if (i > 0) { [r.groups[i - 1], r.groups[i]] = [r.groups[i], r.groups[i - 1]]; dirty(); drawGroups(); } });
    $$('[data-gdel]').forEach(b => b.onclick = () => { r.groups.splice(Number(b.dataset.gdel), 1); dirty(); drawGroups(); });
    $$('[data-additem]').forEach(b => b.onclick = () => {
      const g = r.groups.find(x => x.id === b.dataset.additem); const it = newItem(); g.items.push(it); dirty();
      drawGroups(`.ing-row[data-i="${it.id}"] .ing-name`);
    });
    $$('.ing-row').forEach(row => bindIngRow(row));
  };
  const bindIngRow = (row) => {
    const gid = row.closest('.ed-group').dataset.g, iid = row.dataset.i;
    const { g, it } = findItem(gid, iid);
    const nameIn = $('.ing-name', row), ac = $('.ac-list', row);
    const redrawRow = (focus) => {
      const tmp = document.createElement('div'); tmp.innerHTML = ingRowHTML(it); const nr = tmp.firstElementChild;
      row.replaceWith(nr); bindIngRow(nr); if (focus) { const el = $(focus, nr); if (el) el.focus(); }
    };
    const showAc = () => {
      const hits = searchFoods(nameIn.value);
      if (!hits.length || (it.foodId && hits[0].id === it.foodId && normalize(nameIn.value) === normalize(foodName(hits[0])))) { ac.innerHTML = ''; ac.hidden = true; return; }
      ac.innerHTML = hits.map(f => `<button data-f="${esc(f.id)}"><span>${esc(foodName(f))}</span><small>${esc(FOOD_CATS[f.cat] ? FOOD_CATS[f.cat][lang()] : '')}${f.custom ? ' · ★' : ''}</small></button>`).join('');
      ac.hidden = false;
      $$('button', ac).forEach(b => b.onmousedown = b.ontouchstart = ev => { ev.preventDefault(); pick(b.dataset.f); });
    };
    const pick = fid => {
      const f = foodById(fid); if (!f) return;
      it.foodId = f.id;
      if (!it.name || !normalize(it.name).includes(normalize(foodName(f)).split(' ')[0])) it.name = foodName(f);
      const groups = unitsFor(f); const all = [].concat(groups.w, groups.v, groups.p, groups.x);
      if (!all.includes(it.unit) || (!it.amount && UNITS[it.unit].t !== 'x')) it.unit = defaultUnitFor(f);
      dirty(); redrawRow('.ing-amt');
    };
    nameIn.oninput = () => {
      it.name = nameIn.value; dirty();
      if (it.foodId) { const f = foodById(it.foodId); const fn = normalize(foodName(f)).split(' ')[0]; if (!f || !normalize(it.name).includes(fn)) { it.foodId = null; updateStatus(); } }
      showAc();
    };
    nameIn.onfocus = showAc;
    nameIn.onblur = () => setTimeout(() => { ac.hidden = true; updateStatus(); }, 150);
    const updateStatus = () => { const st = $('.ing-status', row); if (st) { const tmp = document.createElement('div'); tmp.innerHTML = ingStatusHTML(it); st.replaceWith(tmp.firstElementChild); bindStatus(); } };
    const bindStatus = () => {
      const addF = $('[data-newfood]', row);
      if (addF) addF.onclick = () => openFoodEditor(null, it.name, f => { it.foodId = f.id; it.unit = defaultUnitFor(f); dirty(); redrawRow('.ing-amt'); });
    };
    bindStatus();
    $('.ing-amt', row).oninput = e => { const v = parseAmount(e.target.value); it.amount = isNaN(v) ? '' : v; it.amountRaw = e.target.value; dirty(); };
    $('.ing-unit', row).onchange = e => { it.unit = e.target.value; dirty(); redrawRow(UNITS[it.unit].t === 'x' ? null : '.ing-amt'); };
    $('.ing-del', row).onclick = () => { g.items = g.items.filter(x => x.id !== it.id); if (!g.items.length) g.items.push(newItem()); dirty(); drawGroups(); };
  };
  drawGroups();
  $('#ed-addgroup').onclick = () => { const g = { id: uid(), name: '', items: [newItem()] }; r.groups.push(g); dirty(); drawGroups(`.ed-group[data-g="${g.id}"] .grp-name`); };

  // steps
  const drawSteps = (focusId) => {
    $('#ed-steps').innerHTML = r.steps.map((s, i) => `
      <div class="ed-step" data-s="${s.id}">
        <span class="sn">${i + 1}</span>
        <textarea rows="2" placeholder="${esc(t('stepPh'))}">${esc(s.text)}</textarea>
        <div class="ed-step-tools">
          <button class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('moveUp'))}">${IC.up}</button>
          <button class="icon-btn" data-down="${i}" ${i === r.steps.length - 1 ? 'disabled' : ''} aria-label="${esc(t('moveDown'))}">${IC.down}</button>
          <button class="icon-btn" data-del="${i}" aria-label="${esc(t('delete'))}">${IC.trash}</button>
        </div>
      </div>`).join('');
    $$('#ed-steps textarea').forEach(ta => { autoGrow(ta); ta.oninput = () => { r.steps.find(s => s.id === ta.closest('.ed-step').dataset.s).text = ta.value; dirty(); autoGrow(ta); }; });
    $$('#ed-steps [data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [r.steps[i - 1], r.steps[i]] = [r.steps[i], r.steps[i - 1]]; dirty(); drawSteps(); });
    $$('#ed-steps [data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down; [r.steps[i + 1], r.steps[i]] = [r.steps[i], r.steps[i + 1]]; dirty(); drawSteps(); });
    $$('#ed-steps [data-del]').forEach(b => b.onclick = () => { r.steps.splice(+b.dataset.del, 1); if (!r.steps.length) r.steps.push({ id: uid(), text: '' }); dirty(); drawSteps(); });
    if (focusId) { const ta = $(`.ed-step[data-s="${focusId}"] textarea`); if (ta) ta.focus(); }
  };
  drawSteps();
  $('#ed-addstep').onclick = () => { const s = { id: uid(), text: '' }; r.steps.push(s); dirty(); drawSteps(s.id); };

  $('#ed-cancel').onclick = () => {
    if (ED.dirty && !confirm(t('confirmDiscard'))) return;
    app.editor = null; goBack(existing ? 'recipe/' + existing.id : 'home');
  };
  $('#ed-save').onclick = () => {
    if (!r.title.trim()) { toast(t('titleRequired')); $('#ed-name').focus(); return; }
    r.title = r.title.trim();
    r.groups.forEach(g => { g.name = (g.name || '').trim(); g.items = g.items.filter(i => i.name && i.name.trim()); g.items.forEach(i => { i.name = i.name.trim(); delete i.amountRaw; }); });
    r.groups = r.groups.filter(g => g.items.length || g.name);
    if (!r.groups.length) r.groups = [{ id: uid(), name: '', items: [] }];
    r.steps = r.steps.filter(s => s.text && s.text.trim());
    r.servings = Math.max(1, Number(r.servings) || 1);
    delete r.demo;
    const idx = S.recipes.findIndex(x => x.id === r.id);
    if (idx >= 0) S.recipes[idx] = r; else S.recipes.push(r);
    save('recipes');
    app.editor = null; app.servFor = null;
    toast(t('saved'));
    go('recipe/' + r.id, true);
  };
  const del = $('#ed-delete');
  if (del) del.onclick = () => {
    if (!confirm(t('confirmDeleteRecipe', { name: existing.title }))) return;
    S.recipes = S.recipes.filter(x => x.id !== existing.id);
    S.shopping.forEach(s => { if (s.rid === existing.id) s.rid = null; });
    save('recipes', 'shopping');
    app.editor = null;
    go('home', true);
  };
}
function ingRowHTML(it) {
  const food = foodById(it.foodId);
  const groups = unitsFor(food);
  const opt = (u) => `<option value="${u}" ${it.unit === u ? 'selected' : ''}>${esc(unitLabel(u, 2))}${UNITS[u].t === 'p' && food && pieceGrams(food, u) ? ' (' + fmt(pieceGrams(food, u)) + ' g)' : ''}</option>`;
  let all = [].concat(groups.w, groups.v, groups.p, groups.x);
  if (!all.includes(it.unit)) { it.unit = defaultUnitFor(food); }
  const vague = UNITS[it.unit] && UNITS[it.unit].t === 'x';
  const amtVal = it.amountRaw != null ? it.amountRaw : (Number(it.amount) > 0 ? String(+Number(it.amount).toFixed(3)).replace('.', lang() === 'sv' ? ',' : '.') : '');
  return `<div class="ing-row" data-i="${it.id}">
    <div class="ing-name-wrap">
      <input class="ing-name" value="${esc(it.name)}" placeholder="${esc(t('ingredientPh'))}" autocomplete="off" autocapitalize="sentences">
      <div class="ac-list" hidden></div>
    </div>
    <div class="ing-qty">
      <input class="ing-amt" inputmode="decimal" value="${esc(vague ? '' : amtVal)}" placeholder="${esc(t('amountPh'))}" ${vague ? 'disabled' : ''}>
      <select class="ing-unit">
        <optgroup label="${esc(t('uWeight'))}">${groups.w.map(opt).join('')}</optgroup>
        ${groups.v.length ? `<optgroup label="${esc(t('uVolume'))}">${groups.v.map(opt).join('')}</optgroup>` : ''}
        ${groups.p.length ? `<optgroup label="${esc(t('uPieces'))}">${groups.p.map(opt).join('')}</optgroup>` : ''}
        <optgroup label="${esc(t('uVague'))}">${groups.x.map(opt).join('')}</optgroup>
      </select>
      <button class="icon-btn ing-del" aria-label="${esc(t('delete'))}">${IC.x}</button>
    </div>
    ${ingStatusHTML(it)}
  </div>`;
}
function ingStatusHTML(it) {
  const food = foodById(it.foodId);
  const vague = UNITS[it.unit] && UNITS[it.unit].t === 'x';
  if (food) return `<div class="ing-status ok">${IC.check}<span>${esc(t('linkedTo', { name: foodName(food) }))}${vague && food.cat !== 'spice' ? ' · ' + esc(t('vagueNote')) : ''}</span></div>`;
  if (it.name && it.name.trim()) return `<div class="ing-status none"><span>${esc(t('notLinked'))}</span><button class="link-btn" data-newfood>${IC.plus}<span>${esc(t('addAsIngredient'))}</span></button></div>`;
  return `<div class="ing-status"></div>`;
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }

function compressImage(file, max = 1000, q = 0.8) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    img.src = url;
  });
}

/* ================= Custom food editor (sheet) ================= */
function openFoodEditor(food, presetName, onSaved) {
  const isNew = !food;
  const f = food ? clone(food) : { id: 'c_' + uid(), custom: true, sv: presetName || '', en: '', cat: 'other', d: 0, pc: {}, n: {}, al: [] };
  let showAll = false;
  const fields = () => {
    const tracked = trackedKeys();
    const list = nutList().filter(n => showAll || tracked.includes(n.key) || f.n[n.key]);
    return list.map(n => `<label class="nut-in"><span>${esc(n.name)}</span><input inputmode="decimal" data-n="${n.key}" value="${f.n[n.key] != null ? esc(String(f.n[n.key]).replace('.', lang() === 'sv' ? ',' : '.')) : ''}" placeholder="0"><em>${esc(n.u)}</em></label>`).join('');
  };
  openSheet(`
    <h2>${esc(isNew ? t('newFood') : t('editFood'))}</h2>
    <label class="field"><span>${esc(t('foodName'))}</span><input id="fd-name" value="${esc(f.sv)}"></label>
    <label class="field"><span>${esc(t('foodCategory'))}</span><select id="fd-cat">${Object.keys(FOOD_CATS).map(c => `<option value="${c}" ${f.cat === c ? 'selected' : ''}>${esc(FOOD_CATS[c][lang()])}</option>`).join('')}</select></label>
    <div class="field-row">
      <label class="field"><span>${esc(t('pieceWeight'))}</span><input id="fd-st" inputmode="decimal" value="${f.pc.st || ''}" placeholder="—"><small class="help">${esc(t('pieceWeightHelp'))}</small></label>
      <label class="field"><span>${esc(t('gramsPerDl'))}</span><input id="fd-dl" inputmode="decimal" value="${f.d ? fmt(f.d * 100, 0) : ''}" placeholder="—"><small class="help">${esc(t('gramsPerDlHelp'))}</small></label>
    </div>
    <h3 class="sheet-h3">${esc(t('per100'))}</h3>
    <div id="fd-nuts" class="nut-grid">${fields()}</div>
    <button class="link-btn" id="fd-all">${esc(t('showAllNutrients'))}</button>
    <div class="sheet-actions">
      ${!isNew ? `<button class="btn danger" id="fd-del">${esc(t('delete'))}</button>` : `<button class="btn ghost" data-close>${esc(t('cancel'))}</button>`}
      <button class="btn primary" id="fd-save">${esc(t('save'))}</button></div>`,
  sh => {
    const collect = () => { $$('#fd-nuts input', sh).forEach(i => { const v = parseAmount(i.value); if (!isNaN(v) && v > 0) f.n[i.dataset.n] = v; else delete f.n[i.dataset.n]; }); };
    $('#fd-all', sh).onclick = e => { collect(); showAll = true; $('#fd-nuts', sh).innerHTML = fields(); e.target.remove(); };
    $('#fd-save', sh).onclick = () => {
      collect();
      f.sv = $('#fd-name', sh).value.trim(); f.en = f.sv;
      if (!f.sv) { $('#fd-name', sh).focus(); return; }
      f.cat = $('#fd-cat', sh).value;
      const st = parseAmount($('#fd-st', sh).value); f.pc = {}; if (st > 0) f.pc.st = st;
      const dl = parseAmount($('#fd-dl', sh).value); f.d = dl > 0 ? dl / 100 : 0;
      const i = S.customFoods.findIndex(x => x.id === f.id);
      if (i >= 0) S.customFoods[i] = f; else S.customFoods.push(f);
      save('customFoods'); closeSheet();
      if (onSaved) setTimeout(() => onSaved(f), 230);
    };
    const del = $('#fd-del', sh);
    if (del) del.onclick = () => { if (!confirm(t('confirmDeleteFood', { name: f.sv }))) return; S.customFoods = S.customFoods.filter(x => x.id !== f.id); save('customFoods'); closeSheet(); if (onSaved) setTimeout(() => onSaved(null), 230); };
  });
}

/* ================= Micros ================= */
function renderMicros(view) {
  const needs = computeNeeds();
  const keys = trackedKeys();
  const avg = keys.length ? keys.reduce((s, k) => s + (needs[k].covered ? 1 : Math.min(1, needs[k].pct)), 0) / keys.length : 0;
  const logs = windowLogs().sort((a, b) => b.ts - a.ts);
  view.innerHTML = `
    <div class="page">
      <header class="page-h"><div><h1>${esc(t('microsTitle'))}</h1><p>${esc(t('microsSub'))}</p></div>
        <button class="btn primary sm" id="mi-add">${IC.plus}<span>${esc(t('addMicros'))}</span></button></header>
      ${keys.length ? `<div class="coverage card-surface">
        <div class="ring" style="--p:${Math.round(avg * 100)}"><span>${fmt(avg * 100, 0)}%</span></div>
        <div><b>${esc(t('weeklyCoverage'))}</b><p class="muted">${esc(S.settings.sex === 'f' ? t('female') : t('male'))}, ${esc(S.settings.age)} · ${keys.length} ${lang() === 'sv' ? 'näringsämnen' : 'nutrients'}</p></div>
      </div>` : ''}
      <div class="micro-list">${keys.length ? keys.map(k => {
        const nd = needs[k]; const p = nd.covered ? 1 : nd.pct;
        const lvl = p >= .9 ? 'good' : p >= .5 ? 'mid' : 'low';
        return `<button class="micro ${lvl}" data-k="${k}">
          <div class="mi-top"><span class="mi-name">${esc(nutName(k))}</span>
            <span class="mi-val">${fmt(nd.H)} / ${fmt(nd.T)} ${esc(nutUnit(k))}</span><span class="mi-pct">${nd.covered ? '✓' : fmt(nd.pct * 100, 0) + ' %'}</span></div>
          <div class="mi-bar"><i class="f" style="width:${Math.min(100, nd.T ? nd.food / nd.T * 100 : 0)}%"></i><i class="s" style="width:${Math.min(100, nd.T ? nd.supp / nd.T * 100 : 0)}%"></i></div>
          ${nd.covered ? `<div class="mi-cov">${esc(t('coveredBadge'))}: ${esc(nd.covered.join(', '))}</div>` : ''}
        </button>`;
      }).join('') : `<p class="empty">${esc(t('noTracked'))}</p>`}</div>
      ${keys.length ? `<div class="legend"><span><i class="f"></i>${esc(t('fromFood'))}</span><span><i class="s"></i>${esc(t('fromSupps'))}</span></div>` : ''}
      <h2 class="sec-h">${esc(t('mealLog'))}</h2>
      <div class="log-list">${logs.length ? logs.map(l => `<div class="log-item"><div><b>${esc(l.title)}</b><small>${esc(new Date(l.ts).toLocaleDateString(lang() === 'sv' ? 'sv-SE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))} · ${fmt(l.frac * 100, 0)} %${l.ignored ? ' · ' + esc(t('ignoredTag')) : ''}</small></div><button class="icon-btn" data-dl="${l.id}" aria-label="${esc(t('delete'))}">${IC.trash}</button></div>`).join('') : `<p class="empty">${esc(t('noMeals'))}</p>`}</div>
      <button class="link-btn center" id="mi-reset">${esc(t('resetAllGoals'))}</button>
      <p class="fine">${esc(t('microsFootnote'))}</p>
    </div>`;
  $$('.micro').forEach(b => b.onclick = () => openGoalEditor(b.dataset.k));
  $('#mi-add').onclick = openAddMicros;
  $$('[data-dl]').forEach(b => b.onclick = () => { if (!confirm(t('confirmDeleteLog'))) return; S.log = S.log.filter(l => l.id !== b.dataset.dl); save('log'); render(); });
  $('#mi-reset').onclick = () => {
    if (!confirm(t('confirmResetGoals'))) return;
    NUTRIENT_KEYS.forEach(k => { S.goals[k] = { daily: defaultDailyTarget(k, S.settings.sex, S.settings.age), on: DEFAULT_ON.includes(k), custom: false }; });
    save('goals'); render();
  };
}
function openGoalEditor(k) {
  const g = S.goals[k]; const isCustomNut = !NUTRIENT_META[k];
  openSheet(`
    <h2>${esc(nutName(k))}</h2>
    <label class="field"><span>${esc(t('dailyTarget'))} (${esc(nutUnit(k))})</span><input id="ge-v" inputmode="decimal" value="${esc(String(g.daily).replace('.', lang() === 'sv' ? ',' : '.'))}"></label>
    <p class="muted" id="ge-w"></p>
    ${!isCustomNut ? `<button class="link-btn" id="ge-reset">${esc(t('resetToRecommended'))} (${fmt(defaultDailyTarget(k, S.settings.sex, S.settings.age))} ${esc(nutUnit(k))})</button>` : ''}
    <label class="switch-row"><span><b>${esc(t('track'))}</b></span><input type="checkbox" class="switch" id="ge-on" ${g.on ? 'checked' : ''}></label>
    <div class="sheet-actions">${isCustomNut ? `<button class="btn danger" id="ge-del">${esc(t('delete'))}</button>` : `<button class="btn ghost" data-close>${esc(t('cancel'))}</button>`}<button class="btn primary" id="ge-save">${esc(t('save'))}</button></div>`,
  sh => {
    const upd = () => { const v = parseAmount($('#ge-v', sh).value); $('#ge-w', sh).textContent = isNaN(v) ? '' : t('weeklyTarget') + ': ' + fmt(v * 7) + ' ' + nutUnit(k); };
    $('#ge-v', sh).oninput = upd; upd();
    const rs = $('#ge-reset', sh); if (rs) rs.onclick = () => { $('#ge-v', sh).value = fmt(defaultDailyTarget(k, S.settings.sex, S.settings.age)); upd(); };
    $('#ge-save', sh).onclick = () => {
      const v = parseAmount($('#ge-v', sh).value);
      if (!isNaN(v) && v > 0) { if (Math.abs(v - g.daily) > 1e-9) { g.daily = v; g.custom = Math.abs(v - defaultDailyTarget(k, S.settings.sex, S.settings.age)) > 1e-9 || isCustomNut; } }
      g.on = $('#ge-on', sh).checked;
      save('goals'); closeSheet(); render();
    };
    const del = $('#ge-del', sh); if (del) del.onclick = () => { S.customNutrients = S.customNutrients.filter(c => c.key !== k); delete S.goals[k]; save('customNutrients', 'goals'); closeSheet(); render(); };
  });
}
function openAddMicros() {
  const avail = nutList().filter(n => !(S.goals[n.key] && S.goals[n.key].on));
  openSheet(`
    <h2>${esc(t('addMicros'))}</h2>
    <div class="pick-list">${avail.length ? avail.map(n => `<button data-k="${n.key}"><span>${esc(n.name)}</span><small>${fmt(S.goals[n.key] ? S.goals[n.key].daily : 0)} ${esc(n.u)}/${lang() === 'sv' ? 'dag' : 'day'}</small>${IC.plus}</button>`).join('') : `<p class="empty">${esc(t('allTracked'))}</p>`}</div>
    <h3 class="sheet-h3">${esc(t('customNutrient'))}</h3>
    <div class="field-row three">
      <label class="field"><span>${esc(t('nutrientName'))}</span><input id="cn-name" placeholder="Omega-3"></label>
      <label class="field"><span>${esc(t('unit'))}</span><select id="cn-u"><option>µg</option><option selected>mg</option><option>g</option></select></label>
      <label class="field"><span>${esc(t('dailyTarget'))}</span><input id="cn-d" inputmode="decimal" placeholder="250"></label>
    </div>
    <div class="sheet-actions"><button class="btn ghost" data-close>${esc(t('close'))}</button><button class="btn primary" id="cn-add">${esc(t('add'))}</button></div>`,
  sh => {
    $$('.pick-list button', sh).forEach(b => b.onclick = () => { S.goals[b.dataset.k].on = true; save('goals'); b.remove(); render(); openAddMicros(); });
    $('#cn-add', sh).onclick = () => {
      const name = $('#cn-name', sh).value.trim(); const d = parseAmount($('#cn-d', sh).value);
      if (!name || isNaN(d) || d <= 0) { (name ? $('#cn-d', sh) : $('#cn-name', sh)).focus(); return; }
      const key = 'c_' + uid();
      S.customNutrients.push({ key, name, u: $('#cn-u', sh).value });
      S.goals[key] = { daily: d, on: true, custom: true };
      save('customNutrients', 'goals'); closeSheet(); render();
    };
  });
}

/* ================= Supplements ================= */
function renderSupps(view) {
  view.innerHTML = `
    <div class="page">
      <header class="page-h"><div><h1>${esc(t('suppsTitle'))}</h1><p>${esc(t('suppsSub'))}</p></div>
        <button class="btn primary sm" id="su-add">${IC.plus}<span>${esc(t('addSupp'))}</span></button></header>
      <div class="supp-list">${S.supplements.length ? S.supplements.map(s => `
        <div class="supp card-surface ${s.active === false ? 'paused' : ''}" data-id="${s.id}">
          <div class="supp-h"><span class="supp-icon">${IC.pill}</span><div class="supp-t"><b>${esc(s.name)}</b><small>${esc(t('daysPerWeek'))}: ${s.days}</small></div>
            <input type="checkbox" class="switch" data-tog="${s.id}" ${s.active !== false ? 'checked' : ''} aria-label="${esc(t('active'))}"></div>
          <div class="supp-n">${Object.keys(s.n || {}).map(k => `<span class="chip">${esc(nutName(k))} <b>${fmt(s.n[k])} ${esc(nutUnit(k))}</b></span>`).join('')}</div>
        </div>`).join('') : `<p class="empty">${esc(t('noSupps'))}</p>`}</div>
    </div>`;
  $('#su-add').onclick = () => openSuppEditor(null);
  $$('.supp').forEach(el => el.onclick = e => { if (e.target.closest('.switch')) return; openSuppEditor(S.supplements.find(s => s.id === el.dataset.id)); });
  $$('[data-tog]').forEach(c => c.onchange = () => { const s = S.supplements.find(x => x.id === c.dataset.tog); s.active = c.checked; save('supplements'); c.closest('.supp').classList.toggle('paused', !c.checked); });
}
function openSuppEditor(supp) {
  const s = supp ? clone(supp) : { id: uid(), name: '', days: 7, active: true, n: {} };
  const rows = Object.keys(s.n).map(k => ({ k, v: s.n[k] }));
  if (!rows.length) rows.push({ k: 'vitD', v: '' });
  const nl = nutList();
  const rowHTML = (row, i) => `<div class="sn-row" data-i="${i}">
      <select>${nl.map(n => `<option value="${n.key}" ${n.key === row.k ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select>
      <input inputmode="decimal" value="${row.v !== '' ? esc(String(row.v).replace('.', lang() === 'sv' ? ',' : '.')) : ''}" placeholder="0">
      <em>${esc(nutUnit(row.k))}</em>
      <button class="icon-btn" data-rm="${i}">${IC.x}</button></div>`;
  openSheet(`
    <h2>${esc(supp ? t('editSupp') : t('addSupp'))}</h2>
    <label class="field"><span>${esc(t('suppName'))}</span><input id="sp-name" value="${esc(s.name)}" placeholder="${esc(t('suppNamePh'))}"></label>
    <div class="field"><span>${esc(t('daysPerWeek'))}</span>
      <div class="seg" id="sp-days">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button data-d="${d}" class="${s.days === d ? 'on' : ''}">${d}</button>`).join('')}</div></div>
    <h3 class="sheet-h3">${esc(t('perDose'))}</h3>
    <div id="sp-rows"></div>
    <button class="link-btn" id="sp-addrow">${IC.plus}<span>${esc(t('addNutrient'))}</span></button>
    <div class="sheet-actions">${supp ? `<button class="btn danger" id="sp-del">${esc(t('delete'))}</button>` : `<button class="btn ghost" data-close>${esc(t('cancel'))}</button>`}<button class="btn primary" id="sp-save">${esc(t('save'))}</button></div>`,
  sh => {
    const sync = () => $$('.sn-row', sh).forEach(el => { const i = +el.dataset.i; rows[i].k = $('select', el).value; rows[i].v = $('input', el).value; });
    const draw = () => {
      $('#sp-rows', sh).innerHTML = rows.map(rowHTML).join('');
      $$('.sn-row select', sh).forEach(sel => sel.onchange = () => { sync(); draw(); });
      $$('[data-rm]', sh).forEach(b => b.onclick = () => { sync(); rows.splice(+b.dataset.rm, 1); draw(); });
    };
    draw();
    $('#sp-addrow', sh).onclick = () => { sync(); const used = rows.map(r => r.k); rows.push({ k: (nl.find(n => !used.includes(n.key)) || nl[0]).key, v: '' }); draw(); };
    $$('#sp-days button', sh).forEach(b => b.onclick = () => { s.days = +b.dataset.d; $$('#sp-days button', sh).forEach(x => x.classList.toggle('on', x === b)); });
    $('#sp-save', sh).onclick = () => {
      sync();
      s.name = $('#sp-name', sh).value.trim();
      if (!s.name) { toast(t('suppNameRequired')); $('#sp-name', sh).focus(); return; }
      s.n = {}; rows.forEach(r => { const v = parseAmount(r.v); if (!isNaN(v) && v > 0) s.n[r.k] = (s.n[r.k] || 0) + v; });
      const i = S.supplements.findIndex(x => x.id === s.id);
      if (i >= 0) S.supplements[i] = s; else S.supplements.push(s);
      save('supplements'); closeSheet(); render();
    };
    const del = $('#sp-del', sh); if (del) del.onclick = () => { if (!confirm(t('confirmDeleteSupp', { name: s.name }))) return; S.supplements = S.supplements.filter(x => x.id !== s.id); save('supplements'); closeSheet(); render(); };
  });
}

/* ================= Shopping list ================= */
function addRecipeToShopping(r, factor) {
  (r.groups || []).forEach(g => g.items.forEach(it => {
    if (!it.name) return;
    const vague = UNITS[it.unit] && UNITS[it.unit].t === 'x';
    const amount = !vague && it.amount ? Number(it.amount) * factor : null;
    const ex = S.shopping.find(s => !s.checked && normalize(s.name) === normalize(it.name) && (s.unit || '') === (amount ? it.unit : ''));
    if (ex) { if (amount) ex.amount = (ex.amount || 0) + amount; if (r.title && !(ex.from || []).includes(r.title)) ex.from = (ex.from || []).concat(r.title); }
    else S.shopping.push({ id: uid(), name: it.name, amount, unit: amount ? it.unit : '', checked: false, from: [r.title], rid: r.id });
  }));
  save('shopping');
}
function shopLine(s) { return (s.amount ? fmtAmount(s.amount, s.unit) + ' ' + unitLabel(s.unit, s.amount) + ' ' : '') + s.name; }
function renderShopping(view) {
  const open = S.shopping.filter(s => !s.checked), done = S.shopping.filter(s => s.checked);
  const item = s => `<li class="${s.checked ? 'done' : ''}" data-id="${s.id}"><button class="cb">${IC.check}</button><div><span>${esc(shopLine(s))}</span>${(s.from || []).length ? `<small>${esc(s.from.join(', '))}</small>` : ''}</div><button class="icon-btn" data-rm="${s.id}">${IC.x}</button></li>`;
  view.innerHTML = `
    <div class="page">
      <header class="page-h"><div><h1>${esc(t('shopTitle'))}</h1></div>
        ${S.shopping.length && navigator.share ? `<button class="btn ghost sm" id="sh-share">${IC.share}<span>${esc(t('share'))}</span></button>` : ''}</header>
      <form class="shop-add card-surface" id="sh-form"><input id="sh-in" placeholder="${esc(t('shopAddPh'))}" autocomplete="off" enterkeyhint="done"><button class="btn primary sm" type="submit">${IC.plus}</button></form>
      ${S.shopping.length ? `<ul class="shop">${open.map(item).join('')}</ul>
        ${done.length ? `<ul class="shop">${done.map(item).join('')}</ul>` : ''}
        <div class="row-actions">${done.length ? `<button class="btn ghost sm" id="sh-clear">${esc(t('clearChecked'))}</button>` : ''}<button class="btn ghost sm danger-text" id="sh-all">${esc(t('clearAll'))}</button></div>`
      : `<p class="empty">${esc(t('shopEmpty'))}</p>`}
    </div>`;
  $('#sh-form').onsubmit = e => { e.preventDefault(); const v = $('#sh-in').value.trim(); if (!v) return; S.shopping.unshift({ id: uid(), name: v, amount: null, unit: '', checked: false, from: [] }); save('shopping'); render(); setTimeout(() => $('#sh-in') && $('#sh-in').focus(), 30); };
  $$('.shop li').forEach(li => li.onclick = e => {
    if (e.target.closest('[data-rm]')) return;
    const s = S.shopping.find(x => x.id === li.dataset.id); s.checked = !s.checked; save('shopping'); render();
  });
  $$('[data-rm]').forEach(b => b.onclick = () => { S.shopping = S.shopping.filter(x => x.id !== b.dataset.rm); save('shopping'); render(); });
  const c = $('#sh-clear'); if (c) c.onclick = () => { S.shopping = S.shopping.filter(s => !s.checked); save('shopping'); render(); };
  const a = $('#sh-all'); if (a) a.onclick = () => { if (!confirm(t('confirmClearAll'))) return; S.shopping = []; save('shopping'); render(); };
  const sh = $('#sh-share'); if (sh) sh.onclick = () => navigator.share({ title: t('shopTitle'), text: open.map(s => '• ' + shopLine(s)).join('\n') }).catch(() => {});
}

/* ================= Converter ================= */
const US_UNITS = [
  { id: 'cup', sv: 'cup', en: 'cup', ml: 236.588 },
  { id: 'tbsp', sv: 'tablespoon (tbsp)', en: 'tablespoon (tbsp)', ml: 14.787 },
  { id: 'tsp', sv: 'teaspoon (tsp)', en: 'teaspoon (tsp)', ml: 4.929 },
  { id: 'floz', sv: 'fluid ounce (fl oz)', en: 'fluid ounce (fl oz)', ml: 29.574 },
  { id: 'pint', sv: 'pint', en: 'pint', ml: 473.176 },
  { id: 'quart', sv: 'quart', en: 'quart', ml: 946.353 },
  { id: 'gallon', sv: 'gallon', en: 'gallon', ml: 3785.41 },
  { id: 'oz', sv: 'ounce (oz, vikt)', en: 'ounce (oz, weight)', g: 28.3495 },
  { id: 'lb', sv: 'pound (lb)', en: 'pound (lb)', g: 453.592 },
  { id: 'stick', sv: 'stick smör', en: 'stick of butter', g: 113.4 }
];
const CONV_ING = [
  { id: 'liquid', d: 1.0 }, { id: 'flour', d: .53, sv: 'Vetemjöl', en: 'Flour' }, { id: 'sugar', d: .85, sv: 'Strösocker', en: 'Granulated sugar' },
  { id: 'brown', d: .9, sv: 'Farinsocker (packat)', en: 'Brown sugar (packed)' }, { id: 'powdered', d: .5, sv: 'Florsocker', en: 'Powdered sugar' },
  { id: 'butter', d: .96, sv: 'Smör', en: 'Butter' }, { id: 'oil', d: .92, sv: 'Olja', en: 'Oil' }, { id: 'honey', d: 1.42, sv: 'Honung / sirap', en: 'Honey / syrup' },
  { id: 'rice', d: .85, sv: 'Ris (okokt)', en: 'Rice (uncooked)' }, { id: 'oats', d: .38, sv: 'Havregryn', en: 'Rolled oats' },
  { id: 'cocoa', d: .42, sv: 'Kakao', en: 'Cocoa powder' }, { id: 'cheese', d: .42, sv: 'Riven ost', en: 'Grated cheese' },
  { id: 'nuts', d: .5, sv: 'Hackade nötter', en: 'Chopped nuts' }, { id: 'salt', d: 1.2, sv: 'Salt', en: 'Salt' }, { id: 'yogurt', d: 1.03, sv: 'Yoghurt / gräddfil', en: 'Yogurt / sour cream' }
];
function swedishMeasures(ml) {
  if (ml >= 1000) return fmt(ml / 1000, 2) + ' l';
  const parts = []; let rest = ml;
  const dl = Math.floor(rest / 100 + 1e-6);
  if (dl) { parts.push(dl + ' dl'); rest -= dl * 100; }
  const msk = Math.floor(rest / 15 + 1e-6); if (msk) { parts.push(msk + ' ' + unitLabel('msk')); rest -= msk * 15; }
  const tsk = Math.floor(rest / 5 + 1e-6); if (tsk) { parts.push(tsk + ' ' + unitLabel('tsk')); rest -= tsk * 5; }
  const krm = Math.round(rest); if (krm) parts.push(krm + ' krm');
  return parts.join(' + ') || '0';
}
function renderConverter(view) {
  const st = app.conv || (app.conv = { amt: '1', from: 'cup', ing: 'liquid', f: '350' });
  view.innerHTML = `
    <div class="page">
      <header class="page-h"><div><h1>${esc(t('convTitle'))}</h1><p>${esc(t('convSub'))}</p></div></header>
      <section class="card-surface conv">
        <div class="field-row">
          <label class="field"><span>${esc(t('convAmount'))}</span><input id="cv-amt" inputmode="text" value="${esc(st.amt)}" placeholder="1 1/2"></label>
          <label class="field grow"><span>${esc(t('convFrom'))}</span><select id="cv-from">${US_UNITS.map(u => `<option value="${u.id}" ${st.from === u.id ? 'selected' : ''}>${esc(u[lang()])}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>${esc(t('convIngredient'))}</span><select id="cv-ing">${CONV_ING.map(i => `<option value="${i.id}" ${st.ing === i.id ? 'selected' : ''}>${esc(i.id === 'liquid' ? t('convGeneric') : i[lang()])}</option>`).join('')}</select></label>
        <div class="conv-out" id="cv-out"></div>
        <p class="fine">${esc(t('convNote'))}</p>
      </section>
      <section class="card-surface conv">
        <h2>${esc(t('convOven'))}</h2>
        <div class="field-row"><label class="field"><span>°F</span><input id="cv-f" inputmode="numeric" value="${esc(st.f)}"></label><div class="conv-temp" id="cv-c"></div></div>
      </section>
      <section class="card-surface conv">
        <h2>${esc(t('convTable'))}</h2>
        <table class="conv-table"><tbody>
          ${[['1 cup', '2,4 dl'], ['¾ cup', '1,8 dl'], ['½ cup', '1,2 dl'], ['⅓ cup', '0,8 dl'], ['¼ cup', '0,6 dl'], ['1 tbsp', '1 ' + unitLabel('msk')], ['1 tsp', '1 ' + unitLabel('tsk')], ['1 fl oz', '30 ml'], ['1 oz', '28 g'], ['1 lb', '454 g'], ['1 stick', '113 g'], ['350 °F', '175 °C'], ['400 °F', '200 °C']].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}
        </tbody></table>
      </section>
    </div>`;
  const calc = () => {
    st.amt = $('#cv-amt').value; st.from = $('#cv-from').value; st.ing = $('#cv-ing').value;
    const a = parseAmount(st.amt); const u = US_UNITS.find(x => x.id === st.from); const ing = CONV_ING.find(i => i.id === st.ing);
    const out = $('#cv-out');
    if (isNaN(a) || a <= 0) { out.innerHTML = `<p class="muted">${esc(t('convInvalid'))}</p>`; return; }
    let ml = null, g = null;
    if (u.ml) { ml = a * u.ml; g = ml * ing.d; }
    else { g = a * u.g; ml = u.id === 'stick' ? g / .96 : g / ing.d; }
    const showMl = u.ml || (ing.id !== 'liquid' || u.id === 'stick');
    out.innerHTML = `
      ${showMl ? `<div class="res"><small>${esc(t('convSwedish'))}</small><b>${fmt(ml / 100, 2)} dl</b><span>${fmt(ml, 0)} ml · ${esc(swedishMeasures(ml))}</span></div>` : ''}
      <div class="res"><small>${esc(t('convWeight'))}</small><b>${fmt(g, g < 10 ? 1 : 0)} g</b><span>${u.ml && ing.id === 'liquid' ? esc(t('convNeedIngredient')) : (g >= 1000 ? fmt(g / 1000, 2) + ' kg' : '')}</span></div>`;
  };
  const temp = () => {
    st.f = $('#cv-f').value; const f = parseFloat(st.f.replace(',', '.'));
    if (isNaN(f)) { $('#cv-c').innerHTML = ''; return; }
    const c = (f - 32) * 5 / 9; const r5 = Math.round(c / 5) * 5;
    $('#cv-c').innerHTML = `<b>${fmt(r5, 0)} °C</b><small>(${fmt(c, 0)} °C)</small><span>${esc(t('convFan', { n: fmt(r5 - 20, 0) }))}</span>`;
  };
  ['#cv-amt', '#cv-from', '#cv-ing'].forEach(s => $(s).oninput = $(s).onchange = calc);
  $('#cv-f').oninput = temp;
  calc(); temp();
}

/* ================= Profile & settings ================= */
function renderProfile(view) {
  const st = S.settings;
  view.innerHTML = `
    <div class="pf">
      <div class="ed-top">
        <button class="txt-btn icon" id="pf-back" aria-label="${esc(t('back'))}">${IC.back}</button>
        <div class="ed-title">${esc(t('settings'))}</div><span class="txt-btn"></span>
      </div>
      <div class="pf-body">
        <div class="pf-id">
          <div class="avatar">${esc((st.name || 'A').charAt(0).toUpperCase())}</div>
          <div><b>${esc(st.name || 'Alfredo')}</b><small>${esc(t('recipesCount', { n: S.recipes.length }))}</small></div>
        </div>

        <section class="set-sec"><h2>${esc(t('profile'))}</h2>
          <label class="field"><span>${esc(t('yourName'))}</span><input id="pf-name" value="${esc(st.name)}" placeholder="Alfredo" autocomplete="off"></label>
          <div class="field-row">
            <div class="field"><span>${esc(t('sex'))}</span><div class="seg" id="pf-sex"><button data-v="m" class="${st.sex !== 'f' ? 'on' : ''}">${esc(t('male'))}</button><button data-v="f" class="${st.sex === 'f' ? 'on' : ''}">${esc(t('female'))}</button></div></div>
            <label class="field"><span>${esc(t('age'))}</span><input id="pf-age" inputmode="numeric" value="${esc(st.age)}"></label>
          </div>
          <small class="help">${esc(t('profileHelp'))}</small>
        </section>

        <section class="set-sec"><h2>${esc(t('language'))}</h2>
          <div class="seg" id="pf-lang"><button data-v="sv" class="${lang() === 'sv' ? 'on' : ''}">Svenska</button><button data-v="en" class="${lang() === 'en' ? 'on' : ''}">English</button></div>
        </section>

        <section class="set-sec"><h2>${esc(t('appearance'))}</h2>
          <div class="sub-h">${esc(t('themes'))}</div>
          <div class="themes">${PRESETS.map(p => `<button class="theme ${st.theme.preset === p.id ? 'on' : ''}" data-p="${p.id}"><span class="sw" style="background:${p.bg}"><i style="background:${p.accent}"></i></span><em>${esc(p[lang()])}</em></button>`).join('')}</div>
          <div class="sub-h">${esc(t('customColors'))}</div>
          <div class="colors">
            <label><input type="color" id="pf-bg" value="${st.theme.bg}"><span>${esc(t('background'))}</span></label>
            <label><input type="color" id="pf-ac" value="${st.theme.accent}"><span>${esc(t('accent'))}</span></label>
          </div>
          <label class="switch-row"><span><b>${esc(t('cardSuits'))}</b></span><input type="checkbox" class="switch" id="pf-suits" ${st.suits ? 'checked' : ''}></label>
        </section>

        <section class="set-sec"><h2>${esc(t('cooking'))}</h2>
          <label class="switch-row"><span><b>${esc(t('keepAwake'))}</b><small>${esc(t('keepAwakeHelp'))}</small></span><input type="checkbox" class="switch" id="pf-wake" ${st.wakeLock ? 'checked' : ''}></label>
          <div class="switch-row"><span><b>${esc(t('defaultServings'))}</b></span><div class="stepper"><button id="pf-sv-m">−</button><span id="pf-sv">${st.defaultServings}</span><button id="pf-sv-p">+</button></div></div>
        </section>

        <section class="set-sec"><h2>${esc(t('myFoods'))}</h2>
          <small class="help">${esc(t('myFoodsHelp'))}</small>
          <div class="pick-list" id="pf-foods">${S.customFoods.length ? S.customFoods.map(f => `<button data-f="${f.id}"><span>${esc(f.sv)}</span><small>${esc(FOOD_CATS[f.cat] ? FOOD_CATS[f.cat][lang()] : '')}</small>${IC.edit}</button>`).join('') : `<p class="empty">${esc(t('noMyFoods'))}</p>`}</div>
          <button class="btn ghost wide" id="pf-newfood">${IC.plus}<span>${esc(t('newFood'))}</span></button>
        </section>

        <section class="set-sec"><h2>${esc(t('data'))}</h2>
          <small class="help">${esc(t('exportHelp'))}</small>
          <p class="fine" id="pf-persist"></p>
          <div class="btn-col">
            <button class="btn primary wide" id="pf-export">${IC.share}<span>${esc(t('exportData'))}</span></button>
            <button class="btn ghost wide" id="pf-import">${esc(t('importData'))}</button>
            <input type="file" id="pf-file" accept="application/json,.json" hidden>
            ${S.recipes.some(r => r.demo) ? `<button class="btn ghost wide" id="pf-rmdemo">${esc(t('removeSamples'))}</button>` : ''}
            <button class="btn danger wide" id="pf-wipe">${IC.trash}<span>${esc(t('deleteAll'))}</span></button>
          </div>
        </section>

        <section class="set-sec"><h2>${esc(t('about'))}</h2>
          <p class="muted">${esc(t('aboutText'))}</p><p class="fine">${esc(t('version'))} ${APP_VERSION} · ${FOOD_DB.length} ${lang() === 'sv' ? 'råvaror i databasen' : 'foods in the database'}</p>
        </section>
      </div>
    </div>`;
  $('#pf-back').onclick = () => goBack();
  $('#pf-name').oninput = e => { st.name = e.target.value; save('settings'); };
  const goalsChanged = () => { ensureGoals(); save('settings', 'goals'); };
  $$('#pf-sex button').forEach(b => b.onclick = () => { st.sex = b.dataset.v; $$('#pf-sex button').forEach(x => x.classList.toggle('on', x === b)); goalsChanged(); toast(t('goalsUpdated')); });
  $('#pf-age').onchange = e => { const v = parseInt(e.target.value, 10); if (v >= 18 && v < 120) { st.age = v; goalsChanged(); toast(t('goalsUpdated')); } else e.target.value = st.age; };
  $$('#pf-lang button').forEach(b => b.onclick = () => { st.lang = b.dataset.v; save('settings'); renderChrome(); render(); });
  $$('.theme').forEach(b => b.onclick = () => { const p = PRESETS.find(x => x.id === b.dataset.p); st.theme = { preset: p.id, bg: p.bg, accent: p.accent }; save('settings'); applyTheme(); render(); });
  $('#pf-bg').oninput = e => { st.theme.bg = e.target.value; st.theme.preset = 'custom'; applyTheme(); };
  $('#pf-ac').oninput = e => { st.theme.accent = e.target.value; st.theme.preset = 'custom'; applyTheme(); };
  $('#pf-bg').onchange = $('#pf-ac').onchange = () => { save('settings'); $$('.theme').forEach(x => x.classList.remove('on')); };
  $('#pf-suits').onchange = e => { st.suits = e.target.checked; save('settings'); };
  $('#pf-wake').onchange = e => { st.wakeLock = e.target.checked; save('settings'); };
  $('#pf-sv-m').onclick = () => { if (st.defaultServings > 1) { st.defaultServings--; $('#pf-sv').textContent = st.defaultServings; save('settings'); } };
  $('#pf-sv-p').onclick = () => { if (st.defaultServings < 20) { st.defaultServings++; $('#pf-sv').textContent = st.defaultServings; save('settings'); } };
  $$('#pf-foods [data-f]').forEach(b => b.onclick = () => openFoodEditor(S.customFoods.find(f => f.id === b.dataset.f), null, () => render()));
  $('#pf-newfood').onclick = () => openFoodEditor(null, '', () => render());
  $('#pf-export').onclick = exportData;
  $('#pf-import').onclick = () => $('#pf-file').click();
  $('#pf-file').onchange = e => importData(e.target.files[0]);
  const rd = $('#pf-rmdemo'); if (rd) rd.onclick = () => { const ids = S.recipes.filter(r => r.demo).map(r => r.id); S.recipes = S.recipes.filter(r => !r.demo); S.log = S.log.filter(l => !ids.includes(l.rid)); save('recipes', 'log'); toast(t('samplesRemoved')); render(); };
  $('#pf-wipe').onclick = async () => {
    if (!confirm(t('confirmDeleteAll')) || !confirm(t('confirmDeleteAll2'))) return;
    await Store.clear(); location.hash = '#/home'; location.reload();
  };
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p => { const el = $('#pf-persist'); if (el) el.textContent = p ? t('storagePersisted') : t('storageNotPersisted'); }).catch(() => {});
}

async function exportData() {
  const data = {}; KEYS.forEach(k => data[k] = S[k]);
  const json = JSON.stringify({ app: 'ristorante-alfredo', v: 1, exported: new Date().toISOString(), data });
  const name = 'ristorante-alfredo-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function importData(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const obj = JSON.parse(rd.result);
      if (!obj || obj.app !== 'ristorante-alfredo' || !obj.data) throw new Error('bad');
      if (!confirm(t('importConfirm'))) return;
      KEYS.forEach(k => { if (obj.data[k] !== undefined) S[k] = obj.data[k]; });
      S.settings = Object.assign({}, DEFAULT_SETTINGS, S.settings || {});
      S.settings.theme = Object.assign({}, DEFAULT_SETTINGS.theme, S.settings.theme || {});
      ['recipes', 'customFoods', 'log', 'supplements', 'customNutrients', 'shopping'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
      S.goals = S.goals || {}; S.skipped = S.skipped || { day: '', ids: [] };
      ensureGoals();
      save(...KEYS);
      applyTheme(); renderChrome(); toast(t('importDone')); go('home');
    } catch (e) { toast(t('importFailed')); }
  };
  rd.readAsText(file);
}

/* ================= Sample recipes ================= */
function loadSamples() {
  const en = lang() === 'en';
  const I = (foodId, amount, unit, name) => ({ id: uid(), foodId, amount, unit, name: name || foodName(foodById(foodId)) });
  const G = (name, items) => ({ id: uid(), name, items });
  const st = arr => arr.map(text => ({ id: uid(), text }));
  const tg = (sv, enT) => en ? enT : sv;
  const now = Date.now();
  const list = [
    { title: 'Spaghetti carbonara', tags: [tg('Italiensk', 'Italian'), 'Pasta'], servings: 4, time: 25,
      groups: [G('', [I('pasta', 400, 'g', 'Spaghetti'), I('bacon', 150, 'g', en ? 'Guanciale or bacon' : 'Guanciale eller bacon'), I('eggyolk', 4, 'st'), I('egg', 1, 'st'), I('parmesan', 80, 'g', 'Pecorino / parmesan'), I('pepper', 0, 'nypa'), I('salt', 0, 'smak')])],
      steps: st(en ? ['Boil the pasta in well-salted water.', 'Fry the guanciale until crisp, take the pan off the heat.', 'Whisk yolks, egg, grated cheese and plenty of black pepper.', 'Toss the pasta with the pork, then the egg mixture and a splash of pasta water until creamy.'] : ['Koka pastan i rikligt saltat vatten.', 'Stek guancialen krispig och dra pannan från värmen.', 'Vispa ihop äggulor, ägg, riven ost och rikligt med svartpeppar.', 'Vänd pastan med fläsket, sedan äggblandningen och en skvätt pastavatten tills det blir krämigt.']) },
    { title: en ? 'Baked salmon with dill potatoes' : 'Ugnsbakad lax med dillpotatis', tags: [tg('Svensk', 'Swedish'), tg('Fisk & skaldjur', 'Seafood')], servings: 4, time: 35,
      groups: [G(en ? 'Salmon' : 'Lax', [I('salmon', 4, 'bit'), I('lemon', 1, 'st'), I('oliveoil', 0, 'skvatt'), I('seasalt', 0, 'nypa')]), G(en ? 'Potatoes' : 'Potatis', [I('potato', 800, 'g'), I('dill', 1, 'nave'), I('butter', 1, 'klick')]), G(en ? 'Sauce' : 'Sås', [I('sourcream', 2, 'dl'), I('dill', .5, 'nave'), I('lemonjuice', 1, 'msk'), I('salt', 0, 'nypa')])],
      steps: st(en ? ['Boil the potatoes. Heat the oven to 200 °C.', 'Place the salmon in a dish, drizzle with oil, add salt and lemon slices.', 'Bake for about 15 minutes.', 'Stir sour cream with chopped dill, lemon juice and salt.', 'Toss the potatoes with butter and dill.'] : ['Koka potatisen. Sätt ugnen på 200 °C.', 'Lägg laxen i en form, ringla över olja, salta och lägg på citronskivor.', 'Baka i ugnen ca 15 minuter.', 'Rör ihop gräddfil med hackad dill, citronsaft och salt.', 'Vänd potatisen med smör och dill.']) },
    { title: en ? 'Chicken curry with rice' : 'Kycklingcurry med ris', tags: [tg('Asiatisk', 'Asian'), tg('Indisk', 'Indian'), tg('Kyckling', 'Chicken')], servings: 4, time: 40,
      groups: [G('Curry', [I('chickenthigh', 600, 'g'), I('onion', 1, 'st'), I('garlic', 3, 'klyfta'), I('ginger', 1, 'bit'), I('curry', 2, 'msk'), I('coconutmilk', 1, 'burk'), I('cannedtomato', 1, 'burk'), I('spinach', 2, 'nave'), I('rapeseedoil', 0, 'skvatt')]), G(en ? 'Rice' : 'Ris', [I('rice', 3, 'dl', en ? 'Basmati rice' : 'Basmatiris')]), G('Topping', [I('coriander', 0, 'smak')])],
      steps: st(en ? ['Fry onion, garlic and ginger in oil.', 'Add the curry powder and the chicken in pieces, brown them.', 'Pour in coconut milk and tomatoes, simmer for 20 minutes.', 'Cook the rice meanwhile.', 'Stir in the spinach at the end and top with coriander.'] : ['Fräs lök, vitlök och ingefära i olja.', 'Tillsätt currypulver och kycklingen i bitar, bryn.', 'Häll i kokosmjölk och tomater, låt sjuda 20 minuter.', 'Koka riset under tiden.', 'Rör ner spenaten på slutet och toppa med koriander.']) },
    { title: 'Pasta al pomodoro', tags: [tg('Italiensk', 'Italian'), tg('Vegetarisk', 'Vegetarian'), 'Pasta'], servings: 4, time: 20,
      groups: [G('', [I('pasta', 400, 'g', 'Penne'), I('cherrytomato', 400, 'g'), I('garlic', 2, 'klyfta'), I('oliveoil', 0, 'skvatt'), I('basil', 1, 'nave'), I('parmesan', 40, 'g'), I('salt', 0, 'smak')])],
      steps: st(en ? ['Boil the pasta.', 'Fry the garlic in olive oil, add the halved tomatoes and cook until soft.', 'Toss with the pasta and basil, top with parmesan.'] : ['Koka pastan.', 'Fräs vitlöken i olivolja, tillsätt halverade tomater och låt dem bli mjuka.', 'Vänd ner pastan och basilikan, toppa med parmesan.']) },
    { title: en ? 'Tofu & broccoli stir-fry' : 'Wok med tofu och broccoli', tags: [tg('Asiatisk', 'Asian'), tg('Vegetarisk', 'Vegetarian'), tg('Snabbt', 'Quick')], servings: 3, time: 20,
      groups: [G('Wok', [I('tofu', 1, 'forp'), I('broccoli', 1, 'st'), I('bellpepper', 1, 'st'), I('garlic', 2, 'klyfta'), I('ginger', 1, 'bit'), I('ricenoodles', 250, 'g')]), G(en ? 'Sauce' : 'Sås', [I('soy', 3, 'msk'), I('sesameoil', 1, 'msk'), I('honey', 1, 'tsk'), I('lime', 1, 'st')]), G('Topping', [I('sesame', 1, 'msk'), I('springonion', 2, 'st')])],
      steps: st(en ? ['Press and cube the tofu, fry until golden.', 'Soak the noodles.', 'Stir-fry broccoli, pepper, garlic and ginger on high heat.', 'Add the sauce, tofu and noodles, toss.', 'Top with sesame seeds and spring onion.'] : ['Pressa och tärna tofun, stek gyllene.', 'Blötlägg nudlarna.', 'Woka broccoli, paprika, vitlök och ingefära på hög värme.', 'Tillsätt såsen, tofun och nudlarna, vänd runt.', 'Toppa med sesamfrön och salladslök.']) },
    { title: en ? 'Red lentil soup' : 'Röd linssoppa', tags: [tg('Vegetarisk', 'Vegetarian'), tg('Soppa', 'Soup')], servings: 4, time: 35,
      groups: [G(en ? 'Soup' : 'Soppa', [I('redlentils', 3, 'dl'), I('onion', 1, 'st'), I('carrot', 2, 'st'), I('garlic', 2, 'klyfta'), I('cumin', 1, 'tsk'), I('cannedtomato', 1, 'burk'), I('stock', 1, 'st'), I('water', 1, 'l'), I('lemonjuice', 1, 'msk')]), G('Topping', [I('yoghurt', 1, 'dl', en ? 'Greek yoghurt' : 'Turkisk yoghurt'), I('parsley', 1, 'nave')])],
      steps: st(en ? ['Fry onion, carrot and garlic until soft.', 'Add cumin, lentils, tomatoes, water and stock.', 'Simmer for 20 minutes, then blend.', 'Season with lemon juice, serve with yoghurt and parsley.'] : ['Fräs lök, morot och vitlök mjukt.', 'Tillsätt spiskummin, linser, tomater, vatten och buljong.', 'Låt sjuda 20 minuter och mixa slät.', 'Smaka av med citron och servera med yoghurt och persilja.']) },
    { title: en ? 'Smash burgers with fries' : 'Smashburgare med pommes', tags: [tg('Kött', 'Meat')], servings: 4, time: 45,
      groups: [G(en ? 'Burgers' : 'Burgare', [I('beefmince', 500, 'g'), I('bread', 4, 'st', en ? 'Burger buns' : 'Hamburgerbröd'), I('cheddar', 4, 'skiva'), I('lettuce', 1, 'nave'), I('tomato', 1, 'st')]), G(en ? 'Fries' : 'Pommes', [I('potato', 800, 'g'), I('rapeseedoil', 2, 'msk'), I('seasalt', 0, 'nypa')]), G(en ? 'Sauce' : 'Sås', [I('mayo', 1, 'dl'), I('mustard', 1, 'tsk'), I('garlic', 1, 'klyfta')])],
      steps: st(en ? ['Cut the potatoes into fries, toss with oil and bake at 225 °C for about 30 minutes.', 'Stir mayonnaise, mustard and grated garlic.', 'Roll the mince into balls, smash them thin in a very hot pan.', 'Flip, add cheese and let it melt.', 'Build the burgers with sauce, lettuce and tomato.'] : ['Skär potatisen i stavar, vänd med olja och baka i 225 °C ca 30 minuter.', 'Rör ihop majonnäs, senap och riven vitlök.', 'Rulla färsen till bollar och tryck ut dem tunt i en mycket het panna.', 'Vänd, lägg på ost och låt smälta.', 'Bygg burgarna med sås, sallad och tomat.']) }
  ];
  list.forEach((r, i) => S.recipes.push(Object.assign({ id: uid(), image: '', fav: i === 1, notes: '', rating: 0, createdAt: now - i * 1000, demo: true }, r)));
  save('recipes');
}

/* ================= Boot ================= */
async function boot() {
  await loadAll();
  applyTheme();
  renderChrome();
  app.navCount = 0;
  window.addEventListener('hashchange', () => { app.navCount++; render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || app.route === 'edit') return; reloaded = true; location.reload(); });
  }
}
document.addEventListener('DOMContentLoaded', boot);
