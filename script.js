const $ = (id) => document.getElementById(id);
const D = Store.data;
const ISLANDS = ['School', 'Work', 'Break'];
const SUBS = {
  School: 'Learning mode. Only what helps you learn.',
  Work: 'Deep work mode. One thing at a time.',
  Break: 'Rest on purpose. Come back refreshed.'
};

let current = 'School';
let tabId = null; // active tab id within the current island
const views = new Map(); // tab id -> <webview>

// ───────────────────────── helpers ─────────────────────────
function normalizeUrl(raw) {
  const v = raw.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(v) || /^localhost(:\d+)?/.test(v)) return 'https://' + v;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(v);
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}
function hostMatches(host, site) {
  const s = site.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return host === s || host.endsWith('.' + s);
}
const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
};
const save = () => Store.save();

// ───────────────────────── focus session ─────────────────────────
// phase: idle | focus | break. Timer uses endsAt so it stays accurate if the app sleeps.
const session = { phase: 'idle', endsAt: 0, island: null, startedAt: 0, extended: false, sessionAllowed: new Set(), tick: null };

function inFocus() { return session.phase === 'focus'; }

function accrueFocus() {
  if (!session.startedAt) return;
  Store.dayStats().focusSec += (Date.now() - session.startedAt) / 1000;
  session.startedAt = 0;
  save();
}

function startFocus() {
  session.phase = 'focus';
  session.island = current === 'Break' ? 'Work' : current;
  session.sessionAllowed.clear();
  session.extended = false;
  session.startedAt = Date.now();
  session.endsAt = Date.now() + D.settings.easeInMin * 60000;
  if (current !== session.island) selectIsland(session.island, true);
  runTick();
  renderTimer();
}

function startBreak() {
  accrueFocus();
  session.phase = 'break';
  session.endsAt = Date.now() + D.settings.breakMin * 60000;
  $('checkin').classList.add('hidden');
  selectIsland('Break', true);
  runTick();
  renderTimer();
  notify('Break time', 'Break sites are unlocked. Rest on purpose.');
}

function endSession() {
  accrueFocus();
  session.phase = 'idle';
  clearInterval(session.tick);
  $('checkin').classList.add('hidden');
  renderTimer();
}

function runTick() {
  clearInterval(session.tick);
  session.tick = setInterval(() => {
    if (Date.now() >= session.endsAt) return phaseEnded();
    renderTimer();
  }, 500);
}

function phaseEnded() {
  clearInterval(session.tick);
  if (session.phase === 'focus') {
    if (!session.extended) {
      // Ease-in finished: let the user choose, so momentum is theirs to keep.
      notify('Nice start', 'Keep going or take a break?');
      session.endsAt = Date.now() + 365 * 864e5; // paused on the prompt
      $('ext-btn').textContent = `Keep going +${D.settings.extendMin}`;
      $('checkin').classList.remove('hidden');
    } else {
      startBreak();
    }
  } else if (session.phase === 'break') {
    notify('Break over', 'Ready for another round?');
    endSession();
    selectIsland(session.island || 'Work', true);
  }
  renderTimer();
}

function renderTimer() {
  const idle = session.phase === 'idle';
  const awaiting = inFocus() && !$('checkin').classList.contains('hidden');
  const left = idle ? D.settings.easeInMin * 60 : awaiting ? 0 : (session.endsAt - Date.now()) / 1000;
  $('timer-display').textContent = fmt(left);
  $('phase-label').textContent = idle ? 'Ready' : session.phase === 'focus' ? `Focus · ${session.island}` : 'Break';
  $('start-btn').classList.toggle('hidden', !idle);
  $('stop-btn').classList.toggle('hidden', idle);
  $('timer-hint').textContent = idle
    ? `Starts with a gentle ${D.settings.easeInMin} minutes. You can keep going after.`
    : session.phase === 'focus' ? 'You only have to be here for now.' : 'Break sites are unlocked.';
  const t = D.tasks.find((x) => x.id === D.currentTaskId && !x.done);
  $('current-task').textContent = t ? `→ ${t.text}` : 'No task chosen';
  renderStats();
  document.title = idle ? 'ProBro' : `${fmt(left)} · ProBro`;
}

