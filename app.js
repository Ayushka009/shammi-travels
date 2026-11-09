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
const r2 = (n) => Math.round(n * 100) / 100;
// Payment schedule of an invoice: instalments with a percentage each. The amounts are always computed from the
// current total (last instalment takes the rounding difference). Old invoices without a plan count as one 100% payment.
const schedule = (d) => {
  const total = Number(d.total) || 0;
  const rows = d.data?.payments?.length ? d.data.payments : [{ label: 'Full payment', percent: 100, due: d.due_date || '', paid: false, paidDate: '' }];
  let acc = 0;
  return rows.map((r, i) => {
    const amount = i === rows.length - 1 ? r2(total - acc) : Math.round(total * (+r.percent || 0)) / 100;
    acc += amount;
    const paid = d.status === 'paid' ? true : !!r.paid;
    return { ...r, amount, paid, paidDate: r.paidDate || (paid && d.status === 'paid' ? d.issue_date : '') };
  });
};
const paidOf = (d) => r2(schedule(d).filter((s) => s.paid).reduce((a, s) => a + s.amount, 0));
const statusLabel = (d) => {
  if (d.type !== 'invoice' || d.status === 'paid' || d.status === 'cancelled' || !(Number(d.total) > 0)) return d.status;
  const p = paidOf(d);
  return p > 0 ? `${d.status} · ${Math.round(p / Number(d.total) * 100)}% paid` : d.status;
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
let S = { name: 'Shammi Travels', address: '', phone: '', email: '', signatory: '', bank: '', subsidiary: '', pv: '', terms: '' };
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
  const docs = await q(sb.from('documents').select('id,type,number,status,total,issue_date,customer_id,data,customers(name)').order('created_at', { ascending: false }));
  const inv = docs.filter((d) => d.type === 'invoice' && d.status !== 'cancelled');
  const quo = docs.filter((d) => d.type === 'quotation');
  const sum = (a) => a.reduce((s, d) => s + Number(d.total), 0);
  const sched = inv.flatMap((d) => schedule(d).map((s) => ({ ...s, d })));
  const paidAmt = sched.filter((s) => s.paid).reduce((a, s) => a + s.amount, 0), owedAmt = sched.filter((s) => !s.paid).reduce((a, s) => a + s.amount, 0);
  const paidInv = inv.filter((d) => paidOf(d) > 0).length, owedInv = inv.filter((d) => paidOf(d) < Number(d.total) - 0.005).length;
  const open = quo.filter((d) => d.status === 'sent' || d.status === 'draft');
  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return ym(d); });
  const rev = months.map((m) => sched.filter((s) => s.paid && String(s.paidDate || s.d.issue_date).startsWith(m)).reduce((a, s) => a + s.amount, 0));
  const max = Math.max(...rev, 1);
  v.innerHTML = `
    <h2>Dashboard</h2>
    <div class="grid">
      <div class="card stat"><span class="muted">Paid</span><b>${money(paidAmt)}</b>${paidInv} invoices</div>
      <div class="card stat"><span class="muted">Outstanding</span><b>${money(owedAmt)}</b>${owedInv} invoices</div>
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
  `<tr><td><a href="#/view/${d.id}">${esc(d.number)}</a></td>${hideCust ? '' : `<td><a href="#/customer/${d.customer_id}">${esc(d.customers?.name)}</a></td>`}<td>${esc(d.issue_date)}</td><td class="num">${d.total > 0 ? money(d.total) : '-'}</td><td>${esc(statusLabel(d))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing here yet.</p>';

async function list(v, type = 'invoice') {
  const rows = await q(sb.from('documents').select('id,type,number,status,total,issue_date,customer_id,data,customers(name)').eq('type', type).order('created_at', { ascending: false }));
  v.innerHTML = `<div class="row"><h2>${LABEL[type]}s</h2><a href="#/edit/${type}"><button class="primary">New ${LABEL[type].toLowerCase()}</button></a></div><div class="card">${table(rows)}</div>`;
}

/* ---------- formatting guide shown under every terms & conditions box ---------- */
const termsGuide = `<details class="guide"><summary>Formatting guide for terms &amp; conditions</summary>
  <p>Write one item per line. The first characters of a line decide how it prints:</p>
  <table class="gtbl"><thead><tr><th>Type this</th><th>It prints as</th></tr></thead><tbody>
    <tr><td><code># 5. Payment Terms</code></td><td>A bold clause heading</td></tr>
    <tr><td><code>Plain text on its own line</code></td><td>A normal paragraph</td></tr>
    <tr><td><code>- Smoking is not allowed</code></td><td>A bullet point (• …)</td></tr>
    <tr><td><code>1. Payment is due in 7 days</code></td><td>A numbered item (keep the number you type)</td></tr>
    <tr><td><code>| Notice | Charge</code><br><code>| 7 days or more | No charge</code></td><td>A table. Start each row with <code>| </code> and separate cells with <code> | </code>. The first row is the grey header, and rows on consecutive lines form one table.</td></tr>
    <tr><td><code>{{bank}}</code> (alone on a line)</td><td>Your bank details from Settings</td></tr>
  </tbody></table>
  <p>Example:</p>
  <pre># 6. Cancellation Policy
The following charges apply:
| Notice received | Charge
| 8 days or more | No charge
| 7 days or less | 50% of the hire value
- Written notice is required.
1. First numbered point.
# 7. Bank Details
Payments shall be made to:
{{bank}}</pre>
  <p class="muted">Tips: blank lines are ignored. Bold, italics and links are not supported. If none of the markers above are used, every line prints as a bullet. Maximum 20,000 characters.</p>
</details>`;

/* ---------- settings ---------- */
async function settings(v) {
  const f = (k, label, attrs = 'maxlength="200"') => `<label>${label}<input name="${k}" value="${esc(S[k])}" ${attrs}></label>`;
  v.innerHTML = `<h2>Settings</h2><form id="sf" class="card">
    <p class="muted">Printed on invoices, quotations and agreements. Stored in your database, behind login.</p>
    <div class="grid">${f('name', 'Business name')}${f('address', 'Address')}${f('phone', 'Phone', 'type="tel" pattern="[0-9+ ]{7,20}" maxlength="20" title="7 to 20 characters: digits, + and spaces"')}${f('email', 'Email', 'type="email" maxlength="120"')}${f('signatory', 'Authorized signatory (agreements)')}</div>
    <div class="grid">${f('subsidiary', 'Subsidiary line (printed under the name in every document header)', 'maxlength="120" placeholder="e.g. A subsidiary of …"')}${f('pv', 'Company PV number', 'maxlength="30" pattern="[A-Za-z0-9 ]{3,30}" title="Letters, digits and spaces"')}</div>
    <label>Bank details (one line each, e.g. “Bank: …”, “Account Number: …”)<textarea name="bank" rows="7" maxlength="1000">${esc(S.bank)}</textarea></label>
    <label>Standard agreement terms
      <textarea name="terms" rows="14" maxlength="20000">${esc(S.terms)}</textarea></label>
    ${termsGuide}
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
    q(sb.from('documents').select('id,type,number,status,total,issue_date,customer_id,data').eq('customer_id', id).order('issue_date', { ascending: false })),
  ]);
  const by = (t) => docs.filter((d) => d.type === t);
  const sum = (a) => a.reduce((s, d) => s + Number(d.total), 0);
  const inv = by('invoice');
  const liveInv = inv.filter((d) => d.status !== 'cancelled');
  const paidAmt = liveInv.reduce((s, d) => s + paidOf(d), 0), owedAmt = liveInv.reduce((s, d) => s + Number(d.total) - paidOf(d), 0);
  const block = (t, title) => `<div class="card"><div class="row"><h3>${title} (${by(t).length})</h3><a href="#/edit/${t}/-/${id}"><button class="primary">New ${LABEL[t].toLowerCase()}</button></a></div>${table(by(t), true)}</div>`;
  v.innerHTML = `<div class="row"><h2>${esc(c.name)}</h2><a href="#/customers"><button>All customers</button></a></div>
    <div class="card"><span class="muted">${esc([c.phone, c.email, c.address].filter(Boolean).join(' · ')) || 'No contact details'}</span></div>
    <div class="grid"><div class="card stat"><span class="muted">Paid</span><b>${money(paidAmt)}</b></div><div class="card stat"><span class="muted">Outstanding</span><b>${money(owedAmt)}</b></div></div>
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
  const d = existing || { type, customer_id: cid, status: 'draft', issue_date: today(), items: [newItem()], tax_rate: 0, data: type === 'agreement' ? { terms: S.terms } : {}, notes: '' };
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
      ${type === 'agreement' ? '' : `<label>${type === 'invoice' ? 'Due date' : 'Valid until'} <input name="due_date" type="date" min="${DMIN}" max="${DMAX}" value="${esc(d.due_date)}" ${type === 'invoice' ? 'required' : ''}></label>`}
      <label>Status <select name="status">${STATUS[type].map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    </div>
    ${agr ? `<label>Based on accepted quotation <select name="quotation_id" id="qsel"></select></label>
      <div class="grid">${field('company', 'Client organisation (e.g. Curtin University)')}${field('service', 'Service (e.g. airport transfer, tour)')}<label>Vehicle${vehicleSelect('name="vehicle"', f.vehicle)}</label>${field('pickup', 'Pick-up location')}${field('dropoff', 'Drop-off location')}${field('start', 'Start date', 'date')}${field('end', 'End date', 'date')}
      <label>Agreed total (${CONFIG.CURRENCY})<input name="rate" id="rate" inputmode="decimal" autocomplete="off" placeholder="0.00" maxlength="15" value="${d.total ? esc(fmtNum(d.total)) : ''}"></label>${field('deposit', 'Deposit')}</div>
      <label>Terms & conditions<textarea name="terms" rows="14" required maxlength="20000">${esc(f.terms)}</textarea></label>
      <button type="button" id="resetTerms">Load standard terms</button>
      ${termsGuide}`
    : `<h3>Items</h3><div id="items"></div><button type="button" id="add">+ Add line</button>
      <p id="totals" class="num"></p>
      ${type === 'invoice' ? `<h3>Payment plan</h3>
      <label>Payment <select id="pmode"><option value="full">Full payment (100%)</option><option value="split">Split payment (instalments)</option></select></label>
      <div id="pwrap" hidden>
        <p class="muted">Presets: <button type="button" data-preset="50,50">50% / 50%</button> <button type="button" data-preset="30,70">30% / 70%</button> <button type="button" data-preset="40,30,30">40% / 30% / 30%</button></p>
        <div id="pays"></div>
        <button type="button" id="padd">+ Add instalment</button>
        <p id="psum" class="num"></p>
        <p class="muted">Amounts are worked out from the invoice total. The invoice due date becomes the last instalment's date. Paid instalments are locked.</p>
      </div>` : ''}`}
    <label>Notes <textarea name="notes" maxlength="1000">${esc(d.notes)}</textarea></label>
    <p id="ferr" class="err" role="alert"></p>
    <button class="primary">Save</button> <a href="#/list/${type}"><button type="button">Cancel</button></a>
  </form>`;

  const items = d.items.length ? d.items : [newItem()];
  let kind = kindOf(d);
  const fit = () => items.forEach((i) => { if (!KIND_SECTIONS[kind].includes(i.section)) i.section = KIND_SECTIONS[kind][0]; });
  fit();
  // ---- invoice payment plan: full payment, or split into percentage instalments
  let pay = (f.payments && f.payments.length) ? f.payments.map((x) => ({ ...x })) : [{ label: 'Full payment', percent: 100, due: d.due_date || '', paid: false, paidDate: '' }];
  let mode = pay.length > 1 ? 'split' : 'full';
  const dueEl = () => document.querySelector('[name=due_date]'), issueEl = () => document.querySelector('[name=issue_date]');
  const lastDue = () => pay.map((p) => p.due).filter(Boolean).sort().at(-1) || '';
  function payAmounts() {
    if (type !== 'invoice') return;
    schedule({ total: calc(items).total, status: 'draft', data: { payments: pay } }).forEach((r, i) => { const el = document.querySelector(`[data-amt="${i}"]`); if (el) el.textContent = money(r.amount); });
    const sum = pay.reduce((s, p) => s + (+p.percent || 0), 0), ok = Math.abs(sum - 100) < 0.005, ps = $('#psum');
    if (ps) { ps.textContent = `Total ${r2(sum)}% ${ok ? '✓' : '— must add up to 100%'}`; ps.className = 'num' + (ok ? '' : ' neg'); }
  }
  function payPaint() {
    if (type !== 'invoice') return;
    $('#pwrap').hidden = mode !== 'split'; $('#pmode').value = mode;
    $('#pays').innerHTML = pay.map((p, i) => `<div class="payrow">
      <label>Description<input data-p="${i}" data-k="label" maxlength="60" value="${esc(p.label)}" ${p.paid ? 'disabled' : ''}></label>
      <label>%<input data-p="${i}" data-k="percent" inputmode="decimal" autocomplete="off" maxlength="6" value="${esc(p.percent)}" ${p.paid ? 'disabled' : ''}></label>
      <label>Due date<input type="date" data-p="${i}" data-k="due" min="${DMIN}" max="${DMAX}" value="${esc(p.due)}" ${p.paid ? 'disabled' : ''}></label>
      <span class="amt" data-amt="${i}"></span>
      ${p.paid ? '<span class="muted">Paid</span>' : `<button type="button" class="danger" data-prm="${i}" aria-label="Remove instalment">✕</button>`}</div>`).join('');
    const de = dueEl();
    if (mode === 'split') { de.value = lastDue(); de.disabled = true; } else de.disabled = false;
    payAmounts();
  }
  const totals = () => { if (!agr) $('#totals').innerHTML = `<b>Total ${money(calc(items).total)}</b>`; payAmounts(); };
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
  if (type === 'invoice') {
    const blank = (label, percent, due) => ({ label, percent, due, paid: false, paidDate: '' });
    $('#pmode').onchange = (e) => {
      if (e.target.value === 'full' && pay.some((p) => p.paid) && pay.length > 1) { e.target.value = 'split'; return alert('Some instalments are already paid, so this invoice cannot go back to a single payment.'); }
      mode = e.target.value;
      if (mode === 'split' && pay.length < 2) pay = [blank('Advance payment', 50, issueEl().value), blank('Balance payment', 50, '')];
      if (mode === 'full') pay = [blank('Full payment', 100, dueEl().value)];
      payPaint();
    };
    document.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => {
      if (pay.some((p) => p.paid)) return alert('Some instalments are already paid, so a preset cannot replace them.');
      const pcs = b.dataset.preset.split(',').map(Number);
      pay = pcs.map((pc, i) => blank(i === 0 ? 'Advance payment' : i === pcs.length - 1 ? (pcs.length === 2 ? 'Balance payment' : 'Final payment') : 'Second instalment', pc, i === 0 ? issueEl().value : ''));
      mode = 'split'; payPaint();
    });
    $('#padd').onclick = () => { pay.push(blank('Instalment', 0, '')); payPaint(); };
    $('#pays').oninput = (e) => {
      const t = e.target, i = t.dataset.p; if (i === undefined) return;
      if (t.dataset.k === 'percent') t.value = t.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d\d).+/, '$1');
      pay[i][t.dataset.k] = t.value;
      if (t.dataset.k === 'due') dueEl().value = lastDue();
      payAmounts();
    };
    $('#pays').onclick = (e) => { const i = e.target.dataset.prm; if (i !== undefined) { pay.splice(+i, 1); payPaint(); } };
    payPaint();
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
    $('#resetTerms').onclick = () => { if (!S.terms) return alert('There are no standard terms yet. Add them under Settings first.'); if (confirm('Replace the terms below with the standard Transportation Services Agreement terms?')) document.querySelector('[name=terms]').value = S.terms; };
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
      if (type === 'invoice') {
        const pel = (i, k) => document.querySelector(`[data-p="${i}"][data-k="${k}"]`);
        let payments;
        if (mode === 'split') {
          if (pay.length < 2) return bad('Add at least two instalments, or switch to Full payment.', $('#padd'));
          let sum = 0;
          for (const [i, p] of pay.entries()) {
            const L = `Instalment ${i + 1}`, pc = +p.percent;
            if (!String(p.label || '').trim()) return bad(`${L}: enter a description.`, pel(i, 'label'));
            if (!(pc > 0 && pc <= 100)) return bad(`${L}: enter a percentage between 0.01 and 100.`, pel(i, 'percent'));
            if (!p.due) return bad(`${L}: choose a due date.`, pel(i, 'due'));
            if (p.due < fd.issue_date) return bad(`${L}: the due date cannot be before the invoice date.`, pel(i, 'due'));
            sum += pc;
          }
          if (Math.abs(sum - 100) > 0.005) return bad(`The percentages add up to ${r2(sum)}%. They must add up to 100%.`, $('#pays'));
          payments = pay.map((p) => ({ label: p.label.trim(), percent: +p.percent, due: p.due, paid: !!p.paid, paidDate: p.paidDate || '' }));
        } else {
          if (!fd.due_date) return bad('Choose the invoice due date.', dueEl());
          const prev = pay.length === 1 ? pay[0] : {};
          payments = [{ label: 'Full payment', percent: 100, due: fd.due_date, paid: !!prev.paid, paidDate: prev.paidDate || '' }];
        }
        row.data = { ...row.data, payments };
        row.due_date = payments.map((p) => p.due).sort().at(-1);
        if (payments.every((p) => p.paid) && row.status !== 'cancelled') row.status = 'paid';
      }
    }
    try {
      const rid = id ? (await q(sb.from('documents').update(row).eq('id', id)), id) : await nextInsert(row);
      location.hash = `#/view/${rid}`;
    } catch (err) { alert(err.message); }
  };
}

