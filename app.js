'use strict';
/* BLACK TEAM control center (owner panel for one FiveM server). */

const CATEGORY = {
  combat: ['Aimbot', 'SilentAim', 'ImpossibleHit', 'WeaponDamageModifier', 'WeaponRange', 'RapidFire', 'ReloadExploit', 'MeleeDamageAbuse', 'KillManipulation', 'HitAccuracy', 'NoSpread', 'NoRecoil', 'InfiniteAmmo', 'MeleeDamage', 'DamageDefense'],
  movement: ['NoClip', 'NoClipServer', 'FlyHack', 'SuperJump', 'SuperJumpVelocity', 'SpeedHack', 'Teleport', 'TeleportToPlayer', 'Freecam', 'MovementState', 'UnderwaterAbuse', 'InfiniteStamina'],
  player: ['Godmode', 'InfiniteHealth', 'InfiniteArmor', 'DamageImmunity', 'HealthRegen', 'ArmorRegen', 'HealthAbnormal', 'ArmorAbnormal', 'InvisiblePlayer', 'InvisibleServer', 'ModelChange', 'AlphaManipulation', 'RagdollManipulation', 'EntityProofs', 'SpectateAbuse'],
  weapons: ['BlacklistedWeapon', 'WeaponSpawn', 'UnauthorizedWeapon', 'WeaponGiveEvent', 'WeaponRemoveEvent', 'InvalidComponent'],
  vehicles: ['VehicleGodmode', 'VehicleDamage', 'VehicleDefense', 'BlacklistedVehicle', 'VehicleSpawn', 'VehicleHealthAbnormal', 'VehicleOwnership', 'VehicleDamageImmunity', 'VehicleRepair', 'PlateManipulation', 'VehicleAcceleration', 'VehicleFlying', 'VehicleDuplication', 'HandlingManipulation'],
  entities: ['BlacklistedPed', 'BlacklistedObject', 'PedSpawn', 'ObjectSpawn', 'EntitySpam', 'ExplosionAbuse', 'ParticleAbuse', 'ProjectileAbuse', 'ExplosionRemote', 'FireAbuse', 'ClearTasksAbuse', 'AttachmentAbuse', 'OwnershipAbuse', 'EntityDeletion'],
  events: ['EventAbuse', 'EventSpam', 'AdminAbuse', 'EventHoneypot', 'NetworkEventFlood', 'EventPayload', 'AdminEventAbuse', 'GuardedEventSpam', 'EventInvalidArgs', 'CallbackAbuse', 'CommandAbuse', 'PermissionBypass', 'TelemetrySpoof'],
  resources: ['SuspiciousResource', 'ResourceInjection', 'ResourceBlacklisted', 'HeartbeatMissing'],
  economy: ['MoneyExploit', 'IllegalAmount', 'MoneyInjection', 'UnexplainedMoney', 'DuplicatePayment', 'DuplicateReward', 'PayoutManipulation', 'ShopExploit', 'IllegalSale', 'NegativeBalance'],
  inventory: ['ItemExploit', 'InventoryEventAbuse', 'InvalidItemCount', 'UnauthorizedItem', 'IllegalTransfer', 'ItemDuplication', 'InvalidMetadata', 'InvalidAmmo'],
  modmenu: ['ModMenuSignature'],
};
const CATEGORY_LABEL = { combat: 'Combat & aim', movement: 'Movement', player: 'Player state', weapons: 'Weapons', vehicles: 'Vehicles', entities: 'Entities & explosions', events: 'Events & commands', resources: 'Resources', economy: 'Economy', inventory: 'Inventory', modmenu: 'Mod menus', other: 'Other' };
const codeCategory = {};
for (const [cat, codes] of Object.entries(CATEGORY)) for (const c of codes) codeCategory[c] = cat;
const catOf = (code) => codeCategory[code] || 'other';

const PAGES = [
  { group: 'Monitor' },
  { id: 'overview', label: 'Overview', ic: '◉' },
  { id: 'detections', label: 'Live detections', ic: '⚡' },
  { id: 'players', label: 'Players', ic: '☺' },
  { id: 'monitor', label: 'Screen monitor', ic: '▣' },
  { group: 'Enforcement' },
  { id: 'evidence', label: 'Bans & evidence', ic: '▶' },
  { id: 'warnings', label: 'Warnings', ic: '!' },
  { group: 'Configuration' },
  { id: 'protections', label: 'Protections', ic: '⛨' },
  { id: 'lists', label: 'Whitelists & blacklists', ic: '☰' },
  { id: 'admins', label: 'Admins', ic: '★' },
  { id: 'logs', label: 'Staff audit log', ic: '⎙' },
];

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { csrf: '', user: null, server: null, page: 'overview', timers: [], seenDetections: new Set(), filter: 'all', search: '', monitorTarget: null, watch: false };

// ------------------------------------------------------------------ api --
// Two modes:
//  * Node panel (server.js): same-origin /api/* with a session cookie + CSRF.
//  * GitHub Pages (BT_STATIC): the page talks straight to the FiveM resource at
//    https://<id>.users.cfx.re/black_team_development/panel/* with a bearer token.
const STATIC = window.BT_STATIC === true;
const store = {
  get(k, session) { try { return (session ? sessionStorage : localStorage).getItem(k) || ''; } catch (_) { return ''; } },
  set(k, v, session) { try { (session ? sessionStorage : localStorage)[v ? 'setItem' : 'removeItem'](k, v); } catch (_) { /* private mode */ } },
};
// A server address built into config.js (BT_SERVER) hides the address box.
const FIXED_SERVER = String(window.BT_SERVER || '').trim().replace(/\/+$/, '');
const serverBase = () => FIXED_SERVER || store.get('bt_server').replace(/\/+$/, '');