function notify(title, body) {
  try { new Notification(title, { body }); } catch (_) {}
}

// ───────────────────────── gating (the soft/hard block) ─────────────────────────
function allowed(url) {
  const host = hostOf(url);
  if (!host) return true; // about:blank, data:, etc.
  if (session.sessionAllowed.has(host)) return true;
  return D.islands[session.island].sites.some((s) => hostMatches(host, s));
}

// returns true if navigation may proceed right now
function gate(url, onContinue) {
  if (!inFocus() || allowed(url)) return true;
  const mode = D.islands[session.island].strict;
  if (mode === 'off') return true;
  const host = hostOf(url);
  Store.dayStats().blocked++;
  save();
  showGate({
    title: mode === 'hard' ? 'Locked in 🔒' : 'Pause. Take a breath.',
    body: `${host} isn't part of your ${session.island} island. Is this what you meant to do right now?`,
    hard: mode === 'hard',
    onContinue: () => {
      Store.dayStats().overrides++;
      session.sessionAllowed.add(host);
      save();
      renderStats();
      onContinue && onContinue();
    }
  });
  renderStats();
  return false;
}

let gateTimer = null;
function showGate({ title, body, hard, onContinue }) {
  $('gate-title').textContent = title;
  $('gate-body').textContent = body;
  const go = $('gate-go');
  go.classList.toggle('hidden', !!hard);
  go.disabled = true;
  let n = 10;
  clearInterval(gateTimer);
  const paint = () => {
    $('gate-count').textContent = hard ? 'Stay with it. You can do this.' : n > 0 ? `Continue unlocks in ${n}s` : '';
    go.disabled = n > 0;
  };
  paint();
  if (!hard) {
    gateTimer = setInterval(() => { n--; paint(); if (n <= 0) clearInterval(gateTimer); }, 1000);
  }
  $('gate').classList.remove('hidden');
  $('gate-back').onclick = hideGate;
  go.onclick = () => { hideGate(); onContinue && onContinue(); };
}
function hideGate() {
  clearInterval(gateTimer);
  $('gate').classList.add('hidden');
}

// ───────────────────────── islands & tabs ─────────────────────────
function selectIsland(name, force) {
  if (!force && inFocus() && name !== session.island) {
    if (!gate('https://' + name.toLowerCase() + '.island', () => selectIsland(name, true))) return;
  }
  current = name;
  document.querySelectorAll('.island-btn').forEach((b) => b.classList.toggle('active', b.dataset.island === name));
  const tabs = D.tabs[name];
  tabId = tabs.find((t) => t.id === D.activeTab[name])?.id || tabs[0]?.id || null;
  renderHome();
  renderTabs();
  renderTasks();
  showActive();
}

function renderHome() {
  const isl = D.islands[current];
  $('home-title').textContent = current;
  $('home-sub').textContent = SUBS[current];
  $('strict-select').value = isl.strict;
  const box = $('sites');
  box.innerHTML = '';
  isl.sites.forEach((s) => {
    const chip = document.createElement('div');
    chip.className = 'site';
    const open = document.createElement('button');
    open.className = 'site-open';
    open.textContent = s;
    open.onclick = () => openTab(s);
    const del = document.createElement('button');
    del.className = 'site-del';
    del.textContent = '×';
    del.title = 'Remove';
    del.onclick = () => { isl.sites = isl.sites.filter((x) => x !== s); save(); renderHome(); };
    chip.append(open, del);
    box.append(chip);
  });
}

function renderTabs() {
  const box = $('tabs');
  box.innerHTML = '';
  D.tabs[current].forEach((t) => {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === tabId ? ' active' : '');
    const label = document.createElement('button');
    label.className = 'tab-label';
    label.textContent = t.title || hostOf(t.url) || 'New tab';
    label.onclick = () => activateTab(t.id);
    const x = document.createElement('button');
    x.className = 'tab-x';
    x.textContent = '×';
    x.onclick = () => closeTab(t.id);
    el.append(label, x);
    box.append(el);
  });
}