/* ---------- direct PDF download (no print dialog) ---------- */
// html2pdf.js 0.10.2 (html2canvas + jsPDF), loaded only when you click Download PDF; pinned with the hash cdnjs publishes.
const PDF_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js', integrity: 'sha512-MpDFIChbcXl2QgipQrt1VcPHMldRILetapBl5MPCA9Y8r7qvlwx1/Mc9hNTzY+kS5kX6PdoDq41ws1HiVNLdZA==' };
let pdfLib = null;
const loadPdfLib = () => pdfLib ||= new Promise((resolve, reject) => {
  if (window.html2pdf) return resolve(window.html2pdf);
  const s = document.createElement('script');
  Object.assign(s, { src: PDF_LIB.src, integrity: PDF_LIB.integrity, crossOrigin: 'anonymous' });
  s.onload = () => resolve(window.html2pdf);
  s.onerror = () => { pdfLib = null; reject(new Error('Could not load the PDF tool. Check your internet connection and try again.')); };
  document.head.appendChild(s);
});

// Page breaks for the PDF: the PDF tool slices one tall image at fixed heights and drifts a few pixels per page, so it can cut a
// line in half. Instead, measure every block and push any block that would cross a page boundary down to the next page.
// Headings (and table header rows) move together with the block that follows them.
const A4_PAGE_PX = Math.floor(716 * 2 * 273 / 190) / 2; // = 1028.5: the tool's exact page height in CSS px for a 716px-wide capture at scale 2 (A4, 12mm top/bottom margins)
const paginateForPdf = (root, pageH = A4_PAGE_PX) => {
  const units = [...root.querySelectorAll('tr, p, h3, h4, .sig, .totalbar, table.sumtbl, .logo-doc')].filter((u) => !u.closest('table.sumtbl') || u.matches('table.sumtbl'));
  const isHead = (u, next) => u.matches('h3, h4') || (u.matches('tr') && u.parentElement.tagName === 'THEAD') || (u.matches('p') && !!next && next.matches('.sig')); // headings, table header rows and the line above the signature boxes stick to what follows
  const base = () => root.getBoundingClientRect().top;
  units.forEach((u, i) => {
    let last = u, k = i;
    while (isHead(units[k], units[k + 1]) && units[k + 1]) { k++; last = units[k]; }      // keep a heading with what follows (through a table header row)
    const top = u.getBoundingClientRect().top - base(), bottom = last.getBoundingClientRect().bottom - base();
    const page = Math.floor(top / pageH);
    if (bottom > (page + 1) * pageH - 0.75 && bottom - top <= pageH) {
      const pad = (page + 1) * pageH - top;
      if (u.matches('tr')) {
        const tr = document.createElement('tr'), td = document.createElement('td');
        td.colSpan = 99; td.style.cssText = `height:${pad}px;padding:0;border:0`; tr.appendChild(td); u.parentElement.insertBefore(tr, u);
      } else {
        const sp = document.createElement('div'); sp.style.height = `${pad}px`; u.parentElement.insertBefore(sp, u);
      }
    }
  });
};

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
  const provider = [B.name, B.subsidiary && B.subsidiary.charAt(0).toLowerCase() + B.subsidiary.slice(1)].filter(Boolean).join(', ');
  const parties = `<h3 class="sec">PARTIES</h3>
    <p class="p">This Transportation Services Agreement (“Agreement”) is entered into on ${esc(ldate(d.issue_date))}, between:</p>
    <p class="p"><b>Service Provider:</b> ${esc(provider)}${B.pv ? ` (PV: ${esc(B.pv)})` : ''}, hereinafter referred to as the “Service Provider”.</p>
    <p class="p"><b>Client:</b> ${esc(client)}, hereinafter referred to as the “Client”.</p>
    <p class="p">The Service Provider and the Client shall collectively be referred to as the “Parties”.</p>`;
  const RL = d.type === 'invoice' ? 'Amount' : 'Rate';
  const section = (key) => {
    const rows = d.items.filter((i) => i.section === key);
    if (!rows.length) return '';
    const cm = key === 'colombo';
    const head = (cm ? '<th>Date</th><th>Time</th><th>Activity</th><th>Guests</th><th>Vehicle</th><th class="r">Rate</th><th>Comments</th>' : '<th>Flight</th><th>Airline</th><th>Date</th><th>Time (CMB)</th><th>Guests</th><th>Vehicle</th><th class="r">Rate</th>').replace('>Rate<', `>${RL}<`);
    const row = (i) => cm
      ? `<td>${esc(fdate(i.date))}</td><td>${esc(i.time)}</td><td class="act">${esc(i.activity || [i.pickup, i.dropoff].filter(Boolean).join(' → '))}</td><td>${esc(i.guests)}</td><td>${esc(i.vehicle)}</td><td class="r">${money(i.rate)}</td><td class="act">${esc(i.comments)}</td>`
      : `<td>${esc(i.flight)}</td><td>${esc(i.airline)}</td><td>${esc(fdate(i.date))}</td><td>${esc(i.time)}</td><td>${esc(i.guests)}</td><td>${esc(i.vehicle)}</td><td class="r">${money(i.rate)}</td>`;
    return `<h3 class="sec">${SECTIONS[key].toUpperCase()}</h3><table class="rates"><thead><tr>${head}</tr></thead><tbody>${rows.map((i) => `<tr>${row(i)}</tr>`).join('')}</tbody></table>`;
  };
  const signBlock = `<h4>21. Signatures</h4><p class="p">By signing below, both Parties acknowledge that they have read, understood and agreed to the terms and conditions of this Agreement.</p>
    <div class="sig"><div><b>FOR THE SERVICE PROVIDER</b><br>${esc(provider)}<br>Name: ${esc(B.signatory || 'Ayushka Weerasinghe')}<br>Date: ${esc(ldate(d.issue_date, '-'))}</div>
    <div><b>FOR THE CLIENT</b><br>${esc(client)}<br>Name: ${esc(c.name)}<br>Designation: ____________________<br>Signature: ____________________<br>Date: ____________________</div></div>`;
  const bank = bankLines.length ? `<h4>Bank Details</h4>${bankLines.map((l) => `<p class="b">${esc(l)}</p>`).join('')}` : '';
  const sch = schedule(d), paidSum = r2(sch.filter((s) => s.paid).reduce((a, s) => a + s.amount, 0)), balance = r2(Number(d.total) - paidSum);
  const stamp = d.type !== 'invoice' ? '' : d.status === 'cancelled' ? 'CANCELLED' : balance <= 0.004 ? 'PAID' : paidSum > 0 ? 'PARTLY PAID' : 'UNPAID';
  // invoices show the total only; the line-by-line breakdown stays on the quotation
  const dates = d.items.map((i) => i.date).filter(Boolean).sort();
  const range = dates.length ? (dates[0] === dates.at(-1) ? fdate(dates[0]) : `${fdate(dates[0])} – ${fdate(dates.at(-1))}`) : '';
  const invoiceSummary = `<table class="rates"><thead><tr><th style="text-align:left">Description</th><th class="r">Amount</th></tr></thead><tbody><tr>
    <td class="act" style="font-size:15px">Transportation services${f.quotation ? ` as per quotation ${esc(f.quotation)}` : ''}${range ? `<br><span style="font-size:13px">Service dates: ${esc(range)}</span>` : ''}</td><td class="r">${money(d.total)}</td></tr></tbody></table>`;
  const invoiceTail = `<h3 class="sec">PAYMENT SCHEDULE</h3>
    <table class="rates pay"><thead><tr><th>#</th><th>Description</th><th>Share</th><th class="r">Amount</th><th>Due date</th><th>Status</th></tr></thead><tbody>${sch.map((s, i) =>
      `<tr><td>${i + 1}</td><td class="act">${esc(s.label)}</td><td>${esc(r2(+s.percent))}%</td><td class="r">${money(s.amount)}</td><td>${esc(s.due ? fdate(s.due) : '—')}</td>
       <td>${s.paid ? 'Paid' + (s.paidDate ? ' ' + esc(fdate(s.paidDate)) : '') : 'Unpaid'}<span class="noprint"> ${s.paid ? '' : `<input type="date" class="pd" data-pd="${i}" min="${DMIN}" max="${DMAX}" value="${today()}" aria-label="Date paid"> `}<button type="button" class="mini" data-pay="${i}">${s.paid ? 'Mark unpaid' : 'Mark paid'}</button></span></td></tr>`).join('')}</tbody></table>
    <table class="sumtbl"><tr><td>Invoice total</td><td class="r">${money(d.total)}</td></tr><tr><td>Amount paid</td><td class="r">${money(paidSum)}</td></tr><tr><td><b>Balance due</b></td><td class="r"><b>${money(balance)}</b></td></tr></table>
    ${bank || '<p class="p err noprint">Bank details are missing: add them in Settings.</p>'}
    <p class="p">Please quote invoice number <b>${esc(d.number)}</b> as the payment reference. All amounts are in Sri Lankan Rupees (LKR).</p>
    <p class="p">Services are subject to the agreed Terms &amp; Conditions.</p>`;
  const body = d.type === 'agreement' ? `
    ${parties}
    ${[f.quotation, f.service, f.vehicle, f.pickup, f.dropoff, f.start, f.end, f.deposit].some(Boolean) || (d.total && !d.items.length) ? `<table><tbody>${[['Quotation', f.quotation], ['Service', f.service], ['Vehicle', f.vehicle], ['Pick-up', f.pickup], ['Drop-off', f.dropoff], ['Start', f.start ? fdate(String(f.start).slice(0, 10)) : ''], ['End', f.end ? fdate(String(f.end).slice(0, 10)) : ''], ['Agreed total', d.total && !d.items.length ? money(d.total) : ''], ['Deposit', f.deposit]]
      .filter(([, x]) => x).map(([k, x]) => `<tr><th>${k}</th><td>${esc(x)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${d.items.length ? `${['arrival', 'departure', 'colombo'].map(section).join('')}<div class="totalbar"><span>AGREED TOTAL</span><span>${money(d.total, 0)}</span></div>` : ''}
    ${termsHtml(f.terms)}${/\{\{bank\}\}/.test(f.terms || '') ? '' : bank}${signBlock}`
  : `${d.type === 'invoice' ? invoiceSummary : ['arrival', 'departure', 'colombo'].map(section).join('')}
      <div class="totalbar"><span>${d.type === 'invoice' ? 'INVOICE TOTAL' : 'TOTAL'}</span><span>${money(d.total, 0)}</span></div>
      ${d.type === 'invoice' ? invoiceTail : '<p class="b">Rates are per vehicle/run, subject to the attached Terms &amp; Conditions and availability.</p>'}`;

  v.innerHTML = `<div class="row noprint"><span>
      <button class="primary" id="pdf">Download PDF</button>
      <button id="print">Print</button>
      <a href="#/edit/${d.type}/${d.id}"><button>Edit</button></a>
      <a href="#/customer/${d.customer_id}"><button>Customer</button></a>
      ${d.type === 'quotation' ? `<button id="conv">Convert to invoice</button> <a href="#/edit/agreement/-/${d.customer_id}/${d.id}"><button>Create agreement</button></a>` : ''}
      <button class="danger" id="del">Delete</button></span>
      <label style="margin:0">Status <select id="st">${STATUS[d.type].map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
    <div class="sheet">
      <div class="row"><div><img src="logo.png" alt="" class="logo-doc"><br><b>${esc(B.name)}</b>${B.subsidiary ? `<br>${esc(B.subsidiary)}${B.pv ? ` (PV ${esc(B.pv)})` : ''}` : ''}<br>${esc(B.address)}<br>${esc([B.phone, B.email].filter(Boolean).join(' · '))}</div>
        <div style="text-align:right"><h2>${d.type === 'agreement' ? 'TRANSPORTATION SERVICES AGREEMENT' : LABEL[d.type].toUpperCase()}</h2>${d.type === 'invoice'
          ? `${esc(d.number)}<br>Invoice date: ${esc(fdate(d.issue_date))}<br>Due date: ${esc(d.due_date ? fdate(d.due_date) : '—')}${f.quotation ? `<br>Ref: ${esc(f.quotation)}` : ''}<br><b class="stamp ${stamp === 'PAID' ? 'ok' : ''}">${stamp}</b>`
          : `${esc(d.number)}${d.type === 'agreement' ? '' : '<br>' + esc(KINDS[kindOf(d)])}<br>Date: ${esc(d.issue_date)}${d.due_date ? `<br>Valid until: ${esc(d.due_date)}` : ''}`}</div></div>
      ${d.type === 'agreement' ? '' : `<p><b>Bill to:</b><br>${esc(c.name)}<br>${esc(c.address)}<br>${esc(c.phone)} ${esc(c.email)}</p>`}
      ${body}${d.notes ? `<p><b>Notes:</b> ${esc(d.notes)}</p>` : ''}</div>`;
  $('#print').onclick = () => print();
  // file name like "Invoice - Curtin UNI.pdf" (agreements use the client organisation when it is filled in)
  const pdfName = () => `${(d.type === 'agreement' ? 'Agreement' : LABEL[d.type])} - ${d.type === 'agreement' ? (f.company || c.name) : c.name}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) + '.pdf';
  $('#pdf').onclick = async (e) => {
    const b = e.currentTarget, label = b.textContent;
    b.disabled = true; b.textContent = 'Preparing PDF…';
    let box, cover;
    const scroll = [window.scrollX, window.scrollY];
    try {
      const html2pdf = await loadPdfLib();
      // render a fixed-width copy (716px = A4 minus 10mm margins at 96dpi, the tool does not shrink content) so the PDF looks the same on a phone as on a desktop, without the on-screen-only buttons.
      // It sits at the top-left (the renderer clips anything far off-screen) under a cover that hides it from view.
      window.scrollTo(0, 0);
      cover = document.createElement('div');
      cover.style.cssText = 'position:fixed;inset:0;z-index:10001;background:var(--bg,#fff);display:grid;place-items:center;font:600 16px system-ui';
      cover.textContent = 'Preparing PDF…'; document.body.appendChild(cover);
      box = document.createElement('div');
      box.style.cssText = 'position:absolute;left:0;top:0;z-index:10000;width:716px;background:#fff';
      const copy = document.querySelector('.sheet').cloneNode(true);
      copy.style.cssText = 'width:716px;overflow:visible;border:0;padding:0';
      copy.querySelectorAll('.noprint').forEach((x) => x.remove());
      box.appendChild(copy); document.body.appendChild(box);
      const worker = html2pdf().set({
        margin: [12, 10, 12, 10], filename: pdfName(),
        image: { type: 'jpeg', quality: 0.92 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['css'] }, // breaks are placed by paginateForPdf
      }).from(copy);
      // the tool renders its own copy; its width (and so its page height) can differ by a few px, so measure that one
      const container = await worker.toContainer().get('container');
      paginateForPdf(container, Math.floor(Math.round(container.getBoundingClientRect().width * 2) * 273 / 190) / 2);
      await worker.toCanvas().toPdf().save();
    } catch (err) { alert(err.message || 'Could not create the PDF.'); }
    finally { box?.remove(); cover?.remove(); window.scrollTo(...scroll); b.disabled = false; b.textContent = label; }
  };
  if (d.type === 'invoice') v.querySelectorAll('[data-pay]').forEach((b) => b.onclick = async () => {
    try {
      const i = +b.dataset.pay, was = sch[i].paid;
      const pays = (d.data?.payments?.length ? d.data.payments : [{ label: 'Full payment', percent: 100, due: d.due_date || '', paid: false, paidDate: '' }]).map((x) => ({ ...x }));
      if (d.status === 'paid' && was) pays.forEach((p, k) => { if (k !== i && !p.paid) { p.paid = true; p.paidDate = p.paidDate || d.issue_date; } }); // old 'paid' invoice: keep the others paid
      pays[i].paid = !was;
      pays[i].paidDate = was ? '' : (v.querySelector(`[data-pd="${i}"]`)?.value || today());
      const all = pays.every((p) => p.paid);
      const status = d.status === 'cancelled' ? d.status : all ? 'paid' : d.status === 'paid' ? 'sent' : d.status;
      await q(sb.from('documents').update({ data: { ...(d.data || {}), payments: pays }, status }).eq('id', id));
      route();
    } catch (err) { alert(err.message); }
  });
  $('#st').onchange = async (e) => { try { await q(sb.from('documents').update({ status: e.target.value }).eq('id', id)); } catch (err) { alert(err.message); } };
  $('#del').onclick = async () => {
    if (!confirm(`Permanently delete ${d.number}?`)) return;
    try { await q(sb.from('documents').delete().eq('id', id)); location.hash = `#/list/${d.type}`; } catch (err) { alert(err.message); }
  };
  if (d.type === 'quotation') $('#conv').onclick = async () => {
    try {
      const { id: _i, number: _n, created_at: _c, customers: _cu, ...rest } = d;
      const nid = await nextInsert({ ...rest, type: 'invoice', status: 'draft', issue_date: today(), due_date: today(), data: { ...(rest.data || {}), quotation: d.number } });
      location.hash = `#/view/${nid}`;
    } catch (err) { alert(err.message); }
  };
}

boot();
