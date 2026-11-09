import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, min = 2) => `${n < 0 ? '-' : ''}${CONFIG.CURRENCY}${Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: 2 })}`;
const fdate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '') : '';
const ldate = (iso, sep = ' ') => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ /g, sep) : '';
const SECTIONS = { arrival: 'Arrival Transfers', departure: 'Departure Transfers', colombo: 'Traveling' };
// internal key 'colombo' kept so older saved documents still open; it is shown as "Traveling".
const KINDS = { airport: 'Airport pick-ups & drops', colombo: 'Traveling', both: 'Airport pick-ups & drops and Traveling' };
const KIND_SECTIONS = { airport: ['arrival', 'departure'], colombo: ['colombo'], both: ['arrival', 'departure', 'colombo'] };
const VEHICLES = ['Car (Prius/Axio)', 'Van 9 Seater', 'Van 14 Seater', 'Bus 37 Seater Luxury Coach', 'Bus 45 Seater Coach'];
const kindOf = (d) => {
  if (d.data?.kind) return d.data.kind;
  const s = new Set((d.items || []).map((i) => i.section === 'colombo' ? 'c' : 'a'));
  return s.has('c') && s.has('a') ? 'both' : s.has('c') ? 'colombo' : 'airport';
};
const vehicleSelect = (attrs, cur) => `<select ${attrs}><option value="">Select…</option>${(VEHICLES.includes(cur) || !cur ? VEHICLES : [cur, ...VEHICLES]).map((o) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
const newItem = (section = 'arrival') => ({ section, flight: '', airline: '', activity: '', comments: '', pickup: '', dropoff: '', date: '', time: '', guests: 1, vehicle: '', rate: 0 });
const today = () => new Date().toLocaleDateString('en-CA');
const DMIN = '2020-01-01', DMAX = '2099-12-31', MAXAMT = 999999999.99;
// "1234567.5" -> "1,234,567.5": digits and one dot only, max 2 decimals
const fmtNum = (s) => {
  const [i, ...rest] = String(s ?? '').replace(/[^\d.]/g, '').split('.');
  const int = i.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
};
const parseNum = (s) => +String(s ?? '').replace(/,/g, '') || 0;
// reformat a money input as the user types, keeping the caret next to the same digit
const liveMoney = (el) => {
  const digits = el.value.slice(0, el.selectionStart).replace(/[^\d.]/g, '').length;
  el.value = fmtNum(el.value);
  let p = 0, n = 0;
  while (p < el.value.length && n < digits) { if (/[\d.]/.test(el.value[p])) n++; p++; }
  el.setSelectionRange(p, p);
};
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const LABEL = { invoice: 'Invoice', quotation: 'Quotation', agreement: 'Service Agreement' };
const PREFIX = { invoice: 'INV', quotation: 'QUO', agreement: 'AGR' };
const STATUS = { invoice: ['draft', 'sent', 'paid', 'cancelled'], quotation: ['draft', 'sent', 'accepted', 'rejected'], agreement: ['draft', 'signed', 'cancelled'] };

const configured = CONFIG.SUPABASE_URL.startsWith('https://');
const sb = configured ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
const q = async (p) => { const { data, error } = await p; if (error) throw error; return data; };

/* ---------- auth ---------- */
function show(app) { $('#login').hidden = app; $('#app').hidden = !app; }
async function boot() {
  if (!configured) { show(false); $('#loginErr').textContent = 'Setup needed: add your Supabase URL and anon key in config.js (see README).'; return; }
  const { data: { session } } = await sb.auth.getSession();
  show(!!session);
  if (session) route();
  // The auth library re-fires SIGNED_IN every time the tab regains focus. Only react to a real sign-in
  // (app still hidden), otherwise the page re-renders and wipes whatever is typed in a form.
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && $('#app').hidden) { show(true); route(); } if (ev === 'SIGNED_OUT') show(false); });
}
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  if (!configured) return;
  const { error } = await sb.auth.signInWithPassword({ email: $('#email').value, password: $('#password').value });
  $('#loginErr').textContent = error ? 'Sign in failed: check your email and password.' : '';
};
$('#logout').onclick = () => sb.auth.signOut();

/* ---------- router ---------- */
let S = { name: 'Shammi Travels', address: '', phone: '', email: '', signatory: '', bank: '' };
let settingsLoaded = false;
async function loadSettings() {
  if (settingsLoaded) return;
  const row = await q(sb.from('settings').select('*').eq('id', 1).maybeSingle());
  if (row) S = { ...S, ...row };
  settingsLoaded = true;
}

async function route() {
  if (!sb) return;
  const [page = 'dashboard', a, b, c, e5] = location.hash.replace(/^#\//, '').split('/');
  document.querySelectorAll('nav a').forEach((l) => l.classList.toggle('on', l.getAttribute('href') === `#/${page === 'customer' ? 'customers' : page}${page === 'list' ? '/' + a : ''}`));
  const v = $('#view');
  v.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await loadSettings();
    const fn = { dashboard, customers, customer, list, edit, view, settings, profit }[page] || dashboard;
    await fn(v, a, b, c, e5);
  } catch (e) { v.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', route);

/* ---------- dashboard ---------- */
async function dashboard(v) {
  const docs = await q(sb.from('documents').select('id,type,number,status,total,issue_date,customer_id,customers(name)').order('created_at', { ascending: false }));
  const inv = docs.filter((d) => d.type === 'invoice');
  const quo = docs.filter((d) => d.type === 'quotation');
  const sum = (a) => a.reduce((s, d) => s + Number(d.total), 0);
  const paid = inv.filter((d) => d.status === 'paid');
  const owed = inv.filter((d) => d.status === 'sent' || d.status === 'draft');
  const open = quo.filter((d) => d.status === 'sent' || d.status === 'draft');
  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return ym(d); });
  const rev = months.map((m) => sum(paid.filter((d) => d.issue_date.startsWith(m))));
  const max = Math.max(...rev, 1);
  v.innerHTML = `
    <h2>Dashboard</h2>
    <div class="grid">
      <div class="card stat"><span class="muted">Paid</span><b>${money(sum(paid))}</b>${paid.length} invoices</div>
      <div class="card stat"><span class="muted">Outstanding</span><b>${money(sum(owed))}</b>${owed.length} invoices</div>
      <div class="card stat"><span class="muted">Open quotations</span><b>${money(sum(open))}</b>${open.length} quotations</div>
      <div class="card stat"><span class="muted">Agreements</span><b>${docs.filter((d) => d.type === 'agreement').length}</b>on file</div>
    </div>
    <div class="card"><h3>Paid revenue, last 6 months</h3>
      <div class="bars">${rev.map((r, i) => `<div class="bar" title="${money(r)}"><i style="height:${(r / max) * 100}%"></i>${months[i].slice(2)}</div>`).join('')}</div></div>
    <div class="card"><div class="row"><h3>Create</h3><span>
      <a href="#/edit/invoice"><button class="primary">New invoice</button></a>
      <a href="#/edit/quotation"><button>New quotation</button></a>
      <a href="#/edit/agreement"><button>New agreement</button></a></span></div>
      <h3>Recent</h3>${table(docs.slice(0, 8))}</div>`;
}