function showActive() {
  views.forEach((wv) => wv.classList.remove('visible'));
  const tab = D.tabs[current].find((t) => t.id === tabId);
  $('home').classList.toggle('hidden', !!tab);
  $('webviews').classList.toggle('hidden', !tab);
  $('address-input').value = tab ? tab.url : '';
  if (!tab) return;
  ensureView(tab).classList.add('visible');
}

function ensureView(tab) {
  let wv = views.get(tab.id);
  if (wv) return wv;
  wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:probro');
  wv.setAttribute('allowpopups', '');
  wv.src = tab.url;
  wv.dataset.tab = tab.id;
  wv.addEventListener('did-navigate', (e) => onNav(tab, e.url));
  wv.addEventListener('did-navigate-in-page', (e) => e.isMainFrame && onNav(tab, e.url));
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; save(); renderTabs(); });
  wv.addEventListener('did-start-navigation', (e) => {
    if (!e.isMainFrame || e.isInPlace) return;
    if (!gate(e.url, () => wv.loadURL(e.url))) wv.stop();
  });
  $('webviews').append(wv);
  views.set(tab.id, wv);
  return wv;
}

function onNav(tab, url) {
  tab.url = url;
  save();
  if (tab.id === tabId) $('address-input').value = url;
}

function openTab(raw) {
  const url = normalizeUrl(raw);
  if (!url) return;
  const run = () => {
    const tab = { id: Store.uid(), url, title: '' };
    D.tabs[current].push(tab);
    D.activeTab[current] = tab.id;
    save();
    selectIsland(current, true);
  };
  if (gate(url, run)) run();
}

function activateTab(id) {
  tabId = id;
  D.activeTab[current] = id;
  save();
  renderTabs();
  showActive();
}

function closeTab(id) {
  const tabs = D.tabs[current];
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  tabs.splice(i, 1);
  views.get(id)?.remove();
  views.delete(id);
  if (tabId === id) tabId = tabs[Math.max(0, i - 1)]?.id || null;
  D.activeTab[current] = tabId;
  save();
  renderTabs();
  showActive();
}

