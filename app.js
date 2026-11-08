import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, min = 2) => `${CONFIG.CURRENCY}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: 2 })}`;
const fdate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '') : '';
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
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN') { show(true); route(); } if (ev === 'SIGNED_OUT') show(false); });
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
    const fn = { dashboard, customers, customer, list, edit, view, settings }[page] || dashboard;
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
  const f = (k, label) => `<label>${label}<input name="${k}" value="${esc(S[k])}"></label>`;
  v.innerHTML = `<h2>Settings</h2><form id="sf" class="card">
    <p class="muted">Printed on invoices, quotations and agreements. Stored in your database, behind login.</p>
    <div class="grid">${f('name', 'Business name')}${f('address', 'Address')}${f('phone', 'Phone')}${f('email', 'Email')}${f('signatory', 'Authorized signatory (agreements)')}</div>
    <label>Bank details (one line each, e.g. “Bank: …”, “Account Number: …”)<textarea name="bank" rows="7">${esc(S.bank)}</textarea></label>
    <button class="primary">Save settings</button> <span id="ok" class="muted" role="status"></span></form>`;
  $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const row = Object.fromEntries(new FormData(e.target));
      await q(sb.from('settings').upsert({ id: 1, ...row }));
      S = { ...S, ...row };
      $('#ok').textContent = 'Saved.';
    } catch (err) { alert(err.message); }
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
      <label>Name <input name="name" required></label><label>Phone <input name="phone"></label>
      <label>Email <input name="email" type="email"></label><label>Address <input name="address"></label>
      <div><button class="primary">Add customer</button></div></form>
    <div class="card tablewrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>${rows.map((c) =>
      `<tr><td><a href="#/customer/${c.id}">${esc(c.name)}</a><br><span class="muted">${esc(c.address)}</span></td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td><button class="danger" data-del="${c.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
  $('#cf').onsubmit = async (e) => {
    e.preventDefault();
    try { await q(sb.from('customers').insert(Object.fromEntries(new FormData(e.target)))); route(); } catch (err) { alert(err.message); }
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
  const field = (k, label, t = 'text') => `<label>${label}<input name="${k}" type="${t}" value="${esc(f[k])}"></label>`;
  v.innerHTML = `<h2>${id ? 'Edit' : 'New'} ${LABEL[type].toLowerCase()}${id ? ' ' + esc(d.number) : ''}</h2>
  <form id="ef" class="card">
    ${custs.length ? '' : '<p class="err">Add a customer first (Customers tab).</p>'}
    <div class="grid">
      <label>Customer <select name="customer_id" required><option value="">Select…</option>${custs.map((c) => `<option value="${c.id}" ${c.id === d.customer_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Date <input name="issue_date" type="date" value="${esc(d.issue_date)}" required></label>
      ${agr ? '' : `<label>${LABEL[type]} type <select name="kind">${Object.entries(KINDS).map(([k, n]) => `<option value="${k}" ${k === kindOf(d) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}
      ${type === 'agreement' ? '' : `<label>${type === 'invoice' ? 'Due date' : 'Valid until'} <input name="due_date" type="date" value="${esc(d.due_date)}"></label>`}
      <label>Status <select name="status">${STATUS[type].map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    </div>
    ${agr ? `<label>Based on accepted quotation <select name="quotation_id" id="qsel"></select></label>
      <div class="grid">${field('company', 'Client company (if any)')}${field('service', 'Service (e.g. airport transfer, tour)')}<label>Vehicle${vehicleSelect('name="vehicle"', f.vehicle)}</label>${field('pickup', 'Pick-up location')}${field('dropoff', 'Drop-off location')}${field('start', 'Start date/time', 'datetime-local')}${field('end', 'End date/time', 'datetime-local')}
      <label>Agreed total (${CONFIG.CURRENCY})<input name="rate" id="rate" type="number" min="0" step="0.01" value="${esc(d.total)}"></label>${field('deposit', 'Deposit')}</div>
      <label>Terms & conditions<textarea name="terms" rows="14">${esc(f.terms)}</textarea></label>`
    : `<h3>Items</h3><div id="items"></div><button type="button" id="add">+ Add line</button>
      <p id="totals" class="num"></p>`}
    <label>Notes <textarea name="notes">${esc(d.notes)}</textarea></label>
    <button class="primary">Save</button> <a href="#/list/${type}"><button type="button">Cancel</button></a>
  </form>`;

  const items = d.items.length ? d.items : [newItem()];
  let kind = kindOf(d);
  const fit = () => items.forEach((i) => { if (!KIND_SECTIONS[kind].includes(i.section)) i.section = KIND_SECTIONS[kind][0]; });
  fit();
  const totals = () => { if (!agr) $('#totals').innerHTML = `<b>Total ${money(calc(items).total)}</b>`; };
  const paint = () => {
    const inp = (i, k, label, t = 'text', extra = '') => `<label>${label}<input data-i="${i}" data-k="${k}" type="${t}" ${extra} value="${esc(items[i][k])}"></label>`;
    const veh = (i, it) => `<label>Vehicle${vehicleSelect(`data-i="${i}" data-k="vehicle"`, it.vehicle)}</label>`;
    const typeSel = (i, it) => KIND_SECTIONS[kind].length > 1 ? `<label>Type<select data-i="${i}" data-k="section">${KIND_SECTIONS[kind].map((k) => `<option value="${k}" ${k === it.section ? 'selected' : ''}>${SECTIONS[k]}</option>`).join('')}</select></label>` : '';
    $('#items').innerHTML = items.map((it, i) => `<div class="item">${typeSel(i, it)}${it.section === 'colombo'
      ? `${inp(i, 'date', 'Date', 'date')}${inp(i, 'time', 'Time (e.g. 9:00am)')}${inp(i, 'guests', 'Guests', 'number', 'min="0"')}${veh(i, it)}${inp(i, 'rate', 'Rate', 'number', 'min="0" step="0.01"')}
      <label class="wide">Activity (one per line)<textarea data-i="${i}" data-k="activity" rows="3">${esc(it.activity || [it.pickup, it.dropoff].filter(Boolean).join(' → '))}</textarea></label>
      <label class="wide">Comments / extra charges<input data-i="${i}" data-k="comments" value="${esc(it.comments)}"></label>`
      : `${inp(i, 'flight', 'Flight')}${inp(i, 'airline', 'Airline')}${inp(i, 'date', 'Date', 'date')}${inp(i, 'time', 'Time', 'time')}${inp(i, 'guests', 'Guests', 'number', 'min="0"')}${veh(i, it)}${inp(i, 'rate', 'Rate', 'number', 'min="0" step="0.01"')}`}
      <button type="button" class="danger" data-rm="${i}" aria-label="Remove line">✕</button></div>`).join('');
    totals();
  };
  if (!agr) {
    paint();
    $('#items').oninput = (e) => { const t = e.target; if (t.dataset.i) { items[t.dataset.i][t.dataset.k] = t.value; if (t.dataset.k === 'section') paint(); else totals(); } };
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
    const sync = () => { const x = quotes.find((y) => y.id === qsel.value); rate.readOnly = !!x; if (x) rate.value = x.total; };
    cust.onchange = () => fillQ('');
    qsel.onchange = sync;
    fillQ(f.quotation_id || qid || '');
  }
  $('#ef').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const row = { type, customer_id: fd.customer_id, issue_date: fd.issue_date, due_date: fd.due_date || null, status: fd.status, notes: fd.notes };
    if (agr) {
      const qt = quotes.find((x) => x.id === fd.quotation_id && x.customer_id === fd.customer_id);
      row.items = qt ? qt.items : []; row.tax_rate = 0; row.total = qt ? qt.total : (+fd.rate || 0); // total always equals the quotation's
      row.data = Object.fromEntries(['company', 'service', 'vehicle', 'pickup', 'dropoff', 'start', 'end', 'deposit', 'terms'].map((k) => [k, fd[k] || '']));
      if (qt) Object.assign(row.data, { kind: kindOf(qt), quotation: qt.number, quotation_id: qt.id });
    } else {
      const clean = items.filter((i) => (i.flight || i.activity || i.pickup || '').trim() || +i.rate);
      if (!clean.length) return alert('Add at least one line.');
      row.items = clean.map((i) => ({ ...i, guests: +i.guests || 0, rate: +i.rate || 0 }));
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
  const termsHtml = (t) => String(t || '').split('\n').filter((l) => l.trim()).map((l) => l.startsWith('# ') ? `<h4>${esc(l.slice(2))}</h4>` : `<p class="b">${esc(l)}</p>`).join('');
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
  const signBlock = `<div class="sig"><div><b>For the Client</b><br>Name: ${esc(c.name)}<br>Company (if applicable): ${esc(f.company)}<br>Signature:<br>Date:</div>
    <div class="auto"><b>For the Transport Company</b><br>Authorized Signatory: ${esc(B.signatory || 'Ayushka Weerasinghe')}<br>Date: ${esc(fdate(d.issue_date))}</div></div>`;
  const bank = bankLines.length ? `<h4>Bank Details</h4>${bankLines.map((l) => `<p class="b">${esc(l)}</p>`).join('')}` : '';
  const body = d.type === 'agreement' ? `
    ${[f.quotation, f.service, f.vehicle, f.pickup, f.dropoff, f.start, f.end, f.deposit].some(Boolean) || (d.total && !d.items.length) ? `<table><tbody>${[['Quotation', f.quotation], ['Service', f.service], ['Vehicle', f.vehicle], ['Pick-up', f.pickup], ['Drop-off', f.dropoff], ['Start', f.start], ['End', f.end], ['Agreed total', d.total && !d.items.length ? money(d.total) : ''], ['Deposit', f.deposit]]
      .filter(([, x]) => x).map(([k, x]) => `<tr><th>${k}</th><td>${esc(x)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${d.items.length ? `${['arrival', 'departure', 'colombo'].map(section).join('')}<div class="totalbar"><span>AGREED TOTAL</span><span>${money(d.total, 0)}</span></div>` : ''}
    <h3 class="sec">TERMS &amp; CONDITIONS</h3>${termsHtml(f.terms)}${bank}${signBlock}`
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
        <div style="text-align:right"><h2>${LABEL[d.type].toUpperCase()}</h2>${esc(d.number)}${d.type === 'agreement' ? '' : '<br>' + esc(KINDS[kindOf(d)])}<br>Date: ${esc(d.issue_date)}${d.due_date ? `<br>${d.type === 'invoice' ? 'Due' : 'Valid until'}: ${esc(d.due_date)}` : ''}</div></div>
      <p><b>${d.type === 'agreement' ? 'Client' : 'Bill to'}:</b><br>${esc(c.name)}<br>${esc(c.address)}<br>${esc(c.phone)} ${esc(c.email)}</p>
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