async function request(url, options = {}, isLogin = false) {
  let res;
  try { res = await fetch(url, options); }
  catch (_) {
    if (state.server) setServer({ ...state.server, connected: false });
    throw new Error(STATIC ? 'Cannot reach your FiveM server. Is it online and is the server address right?' : 'Cannot reach the panel.');
  }
  let body = {}; try { body = await res.json(); } catch (_) { /* empty */ }
  if (res.status === 401 && !isLogin) { store.set('bt_token', '', true); showLogin(); throw new Error('Please sign in.'); }
  if (!res.ok || body.ok === false) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
function api(path, options = {}) {
  return request(path, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } }, path.startsWith('/api/login'));
}
function panelCall(path) {
  return request(`${serverBase()}/panel/${path}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${store.get('bt_token', true)}` } });
}
function panelAction(action, payload) {
  return panelCall(`api?${new URLSearchParams({ action, payload: JSON.stringify(payload || {}) })}`).then((b) => b.data);
}
const view = (name, params = {}) => STATIC
  ? panelAction(name, params.target !== undefined ? { target: Number(params.target) } : {})
  : api(`/api/data?${new URLSearchParams({ view: name, ...params })}`).then((b) => b.data);
const act = (action, payload = {}) => STATIC
  ? panelAction(action, payload)
  : api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf }, body: JSON.stringify({ action, payload }) }).then((b) => b.data);
const getSession = () => STATIC ? panelCall('session') : api('/api/session');
async function doLogin(server, username, password) {
  if (!STATIC) return api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const base = FIXED_SERVER || String(server || '').trim().replace(/\/+$/, '');
  if (!/^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)(\/.*)?$/.test(base)) throw new Error('Enter your server address, e.g. https://xxxx.users.cfx.re/black_team_development');
  const creds = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  const body = await request(`${base}/panel/login`, { headers: { Accept: 'application/json', Authorization: `Basic ${creds}` } }, true);
  store.set('bt_server', base); store.set('bt_token', body.token, true);
  return body;
}
async function doLogout() {
  try { if (STATIC) await panelCall('logout'); else await api('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': state.csrf } }); } catch (_) { /* ignore */ }
  store.set('bt_token', '', true);
}

