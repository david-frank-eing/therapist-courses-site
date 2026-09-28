// mobile-home.js — the phone's start screen (tiles / list / "today" + bottom bar).
// Picking an area shows only that area of the dashboard ("focus"); everything else is hidden.
// Layout, order and hidden areas are per-device (localStorage) and set from ⚙️ הגדרות.
// Reads the app's globals: lastState, todayStr(), ilDate(), openFinance(), _mnavMore().
(function () {
  'use strict';
  const MQ = window.matchMedia('(max-width: 768px)');
  const PREF_KEY = 'carlos_mhome';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // area → what it shows. `targets` are kept visible in focus mode; `tab` clicks a contacts tab.
  const AREAS = {
    tasks:    { ic: '✅', name: 'משימות',     targets: ['#tasks', '#tomorrow'] },
    events:   { ic: '🎉', name: 'אירועים',    targets: ['#contacts'], tab: 'events' },
    calendar: { ic: '📅', name: 'יומן היום',  short: 'יומן', targets: ['.sb-cal-card'] },
    clients:  { ic: '💆', name: 'מטופלים',    targets: ['#contacts'], tab: 'clients' },
    habits:   { ic: '🌱', name: 'הרגלים',     targets: ['#habits'] },
    finance:  { ic: '💰', name: 'כספים',      action: () => window.openFinance && window.openFinance(), admin: true },
    ask:      { ic: '💬', name: 'שאל קרלוס',  short: 'שאל', targets: ['.sb-ask-card'], wide: true },
    focus:    { ic: '🎯', name: 'פוקוס היום', short: 'פוקוס', targets: ['.sb-focus-card'] },
    email:    { ic: '📧', name: 'מיילים',     targets: ['#email'] },
    briefing: { ic: '🌅', name: 'בריפינג',    targets: ['#briefing'] },
    journal:  { ic: '📓', name: 'יומן אישי',  short: 'יומן אישי', targets: ['#journal'] },
    content:  { ic: '📢', name: 'תוכן',       targets: ['#content'] },
  };
  const DEFAULT = { layout: 'tiles', order: ['tasks', 'events', 'calendar', 'clients', 'habits', 'finance', 'ask', 'focus', 'email', 'briefing', 'journal', 'content'],
                    hidden: ['focus', 'email', 'briefing', 'journal', 'content'] };
  const LAYOUTS = [['tiles', 'משבצות'], ['list', 'רשימה'], ['tabs', 'סרגל תחתון']];

  function loadPrefs() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); } catch (_) {}
    if (!p || !Array.isArray(p.order)) return JSON.parse(JSON.stringify(DEFAULT));
    const order = p.order.filter(k => AREAS[k]);
    DEFAULT.order.forEach(k => { if (!order.includes(k)) order.push(k); });
    return { layout: LAYOUTS.some(l => l[0] === p.layout) ? p.layout : 'tiles', order,
             hidden: (p.hidden || []).filter(k => AREAS[k]) };
  }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {} }

  let prefs = loadPrefs();
  let view = 'home';          // 'home' | 'customize' | area key
  let taskDay = 'today';      // tasks focus: today | tomorrow | all

  const available = k => AREAS[k] && (!AREAS[k].admin || window._isAdmin);
  const visibleAreas = () => prefs.order.filter(k => available(k) && !prefs.hidden.includes(k));

  // ── numbers on the tiles (from the state the app already loaded) ──
  const S = () => (typeof lastState !== 'undefined' && lastState) || {};
  const today = () => (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10));
  const tomorrow = () => (typeof ilDate === 'function' ? ilDate(1) : '');
  const hhmm = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
  const dm = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';

  function pendingTasks() { return (S().tasks || []).filter(t => t.status !== 'completed'); }
  function tasksOn(day) { return pendingTasks().filter(t => t.due_date === day); }
  function todayCalendar() {
    const s = S(), cal = (s.calendar && s.calendar.events) || [];
    const evs = cal.length ? cal : ((s.calendarUpcoming && s.calendarUpcoming.events) || []).filter(e => e.date === today());
    return evs.filter(e => e.time).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }
  function nextCalendar() { const now = hhmm(); return todayCalendar().find(e => (e.end_time || e.time) >= now); }
  function activeEvents() { return (S().events || []).filter(e => !e.archived); }
  function nextEvent() {
    return activeEvents().filter(e => e.date && e.date >= today() && e.status !== 'done')
      .sort((a, b) => a.date.localeCompare(b.date))[0];
  }

  function badge(k) {
    const s = S();
    if (k === 'tasks') {
      const urgent = pendingTasks().filter(t => t.priority === 'urgent').length;
      if (urgent) return [`⚠️ ${urgent} דחופות`, 'danger'];
      const n = tasksOn(today()).length;
      return n ? [`${n} להיום`, 'acc'] : ['אין להיום', 'ok'];
    }
    if (k === 'events') {
      const leads = activeEvents().filter(e => e.status === 'lead').length;
      if (leads) return [`${leads} לידים`, 'warn'];
      const e = nextEvent();
      return e ? [`הבא: ${dm(e.date)}`, 'acc'] : null;
    }
    if (k === 'clients') {
      const appts = ((s.bookingData && s.bookingData.appointments) || []).filter(a => a.date === today()).length;
      return appts ? [`${appts} פגישות היום`, 'acc'] : null;
    }
    if (k === 'calendar') {
      const e = nextCalendar();
      return e ? [`הבא: ${e.time}`, 'acc'] : ['אין עוד היום', 'ok'];
    }
    if (k === 'habits') {
      const all = (s.habits && s.habits.habits) || [];
      if (!all.length) return null;
      const done = ((s.habits.completions || {})[today()] || []).length;
      return [`${done} מתוך ${all.length}`, done >= all.length ? 'ok' : 'warn'];
    }
    if (k === 'finance') return ['📸 העלאת קבלה', 'acc'];
    if (k === 'journal') return s.journalToday ? ['נכתב היום', 'ok'] : null;
    return null;
  }

  // ── DOM ──
  let root, bar, tabbar;
  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'mhome';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'מסך הבית');
    document.body.appendChild(root);
    bar = document.createElement('div');
    bar.id = 'mfocus-bar';
    // first thing in the page so it can stick to the top above the focused area
    const wrap = document.querySelector('.page-wrap');
    if (wrap) wrap.prepend(bar); else document.body.prepend(bar);
    tabbar = document.createElement('nav');
    tabbar.id = 'mhome-tabbar';
    tabbar.setAttribute('aria-label', 'ניווט ראשי');
    document.body.appendChild(tabbar);
    root.addEventListener('click', onClick);
    bar.addEventListener('click', onClick);
    tabbar.addEventListener('click', onClick);
  }

  function greeting() {
    const h = +new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false });
    return h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  }
  function header() {
    const name = (S().userConfig && S().userConfig.userName) || window._userName || '';
    const date = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' });
    return `<div class="mh-top"><div><h1>${greeting()}${name ? ', ' + esc(name) : ''}</h1><div class="mh-date">${esc(date)}</div></div>
      <button type="button" class="mh-ghost" data-mh="customize">✏️ התאם</button></div>`;
  }
  const badgeHtml = b => b ? `<span class="mh-badge mh-${b[1]}">${esc(b[0])}</span>` : '';

  function urgentAlert() {
    if (!visibleAreas().includes('tasks')) return '';
    const urgent = pendingTasks().filter(t => t.priority === 'urgent');
    if (!urgent.length) return '';
    return `<button type="button" class="mh-alert" data-open="tasks"><span aria-hidden="true">⚠️</span>
      <span><b>${urgent.length === 1 ? 'משימה דחופה' : urgent.length + ' משימות דחופות'}</b> · ${esc(urgent[0].title)}</span><span class="mh-go" aria-hidden="true">←</span></button>`;
  }

  function homeTiles() {
    return `${header()}${urgentAlert()}<div class="mh-tiles">${visibleAreas().map(k => {
      const a = AREAS[k];
      return `<button type="button" class="mh-tile${a.wide ? ' wide' : ''}" data-open="${k}">
        <span class="mh-ic" aria-hidden="true">${a.ic}</span><span class="mh-name">${a.name}</span>${badgeHtml(badge(k))}</button>`;
    }).join('')}</div>`;
  }
  function homeList() {
    return `${header()}${urgentAlert()}<div class="mh-list">${visibleAreas().map(k => {
      const a = AREAS[k];
      return `<button type="button" class="mh-row" data-open="${k}"><span class="mh-ic" aria-hidden="true">${a.ic}</span>
        <span class="mh-name">${a.name}</span>${badgeHtml(badge(k))}<span class="mh-chev" aria-hidden="true">‹</span></button>`;
    }).join('')}</div>`;
  }
  function homeFeed() {
    const cards = [];
    const urgent = pendingTasks().filter(t => t.priority === 'urgent');
    if (urgent.length) cards.push(`<button type="button" class="mh-card urgent" data-open="tasks" data-day="today">
      <span class="mh-card-h">⚠️ דחוף</span><span class="mh-big">${esc(urgent[0].title)}</span>
      ${urgent.length > 1 ? `<span class="mh-sub">ועוד ${urgent.length - 1} ←</span>` : ''}</button>`);
    const todays = tasksOn(today()).filter(t => t.priority !== 'urgent');
    if (todays.length) cards.push(`<button type="button" class="mh-card" data-open="tasks" data-day="today">
      <span class="mh-card-h">✅ היום</span>${todays.slice(0, 3).map(t => `<span class="mh-line">${esc(t.title)}</span>`).join('')}
      ${todays.length > 3 ? `<span class="mh-sub">ועוד ${todays.length - 3} ←</span>` : ''}</button>`);
    const next = nextCalendar();
    if (next) cards.push(`<button type="button" class="mh-card" data-open="calendar">
      <span class="mh-card-h">📅 הבא ביומן</span><span class="mh-line"><span class="mh-time">${esc(next.time)}</span><span class="mh-big">${esc(next.title)}</span></span></button>`);
    const tmrw = tasksOn(tomorrow());
    cards.push(`<button type="button" class="mh-card" data-open="tasks" data-day="tomorrow">
      <span class="mh-card-h">🌙 מחר</span>${tmrw.length
        ? tmrw.slice(0, 4).map(t => `<span class="mh-line">${t.reminder_at ? `<span class="mh-time">${esc(new Date(t.reminder_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }))}</span>` : ''}<span>${esc(t.title)}</span></span>`).join('')
        : '<span class="mh-sub">אין משימות למחר</span>'}</button>`);
    const ev = nextEvent();
    if (ev) cards.push(`<button type="button" class="mh-card" data-open="events">
      <span class="mh-card-h">🎉 האירוע הקרוב</span><span class="mh-big">${esc([dm(ev.date), ev.title, ev.contact].filter(Boolean).join(' · '))}</span>
      ${ev.location ? `<span class="mh-sub">${esc(ev.location)}</span>` : ''}</button>`);
    return `${header()}<div class="mh-feed">${cards.join('')}</div>`;
  }

  function customize() {
    const keys = prefs.order.filter(available);
    return `<div class="mh-cust-head"><h2>✏️ התאם את מסך הבית</h2></div>
      <p class="mh-help">כבה מה שלא צריך, וסדר את השאר לפי החשיבות. מה שלמעלה מופיע ראשון.</p>
      <div class="mh-cust">${keys.map((k, i) => {
        const a = AREAS[k], on = !prefs.hidden.includes(k);
        return `<div class="mh-cust-row${on ? '' : ' off'}">
          <button type="button" class="mh-toggle" role="switch" aria-checked="${on}" aria-label="הצג ${a.name}" data-toggle="${k}"></button>
          <span class="mh-name">${a.ic} ${a.name}</span>
          <button type="button" class="mh-mv" data-move="${k}" data-dir="-1" aria-label="הזז למעלה" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="mh-mv" data-move="${k}" data-dir="1" aria-label="הזז למטה" ${i === keys.length - 1 ? 'disabled' : ''}>▼</button></div>`;
      }).join('')}</div>
      <button type="button" class="mh-done" data-mh="home">✓ סיימתי</button>
      <button type="button" class="mh-ghost mh-reset" data-mh="reset">החזר לברירת המחדל</button>`;
  }

  // ── focus mode: keep the targets and their ancestors, hide their siblings ──
  function clearFocus() {
    document.querySelectorAll('.mf-hide, .mf-keep').forEach(el => el.classList.remove('mf-hide', 'mf-keep'));
    document.body.classList.remove('mfocus');
  }
  function applyFocus(k) {
    clearFocus();
    const a = AREAS[k];
    const wrap = document.querySelector('.page-wrap');
    let targets = a.targets.map(sel => document.querySelector(sel)).filter(Boolean);
    if (k === 'tasks' && taskDay !== 'all') targets = targets.filter(el => (taskDay === 'today') === (el.id === 'tasks'));
    if (!wrap || !targets.length) return false;
    targets.forEach(t => {
      for (let el = t; el && el !== wrap.parentElement; el = el.parentElement) el.classList.add('mf-keep');
      t.querySelectorAll('.section-body.collapsed').forEach(b => b.classList.remove('collapsed'));
      t.querySelector(':scope > .section-body')?.classList.remove('collapsed');
    });
    document.querySelectorAll('.mf-keep').forEach(el => {
      if (targets.includes(el)) return;
      [...el.children].forEach(ch => { if (!ch.classList.contains('mf-keep') && ch !== bar) ch.classList.add('mf-hide'); });
    });
    if (a.tab) document.querySelector(`.ct-tab[data-tab="${a.tab}"]`)?.click();
    document.body.classList.add('mfocus');
    return true;
  }

  function renderBar() {
    if (!(view in AREAS)) { bar.innerHTML = ''; return; }
    const a = AREAS[view];
    const back = prefs.layout === 'tabs' ? '' : '<button type="button" class="mh-back" data-mh="home">→ בית</button>';
    const seg = view === 'tasks' ? `<div class="mh-seg" role="group" aria-label="איזה יום">${[['today', 'היום'], ['tomorrow', 'מחר'], ['all', 'הכל']].map(([d, n]) => {
      const c = d === 'all' ? pendingTasks().length : tasksOn(d === 'today' ? today() : tomorrow()).length;
      return `<button type="button" data-day="${d}" aria-pressed="${taskDay === d}">${n} (${c})</button>`;
    }).join('')}</div>` : '';
    bar.innerHTML = `<div class="mh-bar-row">${back}<h2>${a.ic} ${a.name}</h2></div>${seg}`;
  }

  function renderTabbar() {
    const on = prefs.layout === 'tabs' && view !== 'customize';
    document.body.classList.toggle('mhome-tabs', on);
    if (!on) { tabbar.innerHTML = ''; return; }
    const keys = visibleAreas().filter(k => k !== 'ask').slice(0, 3);
    const btn = (k, ic, n) => `<button type="button" data-open="${k}"${view === k ? ' aria-current="page"' : ''}><span class="mh-ti" aria-hidden="true">${ic}</span>${n}</button>`;
    tabbar.innerHTML = btn('home', '🏠', 'היום') + keys.map(k => btn(k, AREAS[k].ic, AREAS[k].short || AREAS[k].name)).join('')
      + '<button type="button" data-mh="more"><span class="mh-ti" aria-hidden="true">⋯</span>עוד</button>';
  }

  function render() {
    if (!MQ.matches) { teardown(); return; }
    ensureDom();
    document.body.classList.add('mhome-on');
    const inArea = view in AREAS;
    root.hidden = inArea;
    if (!inArea) {
      clearFocus();
      root.innerHTML = view === 'customize' ? customize()
        : `<div class="mh-screen">${prefs.layout === 'list' ? homeList() : prefs.layout === 'tabs' ? homeFeed() : homeTiles()}</div>`;
    }
    renderBar();
    renderTabbar();
  }

  function teardown() {
    clearFocus();
    document.body.classList.remove('mhome-on', 'mhome-tabs');
    if (root) { root.hidden = true; bar.innerHTML = ''; tabbar.innerHTML = ''; }
  }

  function open(k) {
    if (k === 'home') { view = 'home'; render(); window.scrollTo(0, 0); return; }
    const a = AREAS[k];
    if (!a) return;
    if (a.action) { a.action(); return; }   // finance opens its own full screen
    view = k;
    render();
    if (!applyFocus(k)) { view = 'home'; render(); if (window.toast) toast('האזור הזה לא זמין כרגע', false); return; }
    window.scrollTo(0, 0);
  }

  function onClick(e) {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.open) { if (el.dataset.day) taskDay = el.dataset.day; open(el.dataset.open); return; }
    if (el.dataset.day && view === 'tasks') { taskDay = el.dataset.day; renderBar(); applyFocus('tasks'); return; }
    const act = el.dataset.mh;
    if (act === 'home') { open('home'); return; }
    if (act === 'customize') { view = 'customize'; render(); window.scrollTo(0, 0); return; }
    if (act === 'reset') { prefs = JSON.parse(JSON.stringify(DEFAULT)); savePrefs(); render(); return; }
    if (act === 'more') { if (window._mnavMore) window._mnavMore(); return; }
    if (el.dataset.toggle) {
      const k = el.dataset.toggle;
      prefs.hidden = prefs.hidden.includes(k) ? prefs.hidden.filter(x => x !== k) : [...prefs.hidden, k];
      savePrefs(); render(); return;
    }
    if (el.dataset.move) {
      const keys = prefs.order.filter(available);
      const i = keys.indexOf(el.dataset.move), j = i + +el.dataset.dir;
      if (j < 0 || j >= keys.length) return;
      const a = prefs.order.indexOf(keys[i]), b = prefs.order.indexOf(keys[j]);
      [prefs.order[a], prefs.order[b]] = [prefs.order[b], prefs.order[a]];
      savePrefs(); render();
      root.querySelector(`[data-move="${el.dataset.move}"][data-dir="${el.dataset.dir}"]:not([disabled])`)?.focus();
    }
  }

  // ⚙️ הגדרות: layout picker + a way into "התאם" (works on any screen size; applies on the phone)
  function mountSettings(el) {
    if (!el) return;
    el.innerHTML = `<div class="settings-section-title">📱 מסך הבית בנייד</div>
      <div class="mh-set-layouts" role="radiogroup" aria-label="עיצוב מסך הבית">${LAYOUTS.map(([k, n]) =>
        `<label class="mh-set-opt"><input type="radio" name="mh-layout" value="${k}" ${prefs.layout === k ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      <button type="button" class="mh-ghost" id="mh-set-customize" style="margin-top:8px">✏️ בחר וסדר אזורים</button>
      <div class="settings-hint" style="margin-top:6px">נשמר במכשיר הזה. משבצות: רשת גדולה · רשימה: שורה לכל אזור · סרגל תחתון: "היום" עם מעבר מהיר למטה.</div>`;
    el.querySelectorAll('input[name="mh-layout"]').forEach(r => r.addEventListener('change', () => {
      prefs.layout = r.value; savePrefs(); if (view === 'customize') view = 'home'; render();
      if (window.toast) toast('✓ עיצוב מסך הבית עודכן');
    }));
    el.querySelector('#mh-set-customize').addEventListener('click', () => {
      document.getElementById('settings-modal')?.classList.add('hidden');
      view = 'customize'; render(); window.scrollTo(0, 0);
      if (!MQ.matches && window.toast) toast('מסך הבית מופיע בטלפון. פתח את הדאשבורד בנייד כדי לראות', true, 5000);
    });
  }

  // refresh the numbers whenever the app reloads its state
  function refresh() { if (MQ.matches && root && view !== 'customize' && !(view in AREAS)) render(); else if (view === 'tasks') renderBar(); }

  window.MobileHome = { render, refresh, open, mountSettings };
  MQ.addEventListener ? MQ.addEventListener('change', render) : MQ.addListener(render);
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})();