/* ---------- lists ---------- */
const table = (rows, hideCust = false) => rows.length ? `<div class="tablewrap"><table><thead><tr><th>No.</th>${hideCust ? '' : '<th>Customer</th>'}<th>Date</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>${rows.map((d) =>
  `<tr><td><a href="#/view/${d.id}">${esc(d.number)}</a></td>${hideCust ? '' : `<td><a href="#/customer/${d.customer_id}">${esc(d.customers?.name)}</a></td>`}<td>${esc(d.issue_date)}</td><td class="num">${d.total > 0 ? money(d.total) : '-'}</td><td>${esc(d.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing here yet.</p>';

async function list(v, type = 'invoice') {
  const rows = await q(sb.from('documents').select('id,number,status,total,issue_date,customer_id,customers(name)').eq('type', type).order('created_at', { ascending: false }));
  v.innerHTML = `<div class="row"><h2>${LABEL[type]}s</h2><a href="#/edit/${type}"><button class="primary">New ${LABEL[type].toLowerCase()}</button></a></div><div class="card">${table(rows)}</div>`;
}

/* ---------- settings ---------- */
async function settings(v) {
  const f = (k, label, attrs = 'maxlength="200"') => `<label>${label}<input name="${k}" value="${esc(S[k])}" ${attrs}></label>`;
  v.innerHTML = `<h2>Settings</h2><form id="sf" class="card">
    <p class="muted">Printed on invoices, quotations and agreements. Stored in your database, behind login.</p>
    <div class="grid">${f('name', 'Business name')}${f('address', 'Address')}${f('phone', 'Phone', 'type="tel" pattern="[0-9+ ]{7,20}" maxlength="20" title="7 to 20 characters: digits, + and spaces"')}${f('email', 'Email', 'type="email" maxlength="120"')}${f('signatory', 'Authorized signatory (agreements)')}</div>
    <label>Bank details (one line each, e.g. “Bank: …”, “Account Number: …”)<textarea name="bank" rows="7" maxlength="1000">${esc(S.bank)}</textarea></label>
    <button class="primary">Save settings</button> <span id="ok" class="muted" role="status"></span></form>`;
  $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const row = Object.fromEntries([...new FormData(e.target)].map(([k, x]) => [k, String(x).trim()]));
      await q(sb.from('settings').upsert({ id: 1, ...row }));
      S = { ...S, ...row };
      $('#ok').textContent = 'Saved.';
    } catch (err) { alert(err.message); }
  };
}

/* ---------- cost vs profit (per quotation line; cost is stored on the line as `cost`) ---------- */
const itemCost = (i) => (i.cost === undefined || i.cost === null || i.cost === '') ? null : +i.cost;
const pct = (n) => n === null ? '—' : `${n.toFixed(1)}%`;
const profitOf = (items) => {
  const costed = items.filter((i) => itemCost(i) !== null);
  const cost = costed.reduce((s, i) => s + itemCost(i), 0);
  const rev = costed.reduce((s, i) => s + (+i.rate || 0), 0); // revenue of the lines that have a cost
  return { n: costed.length, total: items.length, cost, rev, profit: rev - cost, margin: rev ? (rev - cost) / rev * 100 : null };
};