// ------------------------------------------------------------- helpers --
function toast(title, text = '', type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ti">${type === 'error' ? '⚠' : '✓'}</span><div><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</div>`;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}
function parseTime(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000);
  const s = String(v).includes('T') ? String(v) : String(v).replace(' ', 'T') + 'Z';
  const d = new Date(s); return isNaN(d) ? null : d;
}
function ago(v) {
  const d = parseTime(v); if (!d) return '—';
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const fullTime = (v) => { const d = parseTime(v); return d ? d.toLocaleString() : '—'; };
const initials = (n) => String(n || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
const actionBadge = (a) => `<span class="badge ${esc(a || 'log')}">${esc((a || 'log').toUpperCase())}</span>`;
const catTag = (code) => `<span class="cat ${catOf(code)}">${esc(CATEGORY_LABEL[catOf(code)])}</span>`;
const pingClass = (p) => (p < 80 ? 'good' : p < 160 ? 'mid' : 'bad');
function applyBars(root = document) { root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.w)))}%`; }); }
function clearTimers() { state.timers.forEach(clearInterval); state.timers = []; state.watch = false; }
function every(ms, fn) { state.timers.push(setInterval(() => { if (!document.hidden) fn(); }, ms)); }
// Re-render only when the data changed, so periodic refreshes never swap
// elements out from under the user's cursor.
const signatures = {};
function changed(key, data) {
  const sig = JSON.stringify(data);
  if (signatures[key] === sig) return false;
  signatures[key] = sig; return true;
}
function emptyRow(cols, title, text) { return `<tr><td colspan="${cols}"><div class="empty"><b>${esc(title)}</b>${esc(text)}</div></td></tr>`; }
function errorBox(e) {
  const offline = state.server && !state.server.connected;
  return `<div class="card"><div class="empty"><b>${offline ? 'Your FiveM server is offline' : 'Could not load this page'}</b>${esc(e.message)}<br><br><button class="btn" data-reload>Try again</button></div></div>`;
}

// -------------------------------------------------------- auth & shell --
function showLogin() {
  clearTimers();
  $('#app').hidden = true; $('#login').hidden = false;
  if (STATIC && !FIXED_SERVER) {
    // The address box stays hidden behind "Server settings"; it is only
    // needed once, then the browser remembers it.
    $('#server-toggle').hidden = false;
    const input = $('#login-form input[name=server]');
    if (!input.value) input.value = serverBase();
  }
  setTimeout(() => $('#login-form input[name=username]').focus(), 50);
}
function showServerField(message) {
  $('#server-field').hidden = false;
  $('#server-toggle').hidden = true;
  if (message) $('#login-error').textContent = message;
  $('#login-form input[name=server]').focus();
}
$('#server-toggle').addEventListener('click', () => showServerField());
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector('button'); btn.disabled = true; $('#login-error').textContent = '';
  if (STATIC && !FIXED_SERVER && !String(f.get('server') || '').trim()) {
    btn.disabled = false;
    return showServerField('First time only: enter your server address (type web_baseUrl in your server console to find it).');
  }
  try {
    await doLogin(f.get('server'), f.get('username'), f.get('password'));
    e.target.querySelector('input[name=password]').value = '';
    await boot();
  } catch (err) { $('#login-error').textContent = err.message; }
  btn.disabled = false;
});
$('#logout').addEventListener('click', async () => { await doLogout(); showLogin(); });
$('#refresh').addEventListener('click', () => go(state.page));
$('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

function renderNav() {
  $('#nav').innerHTML = PAGES.map((p) => p.group ? `<div class="nav-group">${p.group}</div>`
    : `<a class="nav-item ${state.page === p.id ? 'active' : ''}" href="#/${p.id}"><span class="ic">${p.ic}</span>${p.label}${p.id === 'detections' ? '<span class="count" id="det-count" hidden></span>' : ''}</a>`).join('');
}
function setServer(server) {
  state.server = server;
  $('#server-name').textContent = server.name;
  $('#server-state').textContent = server.mode === 'demo' ? 'Demo data' : server.connected ? 'Connected' : 'Not connected';
  $('#server-pill').className = `server-pill ${server.connected ? 'on' : 'off'}`;
}
async function boot() {
  if (STATIC && !store.get('bt_token', true)) return showLogin();
  try {
    const s = await getSession();
    state.csrf = s.csrf || ''; state.user = s.user; setServer(s.server);
    $('#user-name').textContent = s.user.username;
    $('#user-role').textContent = s.user.role === 'owner' ? 'Owner' : 'Staff';
    $('#avatar').textContent = initials(s.user.username);
    $('#login').hidden = true; $('#app').hidden = false;
    every(15000, async () => { try { const x = await getSession(); setServer(x.server); } catch (_) { /* request() marks offline */ } });
    route();
  } catch (_) { showLogin(); }
}
window.addEventListener('hashchange', route);
function route() {
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'overview';
  go(PAGES.some((p) => p.id === id) ? id : 'overview');
}
async function go(page) {
  const sessionTimer = state.timers[0];
  state.timers.slice(1).forEach(clearInterval); state.timers = sessionTimer ? [sessionTimer] : []; state.watch = false;
  state.page = page; renderNav(); $('#sidebar').classList.remove('open');
  const meta = PAGES.find((p) => p.id === page);
  $('#page-title').textContent = meta.label;
  $('#crumb').textContent = `Control center · ${PAGES.slice(0, PAGES.indexOf(meta)).reverse().find((p) => p.group)?.group || ''}`;
  // Fresh #view element so listeners from the previous page are dropped.
  const fresh = $('#view').cloneNode(false);
  $('#view').replaceWith(fresh);
  fresh.addEventListener('click', (e) => { if (e.target.closest('[data-reload]')) go(state.page); });
  $('#view').innerHTML = '<div class="card"><div class="card-body"><div class="skeleton"></div><br><div class="skeleton"></div><br><div class="skeleton"></div></div></div>';
  try { await PAGE[page](); } catch (e) { $('#view').innerHTML = errorBox(e); }
  applyBars($('#view'));
}
// --------------------------------------------------------------- pages --
const PAGE = {};

function feedHtml(rows, limit = 12) {
  if (!rows.length) return '<div class="empty"><b>All quiet</b>No detections yet.</div>';
  return `<div class="feed">${rows.slice(0, limit).map((d) => `
    <div class="feed-item ${state.seenDetections.size && !state.seenDetections.has(d.detection_id) ? 'new-flash' : ''}">
      <div class="feed-icon ${esc(d.action)}">${d.action === 'ban' || d.action === 'tempban' ? '⛔' : d.action === 'kick' ? '⏏' : '⚡'}</div>
      <div><div class="title"><span class="code">${esc(d.detection)}</span>${actionBadge(d.action)}${catTag(d.detection)}</div>
      <div class="desc"><b>${esc(d.player_name)}</b> — ${esc(d.reason)}</div></div>
      <time title="${esc(fullTime(d.created_at))}">${ago(d.created_at)}</time>
    </div>`).join('')}</div>`;
}
function rememberDetections(rows) {
  const fresh = rows.filter((d) => !state.seenDetections.has(d.detection_id));
  const first = state.seenDetections.size === 0;
  rows.forEach((d) => state.seenDetections.add(d.detection_id));
  if (!first && fresh.length) {
    const serious = fresh.filter((d) => d.action !== 'log');
    if (serious.length) toast(`${serious[0].detection}: ${serious[0].player_name}`, `${serious[0].action.toUpperCase()} — ${serious[0].reason}`, 'error');
    const badge = $('#det-count'); if (badge && state.page !== 'detections') { badge.hidden = false; badge.textContent = String(Number(badge.textContent || 0) + fresh.length); }
  }
}

PAGE.overview = async () => {
  const d = await view('dashboard');
  rememberDetections(d.detections || []);
  const st = d.stats || {};
  const cats = {};
  for (const x of d.detections || []) cats[catOf(x.detection)] = (cats[catOf(x.detection)] || 0) + 1;
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = Math.max(1, ...topCats.map((c) => c[1]));
  $('#view').innerHTML = `
    <div class="kpis">
      <div class="kpi green"><div class="label"><i>☺</i>Players online</div><div class="value">${st.online ?? 0}<small> / ${st.maxPlayers ?? '—'}</small></div><div class="hint">Live from the game server</div></div>
      <div class="kpi red"><div class="label"><i>⚡</i>Detections</div><div class="value">${(st.detections ?? 0).toLocaleString()}</div><div class="hint">All time</div></div>
      <div class="kpi amber"><div class="label"><i>⛔</i>Active bans</div><div class="value">${st.activeBans ?? 0}</div><div class="hint">${st.warnings ?? 0} warnings issued</div></div>
      <div class="kpi blue"><div class="label"><i>⛨</i>Protections</div><div class="value">${d.protectionsEnabled ?? 0}<small> / ${d.protectionsTotal ?? 0}</small></div><div class="hint">Enabled checks</div></div>
    </div>
    <div class="grid two">
      <div class="card"><div class="card-head"><h3>Live detections</h3><span class="sub">updates every 5 s</span><span class="spacer"></span><a class="btn sm ghost" href="#/detections">View all →</a></div><div id="ov-feed">${feedHtml(d.detections || [])}</div></div>
      <div class="grid">
        <div class="card"><div class="card-head"><h3>Protection status</h3></div><div class="card-body status-list">
          <div class="status-row"><span class="dot ${state.server?.connected ? 'on' : ''}"></span><div class="grow"><b>Game server</b><small>${esc(d.serverName || state.server?.name)}</small></div>${state.server?.connected ? '<span class="badge green">ONLINE</span>' : '<span class="badge red">OFFLINE</span>'}</div>
          <div class="status-row"><div class="grow"><b>Automatic punishments</b><small>Graduated strikes, then action</small></div>${d.automaticActions && !d.observationMode ? '<span class="badge green">ACTIVE</span>' : '<span class="badge amber">OBSERVE ONLY</span>'}</div>
          <div class="status-row"><div class="grow"><b>Ban evidence</b><small>Video clip recorded on every ban</small></div><span class="badge violet">CLIPS</span></div>
        </div></div>
        <div class="card"><div class="card-head"><h3>Recent threats by category</h3></div><div class="card-body status-list">
          ${topCats.length ? topCats.map(([c, n]) => `<div><div class="toolbar"><span class="cat ${c}">${esc(CATEGORY_LABEL[c])}</span><span class="spacer"></span><b>${n}</b></div><div class="bar hp"><i data-w="${(n / maxCat) * 100}"></i></div></div>`).join('') : '<div class="muted">No recent detections.</div>'}
        </div></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>Latest bans</h3><span class="spacer"></span><a class="btn sm ghost" href="#/evidence">Bans & evidence →</a></div>
      <div class="table-wrap"><table><thead><tr><th>Player</th><th>Reason</th><th class="hide-sm">When</th><th></th></tr></thead><tbody>
      ${(d.bans || []).slice(0, 6).map(banRow).join('') || emptyRow(4, 'No bans', 'Nobody has been banned yet.')}
      </tbody></table></div></div>`;
  bindBanRows();
  changed('overview', d.detections || []);
  every(5000, async () => {
    try {
      const x = await view('dashboard');
      if (!changed('overview', x.detections || [])) return;
      const feed = $('#ov-feed'); if (feed) feed.innerHTML = feedHtml(x.detections || []);
      rememberDetections(x.detections || []);
    } catch (_) { /* keep last view */ }
  });
};

PAGE.detections = async () => {
  const badge = $('#det-count'); if (badge) { badge.hidden = true; badge.textContent = ''; }
  let rows = (await view('detections')).detections || [];
  rememberDetections(rows);
  const draw = () => {
    const counts = {};
    rows.forEach((r) => { counts[catOf(r.detection)] = (counts[catOf(r.detection)] || 0) + 1; });
    const q = state.search.toLowerCase();
    const list = rows.filter((r) => (state.filter === 'all' || catOf(r.detection) === state.filter || (state.filter === 'punished' && r.action !== 'log'))
      && (!q || `${r.player_name} ${r.detection} ${r.reason}`.toLowerCase().includes(q)));
    $('#det-chips').innerHTML = [['all', 'All', rows.length], ['punished', 'Punished', rows.filter((r) => r.action !== 'log').length],
      ...Object.keys(CATEGORY_LABEL).filter((c) => counts[c]).map((c) => [c, CATEGORY_LABEL[c], counts[c]])]
      .map(([id, label, n]) => `<button class="chip ${state.filter === id ? 'active' : ''}" data-filter="${id}">${esc(label)} <span class="n">${n}</span></button>`).join('');
    $('#det-body').innerHTML = list.map((r) => `<tr>
      <td class="nowrap"><span class="code">${esc(r.detection)}</span><br>${catTag(r.detection)}</td>
      <td><b>${esc(r.player_name)}</b></td>
      <td><div class="reason">${esc(r.reason)}</div></td>
      <td>${actionBadge(r.action)}</td>
      <td class="nowrap muted" title="${esc(fullTime(r.created_at))}">${ago(r.created_at)}</td></tr>`).join('') || emptyRow(5, 'Nothing matches', 'Try another filter or search.');
  };
  $('#view').innerHTML = `<div class="card"><div class="card-head"><h3>Detection log</h3><span class="sub">Newest 100 · refreshes every 5 s</span></div>
    <div class="card-body toolbar"><input class="input" id="det-search" placeholder="Search player, detection or reason…" value="${esc(state.search)}"></div>
    <div class="card-body chips" id="det-chips"></div>
    <div class="table-wrap"><table><thead><tr><th>Detection</th><th>Player</th><th>Evidence</th><th>Action</th><th>When</th></tr></thead><tbody id="det-body"></tbody></table></div></div>`;
  draw();
  $('#det-search').addEventListener('input', (e) => { state.search = e.target.value; draw(); });
  $('#det-chips').addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) { state.filter = b.dataset.filter; draw(); } });
  changed('detections', rows);
  every(5000, async () => { try { const next = (await view('detections')).detections || []; if (changed('detections', next)) { rows = next; rememberDetections(rows); draw(); } } catch (_) { /* ignore */ } });
};

function playerRow(p) {
  return `<tr class="clickable" data-player="${p.id}">
    <td><div class="player-cell"><span class="pavatar ${p.isAdmin ? 'admin' : ''}">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><small>ID ${p.id}${p.isAdmin ? ' · Admin' : ''}</small></div></div></td>
    <td class="hide-sm">${esc(p.job || '—')}</td>
    <td><div class="bars"><div class="bar hp" title="Health ${p.health}"><i data-w="${Math.max(0, (p.health - 100))}"></i></div><div class="bar ar" title="Armor ${p.armor}"><i data-w="${p.armor}"></i></div></div></td>
    <td class="hide-sm muted">${esc(p.activity || '')}</td>
    <td><span class="ping ${pingClass(p.ping)}">${p.ping} ms</span></td>
    <td><button class="btn sm" data-player="${p.id}">Manage</button></td></tr>`;
}
PAGE.players = async () => {
  let players = (await view('players')).players || [];
  const draw = () => {
    const q = state.search.toLowerCase();
    const list = players.filter((p) => !q || `${p.name} ${p.id} ${p.job}`.toLowerCase().includes(q));
    $('#pl-body').innerHTML = list.map(playerRow).join('') || emptyRow(6, 'No players', state.server?.connected ? 'Nobody matches.' : 'The game server is not connected.');
    $('#pl-count').textContent = `${players.length} online`;
    applyBars($('#pl-body'));
  };
  $('#view').innerHTML = `<div class="card"><div class="card-head"><h3>Online players</h3><span class="sub" id="pl-count"></span></div>
    <div class="card-body toolbar"><input class="input" id="pl-search" placeholder="Search name, server ID or job…" value="${esc(state.search)}"></div>
    <div class="table-wrap"><table><thead><tr><th>Player</th><th class="hide-sm">Job</th><th>Health / armor</th><th class="hide-sm">Activity</th><th>Ping</th><th></th></tr></thead><tbody id="pl-body"></tbody></table></div></div>`;
  draw();
  $('#pl-search').addEventListener('input', (e) => { state.search = e.target.value; draw(); });
  $('#pl-body').addEventListener('click', (e) => { const r = e.target.closest('[data-player]'); if (r) openPlayer(Number(r.dataset.player)); });
  changed('players', players);
  every(6000, async () => { try { const next = (await view('players')).players || []; if (changed('players', next)) { players = next; draw(); } } catch (_) { /* ignore */ } });
};

PAGE.monitor = async () => {
  let players = (await view('monitor')).players || [];
  $('#view').innerHTML = `<div class="notice">Screen monitor shows a fresh screenshot of the selected player about every second. It is for checking suspects, not continuous recording.</div>
    <div class="monitor">
      <div class="card"><div class="card-head"><h3 id="mon-title">Select a player</h3><span class="spacer"></span><button class="btn sm primary" id="mon-watch" disabled>▶ Watch</button><button class="btn sm" id="mon-manage" disabled>Manage</button></div>
        <div class="card-body"><div class="screen" id="mon-screen"><div class="placeholder">Pick a player on the right to view their screen.</div></div></div></div>
      <div class="card"><div class="card-head"><h3>Players</h3><span class="sub">${players.length} online</span></div><div class="player-list" id="mon-list"></div></div>
    </div>`;
  const drawList = () => {
    $('#mon-list').innerHTML = players.map((p) => `<button class="player-tile ${state.monitorTarget === p.id ? 'active' : ''}" data-id="${p.id}">
      <span class="pavatar ${p.isAdmin ? 'admin' : ''}">${esc(initials(p.name))}</span><span class="grow"><b>${esc(p.name)}</b><small>ID ${p.id} · ${esc(p.activity || '')}</small></span><span class="ping ${pingClass(p.ping)}">${p.ping}</span></button>`).join('') || '<div class="empty">No players online.</div>';
  };
  const select = (id) => {
    state.monitorTarget = id; state.watch = false; drawList();
    const p = players.find((x) => x.id === id);
    $('#mon-title').textContent = p ? `${p.name} (ID ${p.id})` : 'Select a player';
    $('#mon-watch').disabled = !p; $('#mon-manage').disabled = !p; $('#mon-watch').textContent = '▶ Watch';
    $('#mon-screen').innerHTML = '<div class="placeholder">Press Watch to start viewing.</div>';
  };
  const loop = async () => {
    while (state.watch && state.page === 'monitor') {
      try {
        const shot = await act('playerScreenshot', { target: state.monitorTarget });
        if (!state.watch) break;
        $('#mon-screen').innerHTML = `<img alt="Player screen" src="${esc(shot.image)}"><div class="overlay"><span class="badge red">● LIVE</span><span class="badge gray">${new Date().toLocaleTimeString()}</span></div>`;
      } catch (e) { toast('Screen capture failed', e.message, 'error'); state.watch = false; $('#mon-watch').textContent = '▶ Watch'; break; }
      await new Promise((r) => setTimeout(r, 900));
    }
  };
  drawList();
  if (state.monitorTarget && players.some((p) => p.id === state.monitorTarget)) select(state.monitorTarget);
  $('#mon-list').addEventListener('click', (e) => { const t = e.target.closest('[data-id]'); if (t) select(Number(t.dataset.id)); });
  $('#mon-watch').addEventListener('click', () => { state.watch = !state.watch; $('#mon-watch').textContent = state.watch ? '■ Stop' : '▶ Watch'; if (state.watch) loop(); });
  $('#mon-manage').addEventListener('click', () => openPlayer(state.monitorTarget));
  changed('monitor', players);
  every(6000, async () => { try { const next = (await view('monitor')).players || []; if (changed('monitor', next)) { players = next; drawList(); } } catch (_) { /* ignore */ } });
};

function banRow(b) {
  const expired = b.expires_at && parseTime(b.expires_at) < new Date();
  const status = !Number(b.active) ? '<span class="badge gray">UNBANNED</span>' : expired ? '<span class="badge gray">EXPIRED</span>' : b.expires_at ? '<span class="badge amber">TEMP</span>' : '<span class="badge red">PERMANENT</span>';
  return `<tr>
    <td><div class="player-cell"><span class="pavatar">${esc(initials(b.player_name))}</span><div><b>${esc(b.player_name)}</b><small class="mono">#${b.ban_id} · ${esc(String(b.primary_identifier || '').slice(0, 26))}</small></div></div></td>
    <td><div class="reason">${esc(b.reason)}</div><small class="muted">by ${esc(b.banned_by)}</small></td>
    <td class="nowrap muted hide-sm" title="${esc(fullTime(b.created_at))}">${ago(b.created_at)}<br>${status}</td>
    <td class="nowrap">${Number(b.has_screenshot) ? `<button class="btn sm primary" data-clip="${b.ban_id}">▶ Clip</button>` : '<span class="muted">No clip</span>'}
      ${Number(b.active) && state.user?.role === 'owner' ? `<button class="btn sm ghost" data-unban="${b.ban_id}">Unban</button>` : ''}</td></tr>`;
}
function bindBanRows() {
  $('#view').addEventListener('click', async (e) => {
    const clip = e.target.closest('[data-clip]');
    if (clip) return openClip(Number(clip.dataset.clip));
    const un = e.target.closest('[data-unban]');
    if (un && await confirmBox('Remove this ban?', `Ban #${un.dataset.unban} will be lifted and the player can join again.`, 'Unban')) {
      try { const r = await act('unban', { banId: Number(un.dataset.unban) }); toast('Unbanned', r.message); go(state.page); } catch (err) { toast('Unban failed', err.message, 'error'); }
    }
  });
}
PAGE.evidence = async () => {
  const bans = (await view('bans')).bans || [];
  let q = '';
  const draw = () => {
    const list = bans.filter((b) => !q || `${b.player_name} ${b.reason} ${b.primary_identifier} ${b.ban_id}`.toLowerCase().includes(q));
    $('#ban-body').innerHTML = list.map(banRow).join('') || emptyRow(4, 'No bans', 'Nothing matches.');
  };
  $('#view').innerHTML = `<div class="kpis">
      <div class="kpi red"><div class="label"><i>⛔</i>Active bans</div><div class="value">${bans.filter((b) => Number(b.active)).length}</div></div>
      <div class="kpi blue"><div class="label"><i>▶</i>With video evidence</div><div class="value">${bans.filter((b) => Number(b.has_screenshot)).length}</div></div>
      <div class="kpi amber"><div class="label"><i>⏱</i>Temporary</div><div class="value">${bans.filter((b) => b.expires_at).length}</div></div></div>
    <div class="card"><div class="card-head"><h3>Ban history</h3><span class="sub">Every automatic and manual ban records a short clip of the player's screen</span></div>
    <div class="card-body toolbar"><input class="input" id="ban-search" placeholder="Search player, identifier, reason or ban #…"></div>
    <div class="table-wrap"><table><thead><tr><th>Player</th><th>Reason</th><th class="hide-sm">When</th><th>Evidence</th></tr></thead><tbody id="ban-body"></tbody></table></div></div>`;
  draw();
  $('#ban-search').addEventListener('input', (e) => { q = e.target.value.toLowerCase(); draw(); });
  bindBanRows();
};