// ───────────────────────── tasks & brain dump ─────────────────────────
function renderTasks() {
  $('tasks-island').textContent = current;
  const ul = $('task-list');
  ul.innerHTML = '';
  D.tasks.filter((t) => t.island === current).forEach((t) => {
    const li = document.createElement('li');
    li.className = (t.done ? 'done ' : '') + (t.id === D.currentTaskId ? 'now' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = t.done;
    cb.onchange = () => {
      t.done = cb.checked;
      if (t.done && D.currentTaskId === t.id) D.currentTaskId = null;
      save(); renderTasks(); renderTimer();
    };
    const txt = document.createElement('button');
    txt.className = 'task-text';
    txt.textContent = t.text;
    txt.title = 'Make this my current task';
    txt.onclick = () => { if (!t.done) { D.currentTaskId = t.id; save(); renderTasks(); renderTimer(); } };
    const del = document.createElement('button');
    del.className = 'icon-btn tiny';
    del.textContent = '×';
    del.onclick = () => {
      D.tasks = D.tasks.filter((x) => x.id !== t.id);
      if (D.currentTaskId === t.id) D.currentTaskId = null;
      save(); renderTasks(); renderTimer();
    };
    li.append(cb, txt, del);
    ul.append(li);
  });
}

function renderDump() {
  const ul = $('dump-list');
  ul.innerHTML = '';
  D.dump.slice(-5).reverse().forEach((d) => {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.textContent = d.text;
    const del = document.createElement('button');
    del.className = 'icon-btn tiny';
    del.textContent = '×';
    del.title = 'Done with this';
    del.onclick = () => { D.dump = D.dump.filter((x) => x.id !== d.id); save(); renderDump(); };
    li.append(s, del);
    ul.append(li);
  });
}

function renderStats() {
  const s = Store.dayStats();
  const live = inFocus() && session.startedAt ? (Date.now() - session.startedAt) / 1000 : 0;
  $('stat-focus').textContent = Math.round((s.focusSec + live) / 60);
  $('stat-blocked').textContent = s.blocked;
  $('stat-overrides').textContent = s.overrides;
}

// ───────────────────────── wiring ─────────────────────────
function wire() {
  document.querySelectorAll('.island-btn').forEach((b) => (b.onclick = () => selectIsland(b.dataset.island)));
  $('collapse-btn').onclick = () => $('sidebar').classList.toggle('collapsed');

  $('start-btn').onclick = startFocus;
  $('stop-btn').onclick = endSession;
  $('ext-btn').onclick = () => {
    session.extended = true;
    session.endsAt = Date.now() + D.settings.extendMin * 60000;
    $('checkin').classList.add('hidden');
    runTick();
    renderTimer();
  };
  $('brk-btn').onclick = startBreak;

  $('strict-select').onchange = (e) => {
    // Loosening a rule mid-focus is the classic escape hatch, so it waits for the session to end.
    if (inFocus() && current === session.island) {
      e.target.value = D.islands[current].strict;
      showGate({ title: 'Nice try 🙂', body: 'Strictness can be changed after your session ends.', hard: true });
      return;
    }
    D.islands[current].strict = e.target.value;
    save();
  };

  $('site-form').onsubmit = (e) => {
    e.preventDefault();
    const v = hostOf(normalizeUrl($('site-input').value));
    if (v && !D.islands[current].sites.includes(v)) {
      D.islands[current].sites.push(v);
      save();
      renderHome();
    }
    $('site-input').value = '';
  };

  $('task-form').onsubmit = (e) => {
    e.preventDefault();
    const text = $('task-input').value.trim();
    if (!text) return;
    const t = { id: Store.uid(), island: current, text, done: false };
    D.tasks.push(t);
    if (!D.currentTaskId) D.currentTaskId = t.id;
    $('task-input').value = '';
    save(); renderTasks(); renderTimer();
  };

  $('dump-form').onsubmit = (e) => {
    e.preventDefault();
    const text = $('dump-input').value.trim();
    if (!text) return;
    D.dump.push({ id: Store.uid(), text, at: Date.now() });
    $('dump-input').value = '';
    save(); renderDump();
  };

  $('address-form').onsubmit = (e) => {
    e.preventDefault();
    const url = normalizeUrl($('address-input').value);
    if (!url) return;
    const tab = D.tabs[current].find((t) => t.id === tabId);
    if (!tab) return openTab(url);
    if (gate(url, () => views.get(tab.id).loadURL(url))) views.get(tab.id).loadURL(url);
  };
  const wv = () => views.get(tabId);
  $('back-btn').onclick = () => wv()?.canGoBack() && wv().goBack();
  $('fwd-btn').onclick = () => wv()?.canGoForward() && wv().goForward();
  $('reload-btn').onclick = () => wv()?.reload();
  $('new-tab-btn').onclick = () => { D.activeTab[current] = null; tabId = null; showActive(); renderTabs(); $('address-input').focus(); };

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === 't') { e.preventDefault(); $('new-tab-btn').click(); }
    else if (e.key === 'w') { e.preventDefault(); tabId && closeTab(tabId); }
    else if (e.key === 'l') { e.preventDefault(); $('address-input').focus(); $('address-input').select(); }
    else if (e.key === 'j') { e.preventDefault(); $('dump-input').focus(); }
    else if (['1', '2', '3'].includes(e.key)) { e.preventDefault(); selectIsland(ISLANDS[+e.key - 1]); }
  });

  window.probro?.onOpenUrl((url) => openTab(url));
  setInterval(renderStats, 15000);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

wire();
renderDump();
selectIsland('School', true);
renderTimer();