async function profit(v, id) {
  if (id) return profitDetail(v, id);
  const rows = await q(sb.from('documents').select('id,number,status,total,issue_date,customer_id,items,customers(name)').eq('type', 'quotation').order('created_at', { ascending: false }));
  const calc = rows.map((d) => ({ d, p: profitOf(d.items) }));
  const live = calc.filter((x) => x.p.n > 0 && x.d.status !== 'rejected');
  const T = live.reduce((a, x) => ({ cost: a.cost + x.p.cost, rev: a.rev + x.p.rev }), { cost: 0, rev: 0 });
  const prof = T.rev - T.cost;
  v.innerHTML = `<h2>Cost vs Profit</h2>
    <div class="grid">
      <div class="card stat"><span class="muted">Revenue</span><b>${money(T.rev)}</b>lines with a cost</div>
      <div class="card stat"><span class="muted">Cost</span><b>${money(T.cost)}</b>${live.length} quotations</div>
      <div class="card stat"><span class="muted">Profit</span><b class="${prof < 0 ? 'neg' : ''}">${money(prof)}</b></div>
      <div class="card stat"><span class="muted">Margin</span><b>${pct(T.rev ? prof / T.rev * 100 : null)}</b></div>
    </div>
    <div class="card"><p class="muted">Open a quotation to enter what each line costs you. Profit = quotation rate − cost.</p>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Quotation</th><th>Customer</th><th>Status</th><th class="num">Revenue</th><th class="num">Cost</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead><tbody>${calc.map(({ d, p }) =>
      `<tr><td><a href="#/profit/${d.id}">${esc(d.number)}</a></td><td>${esc(d.customers?.name)}</td><td>${esc(d.status)}</td><td class="num">${money(d.total)}</td>
       <td class="num">${p.n ? money(p.cost) : '—'}${p.n && p.n < p.total ? `<br><span class="muted">${p.n}/${p.total} lines</span>` : ''}</td>
       <td class="num ${p.profit < 0 ? 'neg' : ''}">${p.n ? money(p.profit) : '—'}</td><td class="num">${pct(p.margin)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No quotations yet.</p>'}</div>`;
}

async function profitDetail(v, id) {
  const d = await q(sb.from('documents').select('*, customers(name)').eq('id', id).eq('type', 'quotation').single());
  const items = d.items;
  const cell = (k, t = '') => `<td${t}>${k}</td>`;
  const section = (key) => {
    const idx = items.map((it, i) => i).filter((i) => items[i].section === key);
    if (!idx.length) return '';
    const cm = key === 'colombo';
    const head = cm ? '<th>Date</th><th>Activity</th>' : '<th>Flight</th><th>Airline</th><th>Date</th>';
    const first = (s) => String(s || '').split('\n')[0];
    return `<h3 class="sec2">${SECTIONS[key]}</h3><div class="tablewrap"><table><thead><tr>${head}<th>Guests</th><th>Vehicle</th><th class="num">Rate</th><th class="num">Cost</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead><tbody>${idx.map((i) => {
      const it = items[i], c = itemCost(it);
      const lead = cm ? `${cell(esc(fdate(it.date)))}${cell(esc(first(it.activity || [it.pickup, it.dropoff].filter(Boolean).join(' → '))), ` title="${esc(it.activity)}"`)}` : `${cell(esc(it.flight))}${cell(esc(it.airline))}${cell(esc(fdate(it.date)))}`;
      return `<tr>${lead}${cell(esc(it.guests))}${cell(esc(it.vehicle))}<td class="num">${money(it.rate)}</td>
        <td class="num"><input class="cost" data-cost="${i}" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="15" aria-label="Cost for line ${i + 1}" value="${c === null ? '' : esc(fmtNum(c))}"></td>
        <td class="num" data-p="${i}">—</td><td class="num" data-m="${i}">—</td></tr>`;
    }).join('')}</tbody></table></div>`;
  };
  v.innerHTML = `<div class="row"><h2>Cost vs Profit · ${esc(d.number)}</h2><span><a href="#/view/${d.id}"><button>View quotation</button></a> <a href="#/profit"><button>All quotations</button></a></span></div>
    <p class="muted">${esc(d.customers?.name)} · ${esc(KINDS[kindOf(d)])} · status ${esc(d.status)}</p>
    <div class="grid">
      <div class="card stat"><span class="muted">Revenue</span><b id="sRev"></b></div>
      <div class="card stat"><span class="muted">Cost</span><b id="sCost"></b></div>
      <div class="card stat"><span class="muted">Profit</span><b id="sProfit"></b></div>
      <div class="card stat"><span class="muted">Margin</span><b id="sMargin"></b></div>
    </div>
    <p class="muted" id="sNote"></p>
    <div class="card">${['arrival', 'departure', 'colombo'].map(section).join('')}
      <p id="perr" class="err" role="alert"></p>
      <button class="primary" id="psave">Save costs</button> <span id="pok" class="muted" role="status"></span></div>`;

  const rate = (i) => +items[i].rate || 0;
  const recalc = () => {
    let rev = 0, revC = 0, cost = 0, n = 0;
    items.forEach((_, i) => {
      rev += rate(i);
      const raw = v.querySelector(`[data-cost="${i}"]`).value.trim();
      const pc = v.querySelector(`[data-p="${i}"]`), mc = v.querySelector(`[data-m="${i}"]`);
      if (raw === '') { pc.textContent = mc.textContent = '—'; pc.className = mc.className = 'num'; return; }
      const c = parseNum(raw), p = rate(i) - c;
      n++; cost += c; revC += rate(i);
      pc.textContent = money(p); mc.textContent = pct(rate(i) ? p / rate(i) * 100 : null);
      pc.className = mc.className = 'num' + (p < 0 ? ' neg' : '');
    });
    const prof = revC - cost;
    $('#sRev').textContent = money(rev); $('#sCost').textContent = money(cost);
    $('#sProfit').textContent = money(prof); $('#sProfit').className = prof < 0 ? 'neg' : '';
    $('#sMargin').textContent = pct(revC ? prof / revC * 100 : null);
    $('#sNote').textContent = `Costs entered for ${n} of ${items.length} lines. Profit and margin cover the lines that have a cost.`;
  };
  v.oninput = (e) => { if (e.target.dataset.cost !== undefined) { liveMoney(e.target); recalc(); $('#pok').textContent = ''; } };
  recalc();
  $('#psave').onclick = async () => {
    $('#perr').textContent = ''; $('#pok').textContent = '';
    const next = [];
    for (let i = 0; i < items.length; i++) {
      const el = v.querySelector(`[data-cost="${i}"]`), raw = el.value.trim(), { cost: _drop, ...rest } = items[i];
      if (raw === '') { next.push(rest); continue; }
      const c = parseNum(raw);
      if (c > MAXAMT) { $('#perr').textContent = `Line ${i + 1}: the cost is too large.`; el.focus(); return; }
      next.push({ ...rest, cost: c });
    }
    try { await q(sb.from('documents').update({ items: next }).eq('id', id)); items.splice(0, items.length, ...next); $('#pok').textContent = 'Saved.'; }
    catch (err) { $('#perr').textContent = err.message; }
  };
}

/* ---------- one customer: everything for them ---------- */
async function customer(v, id) {
  const [c, docs] = await Promise.all([
    q(sb.from('customers').select('*').eq('id', id).single()),
    q(sb.from('documents').select('id,type,number,status,total,issue_date,customer_id').eq('customer_id', id).order('issue_date', { ascending: false })),
  ]);
  const by = (t) => docs.filter((d) => d.type === t);
  const sum = (a) => a.reduce((s, d) => s + Number(d.total), 0);
  const inv = by('invoice');
  const paid = inv.filter((d) => d.status === 'paid'), owed = inv.filter((d) => d.status === 'sent' || d.status === 'draft');
  const block = (t, title) => `<div class="card"><div class="row"><h3>${title} (${by(t).length})</h3><a href="#/edit/${t}/-/${id}"><button class="primary">New ${LABEL[t].toLowerCase()}</button></a></div>${table(by(t), true)}</div>`;
  v.innerHTML = `<div class="row"><h2>${esc(c.name)}</h2><a href="#/customers"><button>All customers</button></a></div>
    <div class="card"><span class="muted">${esc([c.phone, c.email, c.address].filter(Boolean).join(' · ')) || 'No contact details'}</span></div>
    <div class="grid"><div class="card stat"><span class="muted">Paid</span><b>${money(sum(paid))}</b></div><div class="card stat"><span class="muted">Outstanding</span><b>${money(sum(owed))}</b></div></div>
    ${block('invoice', 'Invoices')}${block('quotation', 'Quotations')}${block('agreement', 'Agreements')}`;
}

/* ---------- customers ---------- */
async function customers(v) {
  const rows = await q(sb.from('customers').select('*').order('name'));
  v.innerHTML = `<h2>Customers</h2>
    <form id="cf" class="card grid">
      <label>Name <input name="name" required maxlength="120"></label><label>Phone <input name="phone" type="tel" pattern="[0-9+ ]{7,20}" maxlength="20" title="7 to 20 characters: digits, + and spaces"></label>
      <label>Email <input name="email" type="email" maxlength="120"></label><label>Address <input name="address" maxlength="200"></label>
      <p id="cerr" class="err" role="alert" style="grid-column:1/-1"></p>
      <div><button class="primary">Add customer</button></div></form>
    <div class="card tablewrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>${rows.map((c) =>
      `<tr><td><a href="#/customer/${c.id}">${esc(c.name)}</a><br><span class="muted">${esc(c.address)}</span></td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td><button class="danger" data-del="${c.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
  $('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const row = Object.fromEntries([...new FormData(e.target)].map(([k, x]) => [k, String(x).trim().replace(/\s+/g, ' ')]));
    if (!row.name) { $('#cerr').textContent = 'Enter the customer name.'; return; }
    if (rows.some((c) => c.name.toLowerCase() === row.name.toLowerCase())) { $('#cerr').textContent = `A customer named “${row.name}” already exists.`; return; }
    try { await q(sb.from('customers').insert(row)); route(); } catch (err) { alert(err.message); }
  };
  v.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Delete this customer?')) return;
    try { await q(sb.from('customers').delete().eq('id', b.dataset.del)); route(); } catch (err) { alert('Cannot delete: this customer has documents.'); }
  });
}