PAGE.warnings = async () => {
  const rows = (await view('warnings')).warnings || [];
  $('#view').innerHTML = `<div class="card"><div class="card-head"><h3>Warnings</h3><span class="sub">${rows.length} newest</span></div><div class="table-wrap"><table>
    <thead><tr><th>Player</th><th>Reason</th><th>By</th><th>When</th></tr></thead><tbody>
    ${rows.map((w) => `<tr><td><b>${esc(w.player_name)}</b></td><td><div class="reason">${esc(w.reason)}</div></td><td class="muted">${esc(w.warned_by)}</td><td class="muted nowrap">${ago(w.created_at)}</td></tr>`).join('') || emptyRow(4, 'No warnings', 'Nobody has been warned.')}
    </tbody></table></div></div>`;
};

PAGE.protections = async () => {
  const d = await view('protections');
  const owner = state.user?.role === 'owner';
  const groups = {};
  for (const p of d.protections || []) (groups[catOf(p.code)] ||= []).push(p);
  $('#view').innerHTML = `
    ${!owner ? '<div class="notice">Only the owner can change protection settings.</div>' : ''}
    <div class="card"><div class="card-body status-list"><div class="status-row"><div class="grow"><b>Observation mode</b><small>Log everything but never warn, kick or ban automatically. Use while testing new settings.</small></div>
      <label class="switch"><input type="checkbox" id="obs" ${d.observationMode ? 'checked' : ''} ${owner ? '' : 'disabled'}><span></span></label></div></div></div>
    ${Object.keys(CATEGORY_LABEL).filter((c) => groups[c]).map((c) => `<div class="card"><div class="card-head"><span class="cat ${c}"></span><h3>${esc(CATEGORY_LABEL[c])}</h3><span class="sub">${groups[c].filter((p) => p.enabled).length}/${groups[c].length} enabled</span></div>
      <div class="prot-group">${groups[c].map((p) => `<div class="prot" data-code="${esc(p.code)}">
        <label class="switch"><input type="checkbox" class="p-en" ${p.enabled ? 'checked' : ''} ${owner ? '' : 'disabled'}><span></span></label>
        <div class="grow"><span class="code">${esc(p.code)}</span></div>
        <select class="input p-act" ${owner ? '' : 'disabled'}>${['log', 'warn', 'kick', 'tempban', 'ban'].map((a) => `<option ${p.action === a ? 'selected' : ''} value="${a}">${a.toUpperCase()}</option>`).join('')}</select></div>`).join('')}</div></div>`).join('')}`;
  $('#obs')?.addEventListener('change', async (e) => {
    try { await act('observationMode', { enabled: e.target.checked }); toast('Observation mode updated'); } catch (err) { e.target.checked = !e.target.checked; toast('Not saved', err.message, 'error'); }
  });
  $('#view').addEventListener('change', async (e) => {
    const row = e.target.closest('.prot'); if (!row) return;
    const payload = { code: row.dataset.code, enabled: $('.p-en', row).checked, action: $('.p-act', row).value };
    try { const r = await act('protectionUpdate', payload); toast('Saved', r.message); } catch (err) { toast('Not saved', err.message, 'error'); go('protections'); }
  });
};

PAGE.lists = async () => {
  const lists = (await view('lists')).lists || {};
  const owner = state.user?.role === 'owner';
  const labels = { resources: 'Allowed resources', weapons: 'Blacklisted weapons', vehicles: 'Blacklisted vehicles', peds: 'Blacklisted peds', objects: 'Blacklisted objects', events: 'Blocked events', identifiers: 'Blacklisted identifiers' };
  $('#view').innerHTML = `<div class="list-grid">${Object.keys(lists).map((k) => `<div class="card" data-list="${esc(k)}">
    <div class="card-head"><h3>${esc(labels[k] || k)}</h3><span class="sub">${(lists[k] || []).length}</span></div>
    <div class="list-items">${(lists[k] || []).map((v) => `<span class="tag">${esc(v)}${owner ? `<button data-remove="${esc(v)}" title="Remove">×</button>` : ''}</span>`).join('') || '<span class="muted">Empty</span>'}</div>
    ${owner ? `<form class="list-add"><input class="input" maxlength="128" placeholder="Add entry…" required><button class="btn sm primary">Add</button></form>` : ''}</div>`).join('')}</div>`;
  $('#view').addEventListener('submit', async (e) => {
    e.preventDefault();
    const card = e.target.closest('[data-list]'); const input = $('input', e.target);
    try { await act('listAdd', { category: card.dataset.list, item: input.value.trim() }); toast('Added', input.value); go('lists'); } catch (err) { toast('Not added', err.message, 'error'); }
  });
  $('#view').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    const card = b.closest('[data-list]');
    try { await act('listRemove', { category: card.dataset.list, item: b.dataset.remove }); toast('Removed', b.dataset.remove); go('lists'); } catch (err) { toast('Not removed', err.message, 'error'); }
  });
};