/* ---------- create / edit ---------- */
// Rates are per vehicle/run, not per passenger (see terms), so no quantity multiplier.
const calc = (items) => ({ total: items.reduce((s, i) => s + (+i.rate || 0), 0) });

async function nextInsert(row) {
  const { count } = await sb.from('documents').select('*', { count: 'exact', head: true }).eq('type', row.type);
  for (let n = (count || 0) + 1, i = 0; i < 20; i++, n++) {
    const number = `${PREFIX[row.type]}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
    const r = await sb.from('documents').insert({ ...row, number }).select('id').single();
    if (!r.error) return r.data.id;
    if (r.error.code !== '23505') throw r.error; // 23505 = number taken, try the next one
  }
  throw new Error('Could not allocate a document number');
}

async function edit(v, type, id, cid, qid) {
  if (id === '-') id = undefined; // '-' = new document (lets the 4th segment carry a customer id)
  const UUID = /^[0-9a-f-]{36}$/;
  const [custs, existing] = await Promise.all([
    q(sb.from('customers').select('id,name').order('name')),
    id ? q(sb.from('documents').select('*').eq('id', id).single()) : null,
  ]);
  // agreements are built from accepted quotations (plus the one already linked / passed in the URL)
  const linkIds = [existing?.data?.quotation_id, qid].filter((x) => x && UUID.test(x));
  const quotes = type === 'agreement' || existing?.type === 'agreement'
    ? await q(sb.from('documents').select('id,number,customer_id,total,items,data,status').eq('type', 'quotation').or(['status.eq.accepted', ...linkIds.map((x) => `id.eq.${x}`)].join(',')))
    : [];
  const d = existing || { type, customer_id: cid, status: 'draft', issue_date: today(), items: [newItem()], tax_rate: 0, data: { terms: CONFIG.DEFAULT_TERMS }, notes: '' };
  type = d.type;
  const f = d.data || {};
  const agr = type === 'agreement';
  const field = (k, label, t = 'text') => `<label>${label}<input name="${k}" type="${t}" ${t === 'date' ? `min="${DMIN}" max="${DMAX}"` : 'maxlength="200"'} value="${esc(t === 'date' ? String(f[k] ?? '').slice(0, 10) : f[k])}"></label>`;
  v.innerHTML = `<h2>${id ? 'Edit' : 'New'} ${LABEL[type].toLowerCase()}${id ? ' ' + esc(d.number) : ''}</h2>
  <form id="ef" class="card">
    ${custs.length ? '' : '<p class="err">Add a customer first (Customers tab).</p>'}
    <div class="grid">
      <label>Customer <select name="customer_id" required><option value="">Select…</option>${custs.map((c) => `<option value="${c.id}" ${c.id === d.customer_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Date <input name="issue_date" type="date" min="${DMIN}" max="${DMAX}" value="${esc(d.issue_date)}" required></label>
      ${agr ? '' : `<label>${LABEL[type]} type <select name="kind">${Object.entries(KINDS).map(([k, n]) => `<option value="${k}" ${k === kindOf(d) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
      ${type === 'agreement' ? '' : `<label>${type === 'invoice' ? 'Due date' : 'Valid until'} <input name="due_date" type="date" min="${DMIN}" max="${DMAX}" value="${esc(d.due_date)}"></label>`}
      <label>Status <select name="status">${STATUS[type].map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    </div>
    ${agr ? `<label>Based on accepted quotation <select name="quotation_id" id="qsel"></select></label>
      <div class="grid">${field('company', 'Client organisation (e.g. Curtin University)')}${field('service', 'Service (e.g. airport transfer, tour)')}<label>Vehicle${vehicleSelect('name="vehicle"', f.vehicle)}</label>${field('pickup', 'Pick-up location')}${field('dropoff', 'Drop-off location')}${field('start', 'Start date', 'date')}${field('end', 'End date', 'date')}
      <label>Agreed total (${CONFIG.CURRENCY})<input name="rate" id="rate" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="15" value="${d.total ? esc(fmtNum(d.total)) : ''}"></label>${field('deposit', 'Deposit')}</div>
      <label>Terms & conditions<textarea name="terms" rows="14" required maxlength="20000">${esc(f.terms)}</textarea></label>
      <button type="button" id="resetTerms">Load standard terms</button>`
    : `<h3>Items</h3><div id="items"></div><button type="button" id="add">+ Add line</button>
      <p id="totals" class="num"></p>`}
    <label>Notes <textarea name="notes" maxlength="1000">${esc(d.notes)}</textarea></label>
    <p id="ferr" class="err" role="alert"></p>
    <button class="primary">Save</button> <a href="#/list/${type}"><button type="button">Cancel</button></a>
  </form>`;

  const items = d.items.length ? d.items : [newItem()];
  let kind = kindOf(d);
  const fit = () => items.forEach((i) => { if (!KIND_SECTIONS[kind].includes(i.section)) i.section = KIND_SECTIONS[kind][0]; });
  fit();
  const totals = () => { if (!agr) $('#totals').innerHTML = `<b>Total ${money(calc(items).total)}</b>`; };
  const paint = () => {
    const inp = (i, k, label, t = 'text', extra = '') => k === 'rate'
      ? `<label>${label}<input data-i="${i}" data-k="rate" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="15" value="${items[i].rate ? esc(fmtNum(items[i].rate)) : ''}"></label>`
      : `<label>${label}<input data-i="${i}" data-k="${k}" type="${t}" ${t === 'date' ? `min="${DMIN}" max="${DMAX}"` : k === 'guests' ? 'min="1" max="500" step="1"' : t === 'text' ? 'maxlength="200"' : ''} value="${esc(items[i][k])}"></label>`;
    const veh = (i, it) => `<label>Vehicle${vehicleSelect(`data-i="${i}" data-k="vehicle"`, it.vehicle)}</label>`;
    const typeSel = (i, it) => KIND_SECTIONS[kind].length > 1 ? `<label>Type<select data-i="${i}" data-k="section">${KIND_SECTIONS[kind].map((k) => `<option value="${k}" ${k === it.section ? 'selected' : ''}>${SECTIONS[k]}</option>`).join('')}</select></label>` : '';
    $('#items').innerHTML = items.map((it, i) => `<div class="item">${typeSel(i, it)}${it.section === 'colombo'
      ? `${inp(i, 'date', 'Date', 'date')}${inp(i, 'time', 'Time (e.g. 9:00am)')}${inp(i, 'guests', 'Guests', 'number', 'min="0"')}${veh(i, it)}${inp(i, 'rate', 'Rate', 'number', 'min="0" step="0.01"')}
      <label class="wide">Activity (one per line)<textarea data-i="${i}" data-k="activity" rows="3" maxlength="600">${esc(it.activity || [it.pickup, it.dropoff].filter(Boolean).join(' → '))}</textarea></label>
      <label class="wide">Comments / extra charges<input data-i="${i}" data-k="comments" maxlength="300" value="${esc(it.comments)}"></label>`
      : `${inp(i, 'flight', 'Flight')}${inp(i, 'airline', 'Airline')}${inp(i, 'date', 'Date', 'date')}${inp(i, 'time', 'Time', 'time')}${inp(i, 'guests', 'Guests', 'number', 'min="0"')}${veh(i, it)}${inp(i, 'rate', 'Rate', 'number', 'min="0" step="0.01"')}`}
      <button type="button" class="danger" data-rm="${i}" aria-label="Remove line">✕</button></div>`).join('');
    totals();
  };
  if (!agr) {
    paint();
    $('#items').oninput = (e) => { const t = e.target; if (!t.dataset.i) return; if (t.dataset.k === 'rate') { liveMoney(t); items[t.dataset.i].rate = parseNum(t.value); } else items[t.dataset.i][t.dataset.k] = t.value; if (t.dataset.k === 'section') paint(); else totals(); };
    $('#items').onclick = (e) => { if (e.target.dataset.rm !== undefined) { items.splice(e.target.dataset.rm, 1); if (!items.length) items.push(newItem()); paint(); } };
    $('#add').onclick = () => { items.push(newItem(items.at(-1)?.section || KIND_SECTIONS[kind][0])); paint(); };
    document.querySelector('[name=kind]').onchange = (e) => { kind = e.target.value; fit(); paint(); };
  }
  if (agr) {
    const cust = document.querySelector('[name=customer_id]'), qsel = $('#qsel'), rate = $('#rate');
    const fillQ = (sel) => {
      const mine = quotes.filter((x) => x.customer_id === cust.value);
      qsel.innerHTML = `<option value="">None (enter total manually)</option>${mine.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.number)} · ${money(x.total)}${x.status === 'accepted' ? '' : ' (' + x.status + ')'}</option>`).join('')}`;
      sync();
    };
    const sync = () => { const x = quotes.find((y) => y.id === qsel.value); rate.readOnly = !!x; if (x) rate.value = fmtNum(x.total); };
    rate.oninput = () => liveMoney(rate);
    $('#resetTerms').onclick = () => { if (confirm('Replace the terms below with the standard Transportation Services Agreement terms?')) document.querySelector('[name=terms]').value = CONFIG.DEFAULT_TERMS; };
    cust.onchange = () => fillQ('');
    qsel.onchange = sync;
    fillQ(f.quotation_id || qid || '');
  }
  $('#ef').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const ferr = $('#ferr'); ferr.textContent = '';
    const bad = (msg, el) => { ferr.textContent = msg; if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } };
    const item = (n, k) => document.querySelector(`[data-i="${n}"][data-k="${k}"]`);
    if (fd.due_date && fd.due_date < fd.issue_date) return bad(`The ${type === 'invoice' ? 'due' : 'valid-until'} date cannot be before the document date.`, document.querySelector('[name=due_date]'));
    if (agr && fd.start && fd.end && fd.end < fd.start) return bad('The end date cannot be before the start date.', document.querySelector('[name=end]'));
    const row = { type, customer_id: fd.customer_id, issue_date: fd.issue_date, due_date: fd.due_date || null, status: fd.status, notes: fd.notes };
    if (agr) {
      const qt = quotes.find((x) => x.id === fd.quotation_id && x.customer_id === fd.customer_id);
      row.items = qt ? qt.items : []; row.tax_rate = 0; row.total = qt ? qt.total : parseNum(fd.rate); // total always equals the quotation's
      if (!qt && !(row.total > 0)) return bad('Enter the agreed total, or pick an accepted quotation.', $('#rate'));
      if (row.total > MAXAMT) return bad('The agreed total is too large.', $('#rate'));
      row.data = Object.fromEntries(['company', 'service', 'vehicle', 'pickup', 'dropoff', 'start', 'end', 'deposit', 'terms'].map((k) => [k, fd[k] || '']));
      if (qt) Object.assign(row.data, { kind: kindOf(qt), quotation: qt.number, quotation_id: qt.id });
    } else {
      const live = items.map((it, n) => [it, n]).filter(([i]) => (i.flight || i.activity || i.pickup || '').trim() || +i.rate);
      if (!live.length) return bad('Add at least one line.', $('#add'));
      for (const [i, n] of live) {
        const L = `Line ${n + 1}`, cm = i.section === 'colombo';
        if (!((cm ? i.activity : i.flight) || '').trim()) return bad(`${L}: enter the ${cm ? 'activity' : 'flight number'}.`, item(n, cm ? 'activity' : 'flight'));
        if (!i.date) return bad(`${L}: choose a date.`, item(n, 'date'));
        if (!i.vehicle) return bad(`${L}: choose a vehicle.`, item(n, 'vehicle'));
        if (!(Number.isInteger(+i.guests) && +i.guests >= 1 && +i.guests <= 500)) return bad(`${L}: guests must be a whole number from 1 to 500.`, item(n, 'guests'));
        if (!(+i.rate > 0) || +i.rate > MAXAMT) return bad(`${L}: enter a rate greater than 0.`, item(n, 'rate'));
      }
      row.items = live.map(([i]) => ({ ...i, guests: +i.guests || 0, rate: +i.rate || 0 }));
      row.tax_rate = 0;
      row.data = { ...(d.data || {}), kind };
      row.total = calc(row.items).total;
    }
    try {
      const rid = id ? (await q(sb.from('documents').update(row).eq('id', id)), id) : await nextInsert(row);
      location.hash = `#/view/${rid}`;
    } catch (err) { alert(err.message); }
  };
}

/* ---------- view / print ---------- */
async function view(v, id) {
  const d = await q(sb.from('documents').select('*, customers(*)').eq('id', id).single());
  const B = S, bankLines = (S.bank || '').split('\n').filter((l) => l.trim()), c = d.customers || {}, f = d.data || {};
  const bankHtml = bankLines.length ? bankLines.map((l) => `<p class="p">${esc(l)}</p>`).join('') : '<p class="p err noprint">Bank details are missing: add them in Settings.</p>';
  const termsHtml = (t) => {
    const lines = String(t || '').split('\n').filter((l) => l.trim());
    const legacy = !lines.some((l) => /^(- |\d+\. |\| )/.test(l)); // older agreements: every plain line is a bullet
    let html = '', tbl = [];
    const flush = () => {
      if (!tbl.length) return;
      const [h, ...r] = tbl;
      html += `<table class="tc"><thead><tr>${h.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${r.map((row) => `<tr>${row.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      tbl = [];
    };
    for (const l of lines) {
      if (l.startsWith('| ')) { tbl.push(l.slice(2).split(' | ')); continue; }
      flush();
      html += l.trim() === '{{bank}}' ? bankHtml
        : l.startsWith('# ') ? `<h4>${esc(l.slice(2))}</h4>`
        : l.startsWith('- ') ? `<p class="b">${esc(l.slice(2))}</p>`
        : /^\d+\. /.test(l) ? `<p class="n">${esc(l)}</p>`
        : `<p class="${legacy ? 'b' : 'p'}">${esc(l)}</p>`;
    }
    flush();
    return html;
  };
  const client = f.company || c.name;
  const parties = `<h3 class="sec">PARTIES</h3>
    <p class="p">This Transportation Services Agreement (“Agreement”) is entered into on ${esc(ldate(d.issue_date))}, between:</p>
    <p class="p"><b>Service Provider:</b> ${esc(CONFIG.PROVIDER)} (${esc(CONFIG.PROVIDER_REG)}), hereinafter referred to as the “Service Provider”.</p>
    <p class="p"><b>Client:</b> ${esc(client)}, hereinafter referred to as the “Client”.</p>
    <p class="p">The Service Provider and the Client shall collectively be referred to as the “Parties”.</p>`;
  const section = (key) => {
    const rows = d.items.filter((i) => i.section === key);
    if (!rows.length) return '';
    const cm = key === 'colombo';
    const head = cm ? '<th>Date</th><th>Time</th><th>Activity</th><th>Guests</th><th>Vehicle</th><th class="r">Rate</th><th>Comments</th>' : '<th>Flight</th><th>Airline</th><th>Date</th><th>Time (CMB)</th><th>Guests</th><th>Vehicle</th><th class="r">Rate</th>';
    const row = (i) => cm
      ? `<td>${esc(fdate(i.date))}</td><td>${esc(i.time)}</td><td class="act">${esc(i.activity || [i.pickup, i.dropoff].filter(Boolean).join(' → '))}</td><td>${esc(i.guests)}</td><td>${esc(i.vehicle)}</td><td class="r">${money(i.rate)}</td><td class="act">${esc(i.comments)}</td>`
      : `<td>${esc(i.flight)}</td><td>${esc(i.airline)}</td><td>${esc(fdate(i.date))}</td><td>${esc(i.time)}</td><td>${esc(i.guests)}</td><td>${esc(i.vehicle)}</td><td class="r">${money(i.rate)}</td>`;
    return `<h3 class="sec">${SECTIONS[key].toUpperCase()}</h3><table class="rates"><thead><tr>${head}</tr></thead><tbody>${rows.map((i) => `<tr>${row(i)}</tr>`).join('')}</tbody></table>`;
  };
  const signBlock = `<h4>21. Signatures</h4><p class="p">By signing below, both Parties acknowledge that they have read, understood and agreed to the terms and conditions of this Agreement.</p>
    <div class="sig"><div><b>FOR THE SERVICE PROVIDER</b><br>${esc(CONFIG.PROVIDER)}<br>Name: ${esc(B.signatory || 'Ayushka Weerasinghe')}<br>Date: ${esc(ldate(d.issue_date, '-'))}</div>
    <div><b>FOR THE CLIENT</b><br>${esc(client)}<br>Name: ${esc(c.name)}<br>Designation: ____________________<br>Signature: ____________________<br>Date: ____________________</div></div>`;
  const bank = bankLines.length ? `<h4>Bank Details</h4>${bankLines.map((l) => `<p class="b">${esc(l)}</p>`).join('')}` : '';
  const body = d.type === 'agreement' ? `
    ${parties}
    ${[f.quotation, f.service, f.vehicle, f.pickup, f.dropoff, f.start, f.end, f.deposit].some(Boolean) || (d.total && !d.items.length) ? `<table><tbody>${[['Quotation', f.quotation], ['Service', f.service], ['Vehicle', f.vehicle], ['Pick-up', f.pickup], ['Drop-off', f.dropoff], ['Start', f.start ? fdate(String(f.start).slice(0, 10)) : ''], ['End', f.end ? fdate(String(f.end).slice(0, 10)) : ''], ['Agreed total', d.total && !d.items.length ? money(d.total) : ''], ['Deposit', f.deposit]]
      .filter(([, x]) => x).map(([k, x]) => `<tr><th>${k}</th><td>${esc(x)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${d.items.length ? `${['arrival', 'departure', 'colombo'].map(section).join('')}<div class="totalbar"><span>AGREED TOTAL</span><span>${money(d.total, 0)}</span></div>` : ''}
    ${termsHtml(f.terms)}${/\{\{bank\}\}/.test(f.terms || '') ? '' : bank}${signBlock}`
  : `${['arrival', 'departure', 'colombo'].map(section).join('')}
      <div class="totalbar"><span>TOTAL</span><span>${money(d.total, 0)}</span></div>
      ${d.type === 'invoice' ? bank : '<p class="b">Rates are per vehicle/run, subject to the attached Terms &amp; Conditions and availability.</p>'}`;

  v.innerHTML = `<div class="row noprint"><span>
      <button class="primary" id="print">Print / Save PDF</button>
      <a href="#/edit/${d.type}/${d.id}"><button>Edit</button></a>
      <a href="#/customer/${d.customer_id}"><button>Customer</button></a>
      ${d.type === 'quotation' ? `<button id="conv">Convert to invoice</button> <a href="#/edit/agreement/-/${d.customer_id}/${d.id}"><button>Create agreement</button></a>` : ''}
      <button class="danger" id="del">Delete</button></span>
      <label style="margin:0">Status <select id="st">${STATUS[d.type].map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
    <div class="sheet">
      <div class="row"><div><img src="logo.png" alt="" class="logo-doc"><br><b>${esc(B.name)}</b><br>${esc(B.address)}<br>${esc([B.phone, B.email].filter(Boolean).join(' · '))}</div>
        <div style="text-align:right"><h2>${d.type === 'agreement' ? 'TRANSPORTATION SERVICES AGREEMENT' : LABEL[d.type].toUpperCase()}</h2>${esc(d.number)}${d.type === 'agreement' ? '' : '<br>' + esc(KINDS[kindOf(d)])}<br>Date: ${esc(d.issue_date)}${d.due_date ? `<br>${d.type === 'invoice' ? 'Due' : 'Valid until'}: ${esc(d.due_date)}` : ''}</div></div>
      ${d.type === 'agreement' ? '' : `<p><b>Bill to:</b><br>${esc(c.name)}<br>${esc(c.address)}<br>${esc(c.phone)} ${esc(c.email)}</p>`}
      ${body}${d.notes ? `<p><b>Notes:</b> ${esc(d.notes)}</p>` : ''}</div>`;
  $('#print').onclick = () => print();
  $('#st').onchange = async (e) => { try { await q(sb.from('documents').update({ status: e.target.value }).eq('id', id)); } catch (err) { alert(err.message); } };
  $('#del').onclick = async () => {
    if (!confirm(`Permanently delete ${d.number}?`)) return;
    try { await q(sb.from('documents').delete().eq('id', id)); location.hash = `#/list/${d.type}`; } catch (err) { alert(err.message); }
  };
  if (d.type === 'quotation') $('#conv').onclick = async () => {
    try {
      const { id: _i, number: _n, created_at: _c, customers: _cu, ...rest } = d;
      const nid = await nextInsert({ ...rest, type: 'invoice', status: 'draft', issue_date: today(), due_date: null });
      location.hash = `#/view/${nid}`;
    } catch (err) { alert(err.message); }
  };
}

boot();