PAGE.admins = async () => {
  const d = await view('admins');
  $('#view').innerHTML = `<div class="notice">Admins are added <b>only</b> in <span class="mono">server_config.lua → Config.Server.AdminIdentifiers</span>, then restart the resource. ESX groups and this panel cannot grant admin. Admins are exempt from all detections.</div>
    <div class="card"><div class="card-head"><h3>Configured admins</h3><span class="sub">${(d.admins || []).length}</span></div><div class="table-wrap"><table><thead><tr><th>Identifier</th><th>Online as</th></tr></thead><tbody>
    ${(d.admins || []).map((a) => `<tr><td class="mono">${esc(a.identifier)}</td><td>${a.name === 'Offline' ? '<span class="badge gray">OFFLINE</span>' : `<span class="badge green">${esc(a.name)}</span>`}</td></tr>`).join('') || emptyRow(2, 'No admins', 'Add identifiers in server_config.lua.')}
    </tbody></table></div></div>`;
};

PAGE.logs = async () => {
  const rows = (await view('actions')).actions || [];
  $('#view').innerHTML = `<div class="card"><div class="card-head"><h3>Staff audit log</h3><span class="sub">Every admin action from the game and this panel</span><span class="spacer"></span><button class="btn sm" id="csv">Download CSV</button></div><div class="table-wrap"><table>
    <thead><tr><th>Staff</th><th>Action</th><th>Target</th><th>Details</th><th>When</th></tr></thead><tbody>
    ${rows.map((a) => `<tr><td><b>${esc(a.admin_name)}</b></td><td><span class="badge ${['ban', 'tempban'].includes(a.action) ? 'red' : a.action === 'kick' ? 'amber' : 'blue'}">${esc(a.action)}</span></td><td>${esc(a.target_name || '—')}</td><td><div class="reason">${esc(a.reason)}</div></td><td class="muted nowrap" title="${esc(fullTime(a.created_at))}">${ago(a.created_at)}</td></tr>`).join('') || emptyRow(5, 'No staff actions yet', '')}
    </tbody></table></div></div>`;
  $('#csv').addEventListener('click', () => {
    const csv = [['id', 'staff', 'action', 'target', 'details', 'time'], ...rows.map((a) => [a.action_id, a.admin_name, a.action, a.target_name, a.reason, a.created_at])]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    download(new Blob([csv], { type: 'text/csv' }), 'blackteam-audit-log.csv');
  });
};

// ------------------------------------------------------- player drawer --
async function openPlayer(id) {
  const drawer = $('#drawer');
  drawer.hidden = false;
  drawer.innerHTML = '<div class="drawer-panel"><div class="drawer-body"><div class="skeleton"></div></div></div>';
  let p;
  try { p = (await act('playerDetails', { target: id })).player; } catch (e) { drawer.hidden = true; return toast('Could not open player', e.message, 'error'); }
  drawer.innerHTML = `<div class="drawer-panel">
    <div class="drawer-head"><span class="pavatar">${esc(initials(p.name))}</span><div><h3>${esc(p.name)}</h3><span class="muted">Server ID ${p.id} · ${esc(p.job)}${p.grade ? ` · ${esc(p.grade)}` : ''}</span></div><span class="spacer"></span><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="drawer-body">
      <div class="facts">
        <div class="fact"><small>Health</small><b>${p.health}</b></div><div class="fact"><small>Armor</small><b>${p.armor}</b></div>
        <div class="fact"><small>Detections</small><b>${p.detectionCount}</b></div><div class="fact"><small>Warnings</small><b>${p.warningCount}</b></div>
        <div class="fact"><small>Ping</small><b>${p.ping} ms</b></div><div class="fact"><small>Position</small><b class="mono">${p.coords ? `${p.coords.x.toFixed(0)}, ${p.coords.y.toFixed(0)}, ${p.coords.z.toFixed(0)}` : '—'}</b></div>
      </div>
      <div class="section-title">Actions</div>
      <div class="action-grid">
        <button class="btn" data-a="warn">Warn</button><button class="btn" data-a="freeze">Freeze</button><button class="btn" data-a="unfreeze">Unfreeze</button>
        <button class="btn" data-a="goto">Go to</button><button class="btn" data-a="bring">Bring</button><button class="btn" data-a="screen">Screen</button>
        <button class="btn warn" data-a="kick">Kick</button><button class="btn danger" data-a="tempban">Temp ban</button><button class="btn danger" data-a="ban">Ban</button>
      </div>
      <div class="section-title">Identifiers</div>
      <div class="id-list">${(p.identifiers || []).map((i) => `<div class="id-row"><span>${esc(i)}</span><button class="btn sm ghost" data-copy="${esc(i)}">Copy</button></div>`).join('')}</div>
      <div class="section-title">Recent detections</div>
      <div class="card">${feedHtml(p.recentDetections || [], 5)}</div>
    </div></div>`;
  drawer.onclick = async (e) => {
    if (e.target === drawer || e.target.closest('[data-close]')) { drawer.hidden = true; return; }
    const copy = e.target.closest('[data-copy]');
    if (copy) { navigator.clipboard?.writeText(copy.dataset.copy); toast('Copied', copy.dataset.copy); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'screen') { state.monitorTarget = p.id; drawer.hidden = true; location.hash = '#/monitor'; return; }
    const needsReason = ['warn', 'kick', 'tempban', 'ban'].includes(a);
    const form = needsReason ? await reasonBox(a, p.name) : { reason: '' };
    if (!form) return;
    try {
      const r = await act(a, { target: p.id, reason: form.reason, minutes: form.minutes });
      toast(`${a[0].toUpperCase()}${a.slice(1)} done`, r?.message || '');
      if (['kick', 'ban', 'tempban'].includes(a)) drawer.hidden = true;
    } catch (err) { toast(`${a} failed`, err.message, 'error'); }
  };
}

// --------------------------------------------------------------- modals --
function modal(html, wide = false) {
  const m = $('#modal'); m.hidden = false;
  m.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}">${html}</div>`;
  return m;
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; m.onclick = null; }
function confirmBox(title, text, label = 'Confirm') {
  return new Promise((resolve) => {
    const m = modal(`<div class="modal-head"><h3>${esc(title)}</h3></div><div class="modal-body"><p class="muted">${esc(text)}</p></div>
      <div class="modal-foot"><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>${esc(label)}</button></div>`);
    m.onclick = (e) => { if (e.target.closest('[data-yes]')) { closeModal(); resolve(true); } else if (e.target === m || e.target.closest('[data-no]')) { closeModal(); resolve(false); } };
  });
}
function reasonBox(action, name) {
  return new Promise((resolve) => {
    const isBan = action === 'ban' || action === 'tempban';
    const m = modal(`<form><div class="modal-head"><h3>${esc(action === 'tempban' ? 'Temporary ban' : action[0].toUpperCase() + action.slice(1))} · ${esc(name)}</h3></div>
      <div class="modal-body">
        <label>Reason<textarea class="input" name="reason" maxlength="250" required placeholder="Explain why (players see this)"></textarea></label>
        ${action === 'tempban' ? `<label>Duration<select class="input" name="minutes"><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440" selected>1 day</option><option value="4320">3 days</option><option value="10080">7 days</option><option value="43200">30 days</option></select></label>` : ''}
        ${isBan ? '<div class="notice red">A short clip of the player\'s screen is recorded before the ban and saved as evidence.</div>' : ''}
      </div><div class="modal-foot"><button type="button" class="btn ghost" data-no>Cancel</button><button class="btn ${isBan || action === 'kick' ? 'primary' : ''}" type="submit">${esc(action === 'tempban' ? 'Temp ban' : action[0].toUpperCase() + action.slice(1))}</button></div></form>`);
    setTimeout(() => $('textarea', m).focus(), 30);
    $('form', m).onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); closeModal(); resolve({ reason: String(f.get('reason')), minutes: Number(f.get('minutes')) || undefined }); };
    m.onclick = (e) => { if (e.target === m || e.target.closest('[data-no]')) { closeModal(); resolve(null); } };
  });
}

// ----------------------------------------------------------- clip player --
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function openClip(banId) {
  const m = modal('<div class="modal-body"><div class="skeleton"></div></div>', true);
  let clip;
  try { clip = await view('banScreenshot', { target: banId }); } catch (e) { closeModal(); return toast('Clip unavailable', e.message, 'error'); }
  const frames = clip.frames?.length ? clip.frames : [{ at: 0, image: clip.image }];
  const images = await Promise.all(frames.map((f) => new Promise((res) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = f.image; })));
  const total = Math.max(frames[frames.length - 1].at, 1);
  m.innerHTML = `<div class="modal-card wide">
    <div class="modal-head"><h3>Ban #${clip.banId} · ${esc(clip.player)}</h3><span class="badge violet">${frames.length} frames · ${(total / 1000).toFixed(1)} s</span><span class="spacer"></span><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">
      <div class="player-stage"><canvas width="1280" height="720"></canvas><div class="rec"><span class="badge red">● EVIDENCE</span></div><span class="stamp" id="clip-time">0.0 s</span></div>
      <div class="controls">
        <button class="btn primary" id="clip-play">▶ Play</button>
        <input type="range" id="clip-seek" min="0" max="${frames.length - 1}" value="0" aria-label="Frame">
        <select class="input" id="clip-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
        <button class="btn" id="clip-webm">⬇ Download video</button>
        <button class="btn ghost" id="clip-frame">⬇ Frame</button>
      </div>
      <div class="thumbs">${frames.map((f, i) => `<img src="${esc(f.image)}" data-i="${i}" alt="Frame ${i + 1}">`).join('')}</div>
      <div class="ev-meta"><div class="fact"><small>Recorded</small><b>${esc(fullTime(clip.createdAt))}</b></div><div class="fact"><small>Clip length</small><b>${(total / 1000).toFixed(1)} s</b></div><div class="fact"><small>Frames</small><b>${frames.length}</b></div></div>
    </div></div>`;
  const canvas = $('canvas', m), ctx = canvas.getContext('2d');
  let index = 0, playing = false, timer = null;
  const drawFrame = (i) => {
    index = i; const img = images[i];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (img) { const s = Math.min(canvas.width / img.width, canvas.height / img.height); const w = img.width * s, h = img.height * s; ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h); }
    $('#clip-seek', m).value = i; $('#clip-time', m).textContent = `${(frames[i].at / 1000).toFixed(1)} s`;
    m.querySelectorAll('.thumbs img').forEach((t) => t.classList.toggle('active', Number(t.dataset.i) === i));
  };
  const step = () => {
    if (!playing) return;
    const next = index + 1 >= frames.length ? 0 : index + 1;
    const gap = next === 0 ? 900 : Math.max(60, frames[next].at - frames[index].at);
    timer = setTimeout(() => { drawFrame(next); step(); }, gap / Number($('#clip-speed', m).value));
  };
  const setPlaying = (on) => { playing = on; clearTimeout(timer); $('#clip-play', m).textContent = on ? '❚❚ Pause' : '▶ Play'; if (on) step(); };
  drawFrame(0); setPlaying(true);
  $('#clip-play', m).onclick = () => setPlaying(!playing);
  $('#clip-seek', m).oninput = (e) => { setPlaying(false); drawFrame(Number(e.target.value)); };
  $('.thumbs', m).onclick = (e) => { const t = e.target.closest('[data-i]'); if (t) { setPlaying(false); drawFrame(Number(t.dataset.i)); } };
  $('#clip-frame', m).onclick = () => canvas.toBlob((b) => download(b, `ban-${clip.banId}-frame-${index + 1}.png`));
  $('#clip-webm', m).onclick = async () => {
    if (!window.MediaRecorder || !canvas.captureStream) return toast('Not supported', 'This browser cannot export video. Use Chrome or Edge.', 'error');
    const btn = $('#clip-webm', m); btn.disabled = true; btn.textContent = 'Recording…';
    setPlaying(false);
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => { download(new Blob(chunks, { type: 'video/webm' }), `ban-${clip.banId}-${clip.player}.webm`); btn.disabled = false; btn.textContent = '⬇ Download video'; };
    rec.start();
    for (let i = 0; i < frames.length; i++) {
      drawFrame(i);
      const gap = i + 1 < frames.length ? Math.max(80, frames[i + 1].at - frames[i].at) : 700;
      await new Promise((r) => setTimeout(r, gap));
    }
    rec.stop();
  };
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-close]')) { setPlaying(false); closeModal(); } };
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); $('#drawer').hidden = true; } });

boot();
