// Carlos Dashboard ג€” client logic
const $ = (s) => document.querySelector(s);

// Israel-local date (YYYY-MM-DD). Using UTC toISOString caused false "stale" warnings
// and wrong overdue/today detection between midnight and 03:00 Israel time.
function ilDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function toast(msg, ok = true) {
  const t = document.createElement('div');
  t.className = 'toast ' + (ok ? 'ok' : 'err');
  t.textContent = msg;
  $('#toast-area').appendChild(t);
  setTimeout(() => t.remove(), 3400);
}

async function api(url, body) {
  try {
    // In cloud (SaaS) mode: route through Supabase adapter
    if (window._sbApi) return await window._sbApi(url, body);
    // Fallback: local server (dev/local mode)
    const r = await fetch(url, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    } : {});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    toast('׳©׳’׳™׳׳” ׳‘׳—׳™׳‘׳•׳¨ ׳׳©׳¨׳×: ' + e.message, false);
    throw e;
  }
}

// DOMAINS is populated dynamically from config.json via /api/state (userConfig.domains)
// Default fallback used before first state load
let DOMAINS = [{ id: 'unassigned', label: 'ג× ׳׳ ׳׳©׳•׳™׳' }];

// ׳×׳™׳§׳•׳ timezone: ׳©׳™׳׳•׳© ׳‘׳×׳׳¨׳™׳ ׳׳§׳•׳׳™ (׳׳ UTC) ׳׳׳ ׳™׳¢׳× ׳§׳₪׳™׳¦׳× ׳™׳•׳ ׳׳—׳¨׳™ ׳—׳¦׳•׳×
const todayStr = () => ilDate();

const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
};

// ---------- State & render ----------
let lastState = null;
async function loadState() {
  const s = await api('/api/state');
  lastState = s;
  // Update DOMAINS from config
  if (s.userConfig && s.userConfig.domains && s.userConfig.domains.length) {
    DOMAINS = [
      ...s.userConfig.domains.map(d => ({ id: d.id, label: d.emoji + ' ' + d.label })),
      { id: 'unassigned', label: 'ג× ׳׳ ׳׳©׳•׳™׳' }
    ];
  }
  // Lite-mode toggle: hide AI surfaces when edition=lite
  const isLite = s.userConfig && s.userConfig.edition === 'lite';
  const hasByok = s.userConfig && s.userConfig.aiBriefing;
  document.body.classList.toggle('lite-mode', isLite);
  document.body.classList.toggle('has-ai-briefing', isLite && hasByok);
  // Update page title & footer assistant name
  const aName = (s.userConfig && s.userConfig.assistantName) || '׳“׳׳©׳‘׳•׳¨׳“';
  const titleEl = document.getElementById('page-title');
  if (titleEl) document.title = aName + ' ֲ· ׳“׳׳©׳‘׳•׳¨׳“';
  const footerEl = document.getElementById('footer-asst');
  if (footerEl) footerEl.textContent = aName + ' ׳“׳׳©׳‘׳•׳¨׳“';
  renderGreeting();
  renderBriefing(s.briefing);
  renderEmail(s.emailSummary);
  renderTomorrow(s.tasks, s.calendarUpcoming);
  renderContent(s.content, s.weekly);
  renderTasks(s.tasks, s.date, s.completedToday || []);
  renderContacts(s);
  renderHabits(s.habits, s.date);
  renderTimeToday(s.timeLog, s.date);
  renderDaily(s.daily && s.daily.quotas ? s.daily.quotas : {});
  renderQuotas(s.weekly && s.weekly.quotas ? s.weekly.quotas : {});
  renderOpenLoops(s);
  renderConsistency(s.publishingStats);
  renderTaskStats(s.taskStats);
  renderHabitsHistory(s.habits, s.date);
  renderSbFocus(s.weekly && s.weekly.focus_today ? s.weekly.focus_today : [], s.date);
  renderSbCalendar(s.calendar, s.date);
  window._cfAvailable = !!(s.bookingData && s.bookingData.cloudflared_available);
  renderBooking(s.bookingData);
  renderBookingAlerts(s.bookingData && s.bookingData.notifications, s.bookingData && s.bookingData.appointments);
  renderRefreshStatus(s.lastRefresh, s.date);
}

function renderRefreshStatus(lastRefresh, todayDate) {
  const bar = document.getElementById('auto-refresh-bar');
  const msg = document.getElementById('auto-refresh-msg');
  if (!bar || !msg) return;

  // Lite mode: no refresh needed ג€” hide banner completely
  if (document.body.classList.contains('lite-mode')) {
    bar.classList.add('hidden');
    return;
  }

  if (!lastRefresh) {
    // No refresh has ever run ג€” show subtle hint
    bar.className = 'auto-refresh-bar auto-refresh-none';
    msg.innerHTML = 'ג× ׳¨׳¢׳ ׳•׳ ׳™׳•׳׳™ ׳׳ ׳”׳•׳’׳“׳¨ ג€” <a href="#" id="refresh-setup-link">׳”׳•׳¨׳׳•׳× ׳”׳’׳“׳¨׳”</a>';
    document.getElementById('refresh-setup-link')?.addEventListener('click', e => {
      e.preventDefault();
      toast('נ“‹ ׳₪׳×׳— ג™ן¸ ׳”׳’׳“׳¨׳•׳× ג†’ נ” ׳—׳™׳‘׳•׳¨׳™׳ ג†’ "ג° ׳×׳–׳׳ ׳¨׳¢׳ ׳•׳"', true, 6000);
    });
    bar.classList.remove('hidden');
    return;
  }

  const today = ilDate();
  const daysDiff = Math.floor((new Date(today) - new Date(lastRefresh.date)) / 864e5);

  if (lastRefresh.date === today && lastRefresh.status === 'success') {
    // ׳¢׳•׳“׳›׳ ׳”׳™׳•׳ ׳‘׳”׳¦׳׳—׳” ׳׳׳׳”
    bar.className = 'auto-refresh-bar auto-refresh-ok';
    msg.textContent = `נ¢ ׳¢׳•׳“׳›׳ ׳‘-${lastRefresh.time} ׳”׳™׳•׳`;
    bar.classList.remove('hidden');
  } else if (lastRefresh.date === today) {
    // ׳¢׳•׳“׳›׳ ׳”׳™׳•׳ ׳׳‘׳ ׳׳ ׳”׳›׳ ׳”׳¦׳׳™׳— (status: partial / failed)
    bar.className = 'auto-refresh-bar auto-refresh-warn';
    msg.innerHTML = `נ¡ ׳¢׳•׳“׳›׳ ׳—׳׳§׳™׳× ׳”׳™׳•׳ ׳‘-${lastRefresh.time} (${lastRefresh.tasks_failed||0} ׳׳©׳™׳׳•׳× ׳ ׳›׳©׳׳•) ג€” <button class="refresh-now-btn" id="refresh-now-btn">נ”„ ׳ ׳¡׳” ׳©׳•׳‘</button>`;
    bar.classList.remove('hidden');
    _bindManualRefresh();
  } else if (daysDiff <= 1) {
    // ׳׳×׳׳•׳ ג€” ׳”׳¦׳’ ׳׳–׳”׳¨׳” ׳§׳׳”
    bar.className = 'auto-refresh-bar auto-refresh-warn';
    msg.innerHTML = `נ¡ ׳¢׳“׳›׳•׳ ׳׳—׳¨׳•׳: ׳׳×׳׳•׳ ׳‘-${lastRefresh.time} ג€” <button class="refresh-now-btn" id="refresh-now-btn">נ”„ ׳¢׳“׳›׳ ׳¢׳›׳©׳™׳•</button>`;
    bar.classList.remove('hidden');
    _bindManualRefresh();
  } else {
    // ׳™׳•׳×׳¨ ׳׳™׳•׳ ג€” ׳׳–׳”׳¨׳” ׳‘׳•׳׳˜׳×
    bar.className = 'auto-refresh-bar auto-refresh-error';
    msg.innerHTML = `נ”´ ׳׳ ׳¢׳•׳“׳›׳ ${daysDiff} ׳™׳׳™׳! (׳׳—׳¨׳•׳: ${lastRefresh.date}) ג€” <button class="refresh-now-btn" id="refresh-now-btn">נ”„ ׳¢׳“׳›׳ ׳¢׳›׳©׳™׳•</button>`;
    bar.classList.remove('hidden');
    _bindManualRefresh();
  }
}

function _bindManualRefresh() {
  document.getElementById('refresh-now-btn')?.addEventListener('click', async function () {
    const btn = this;
    btn.disabled = true; btn.textContent = 'ג³ ׳׳¢׳“׳›׳...';
    const msg = document.getElementById('auto-refresh-msg');
    // Use the reliable script-based refresh (same as ג™ן¸ ג†’ נ” ׳—׳™׳‘׳•׳¨׳™׳ ג†’ "׳”׳¨׳¥ ׳¨׳¢׳ ׳•׳ ׳¢׳›׳©׳™׳•").
    // The old chat-based /api/ask path was slow and didn't reliably write the files.
    try {
      const r = await api('/api/setup/run-refresh', {});
      const pid = r.pid;
      if (!pid) throw new Error(r.error || 'no pid');
      const start = Date.now();
      const poll = async () => {
        try {
          const sr = await fetch('/api/setup/refresh-status?pid=' + pid);
          const st = await sr.json();
          const sec = Math.floor((Date.now() - start) / 1000);
          if (st.done) {
            if (st.exitCode === 0) { toast('ג… ׳ ׳×׳•׳ ׳™׳ ׳¢׳•׳“׳›׳ ׳•!'); loadState(); }
            else { toast('ג  ׳”׳¨׳¢׳ ׳•׳ ׳ ׳›׳©׳ ׳—׳׳§׳™׳× ג€” ׳ ׳¡׳” ׳©׳•׳‘', false); btn.disabled = false; btn.textContent = 'נ”„ ׳ ׳¡׳” ׳©׳•׳‘'; }
          } else {
            if (msg) msg.textContent = `ג³ ׳׳¢׳“׳›׳... (${sec} ׳©׳ ׳™׳•׳×)`;
            setTimeout(poll, 3000);
          }
        } catch (e) { if (msg) msg.textContent = '׳©׳’׳™׳׳” ג€” ׳ ׳¡׳” ׳©׳•׳‘'; btn.disabled = false; btn.textContent = 'נ”„ ׳ ׳¡׳” ׳©׳•׳‘'; }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      toast('׳©׳’׳™׳׳” ׳‘׳”׳₪׳¢׳׳× ׳¨׳¢׳ ׳•׳ ג€” ׳ ׳¡׳” ׳©׳•׳‘', false);
      btn.disabled = false; btn.textContent = 'נ”„ ׳ ׳¡׳” ׳©׳•׳‘';
    }
  });
}

// ---------- Search ----------
let contactSearchQ = '';

document.getElementById('contact-search')?.addEventListener('input', e => {
  contactSearchQ = e.target.value.trim().toLowerCase();
  if (lastState) renderContacts(lastState);
});

function renderGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? '׳‘׳•׳§׳¨ ׳˜׳•׳‘' : h < 18 ? '׳¦׳”׳¨׳™׳™׳ ׳˜׳•׳‘׳™׳' : '׳¢׳¨׳‘ ׳˜׳•׳‘';
  const uname = (lastState && lastState.userConfig && lastState.userConfig.userName) || '';
  $('#greeting').textContent = uname ? (g + ' ' + uname) : g;
  $('#date').textContent = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderBriefing(text) {
  const el = document.getElementById('briefing-body');
  if (!el) return;
  if (text && text.trim()) {
    // Stale detection: extract DD.MM.YYYY from text, compare to today
    let staleHtml = '';
    const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dateMatch) {
      const [, dd, mm, yyyy] = dateMatch;
      const briefingDate = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      const todayDate = new Date().toISOString().slice(0, 10);
      if (briefingDate !== todayDate) {
        staleHtml = `<div class="br-stale-warning">ג ן¸ ׳‘׳¨׳™׳₪׳™׳ ׳’ ׳-${dd}.${mm} ג€” ׳׳—׳¥ נ”„ ׳׳¢׳“׳›׳•׳</div>`;
      }
    }
    // Skip the נ¯ focus section ג€” it's already shown in the sidebar
    let skipFocus = false;
    const FOCUS_RE  = /נ¯/;
    const SECTION_RE = /^[נ“…ג ן¸נ“נµנ“‹נ’¡נ…ג”]/u;
    const bodyHtml = text.trim().split('\n').map(raw => {
      if (FOCUS_RE.test(raw)) { skipFocus = true; return ''; }
      if (skipFocus) {
        if (raw.trim() === '' || SECTION_RE.test(raw.trim())) skipFocus = false;
        if (skipFocus) return '';
      }
      const line = raw.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (/^#{1,3}\s/.test(raw)) return `<div class="br-heading">${line.replace(/^#+\s+/, '')}</div>`;
      if (/^[-*ג€¢]\s/.test(raw)) return `<div class="br-item">${line.replace(/^[-*ג€¢]\s+/, '')}</div>`;
      if (raw.trim() === '') return '<div class="br-gap"></div>';
      return `<div class="br-line">${line}</div>`;
    }).join('');
    el.innerHTML = staleHtml + bodyHtml;
  } else {
    // BYOK: if API key set ג†’ show generate button; if lite with no key ג†’ upgrade hint
    if (document.body.classList.contains('has-ai-briefing')) {
      el.innerHTML = `<div class="br-byok-prompt">
        <div class="muted-text" style="margin-bottom:8px">׳׳™׳ ׳¢׳“׳™׳™׳ ׳‘׳¨׳™׳₪׳™׳ ׳’ ׳׳”׳™׳•׳</div>
        <button id="byok-gen-btn" class="byok-gen-btn">ג¨ ׳¦׳•׳¨ ׳‘׳¨׳™׳₪׳™׳ ׳’ ׳¢׳›׳©׳™׳•</button>
      </div>`;
      document.getElementById('byok-gen-btn')?.addEventListener('click', _generateByokBriefing);
    } else if (document.body.classList.contains('lite-mode')) {
      el.innerHTML = `<div class="muted-text">נ’¡ ׳”׳•׳¡׳£ ׳׳₪׳×׳— Anthropic ׳‘-ג™ן¸ ׳”׳’׳“׳¨׳•׳× ׳›׳“׳™ ׳׳§׳‘׳ ׳‘׳¨׳™׳₪׳™׳ ׳’ ׳‘׳•׳§׳¨ ׳—׳›׳</div>`;
    } else {
      el.innerHTML = `<div class="muted-text">׳‘׳¨׳™׳₪׳™׳ ׳’ ׳‘׳•׳§׳¨ ׳™׳•׳₪׳™׳¢ ׳›׳׳ ׳׳—׳¨׳™ ׳”׳¨׳¢׳ ׳•׳ ׳”׳‘׳•׳§׳¨ (07:00)<br>
        <span class="br-hint">נ’¡ ׳׳¨׳¢׳ ׳•׳ ׳׳™׳™׳“׳™ ג€” ׳׳—׳¥ נ”„ ׳‘׳₪׳™׳ ׳”</span></div>`;
    }
  }
}

async function _generateByokBriefing() {
  const btn = document.getElementById('byok-gen-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'ג³ ׳™׳•׳¦׳¨ ׳‘׳¨׳™׳₪׳™׳ ׳’...'; }
  try {
    const r = await fetch('/api/briefing/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || '׳©׳’׳™׳׳”');
    toast('ג“ ׳‘׳¨׳™׳₪׳™׳ ׳’ ׳ ׳•׳¦׳¨');
    loadState();
  } catch (e) {
    toast('׳©׳’׳™׳׳” ׳‘׳™׳¦׳™׳¨׳× ׳‘׳¨׳™׳₪׳™׳ ׳’: ' + e.message, false);
    if (btn) { btn.disabled = false; btn.textContent = 'ג¨ ׳¦׳•׳¨ ׳‘׳¨׳™׳₪׳™׳ ׳’ ׳¢׳›׳©׳™׳•'; }
  }
}

function renderEmail(summary) {
  $('#email-body').innerHTML = (summary && summary.trim())
    ? summary.split('\n').filter(l => l.trim()).map(l => `<div>${l}</div>`).join('')
    : '<span class="muted-text">׳¡׳™׳›׳•׳ ׳׳™׳™׳׳™׳ ׳™׳•׳₪׳™׳¢ ׳›׳׳ ׳׳—׳¨׳™ ׳”׳¨׳¢׳ ׳•׳ ׳”׳‘׳•׳§׳¨ (07:00)<br><span class="br-hint">נ’¡ ׳׳¨׳¢׳ ׳•׳ ׳׳™׳™׳“׳™ ג€” ׳׳—׳¥ נ”„ ׳‘׳₪׳™׳ ׳”</span></span>';
}

// (renderFocus moved to sidebar ג€” see renderSbFocus below)

function dueLabel(task) {
  if (!task.due_date) return '';
  const tmrw = ilDate(1);
  const d = task.due_date;
  const day = d === todayStr() ? '׳”׳™׳•׳' : d === tmrw ? '׳׳—׳¨' : d.slice(8, 10) + '/' + d.slice(5, 7);
  let time = '';
  if (task.reminder_at && task.reminder_at.length >= 16) time = ' ' + task.reminder_at.slice(11, 16);
  return 'נ“… ' + day + time;
}

function renderTasks(tasks, date, completedToday) {
  const tmrw = tomorrowStr();
  // ׳׳©׳™׳׳•׳× ׳©׳ ׳׳—׳¨ ׳׳•׳¦׳’׳•׳× ׳‘׳¡׳§׳©׳ "׳׳—׳¨" ג€” ׳׳ ׳›׳׳
  const todayTasks = tasks.filter(t => t.due_date !== tmrw);
  const sorted = [...todayTasks].sort((a, b) => {
    const u = (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1);
    if (u) return u;
    return (a.due_date || date).localeCompare(b.due_date || date);
  });
  const todayKey = ilDate();
  const isOverdue = t => t.due_date && t.due_date < todayKey;

  const pendingHtml = sorted.length
    ? sorted.map(t => {
        const dl = dueLabel(t);
        const cc = contactChip(t);
        const overdueCls = isOverdue(t) ? 'overdue' : '';
        const overdueMark = isOverdue(t) ? 'ג ן¸ ' : '';
        const notesChip = (t.notes && t.notes.trim()) ? `<span class="notes-chip" title="${(t.notes||'').replace(/"/g,'&quot;').slice(0,200)}">נ“ ׳‘׳×׳”׳׳™׳</span>` : '';
        return `<li class="${overdueCls}" data-id="${t.id}"><input type="checkbox" data-id="${t.id}">
          <span class="${t.priority === 'urgent' ? 'urgent' : ''}">${overdueMark}${t.priority === 'urgent' ? 'ג ן¸ ' : ''}${t.title}</span>
          ${notesChip}
          ${cc}
          ${dl ? `<span class="due-chip">${dl}</span>` : ''}
          <button class="row-edit-btn" data-id="${t.id}" data-kind="task" title="׳¢׳¨׳•׳">גן¸</button></li>`;
      }).join('')
    : '<li class="muted-text">׳׳™׳ ׳׳©׳™׳׳•׳× ׳׳׳×׳™׳ ׳•׳× נ‰</li>';

  // Completed today ג€” shown with strikethrough
  const doneHtml = (completedToday || []).length
    ? (completedToday || []).map(t =>
        `<li class="task-done-today" data-id="${t.id}">
          <input type="checkbox" checked data-id="${t.id}" class="task-undo-cb">
          <span>${t.title}</span>
          <span class="done-chip">ג“ ׳‘׳•׳¦׳¢</span>
        </li>`
      ).join('')
    : '';

  $('#task-list').innerHTML = pendingHtml +
    (doneHtml ? `<li class="done-divider">׳”׳•׳©׳׳׳• ׳”׳™׳•׳</li>${doneHtml}` : '');

  document.querySelectorAll('#task-list input[type=checkbox]:not(.task-undo-cb)').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/task', { action: 'toggle', id: cb.dataset.id });
      toast('ג“ ׳׳©׳™׳׳” ׳”׳•׳©׳׳׳”');
      loadState();
    }));

  // Un-complete: uncheck a done task
  document.querySelectorAll('#task-list .task-undo-cb').forEach(cb =>
    cb.addEventListener('change', async () => {
      if (!cb.checked) {
        await api('/api/task/undo', { id: cb.dataset.id });
        toast('ג†© ׳׳©׳™׳׳” ׳—׳–׳¨׳” ׳׳׳׳×׳™׳ ׳•׳×');
        loadState();
      }
    }));

  bindRowEditBtns('#task-list');
}

function bindRowEditBtns(scopeSel) {
  document.querySelectorAll(scopeSel + ' .row-edit-btn').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      const row = b.closest('li,.c-item');
      openEditForm(row, b.dataset.kind, b.dataset.id);
    }));
}

function openEditForm(rowEl, kind, id) {
  if (!rowEl || rowEl.classList.contains('editing')) return;
  const next = rowEl.nextElementSibling;
  if (next && next.classList && next.classList.contains('inline-edit-form')) { next.remove(); rowEl.classList.remove('editing'); return; }
  rowEl.classList.add('editing');
  const item = kind === 'task'
    ? (lastState.tasks || []).find(x => x.id === id)
    : ((lastState.content || {}).items || []).find(x => x.id === id);
  if (!item) { rowEl.classList.remove('editing'); return; }
  const taskCategoryOpts = [
    ['general',   'נ“ ׳›׳׳׳™'],
    ['health',    'נ’ ׳‘׳¨׳™׳׳•׳× / ׳˜׳™׳₪׳•׳׳™׳'],
    ['marketing', 'נ“¢ ׳©׳™׳•׳•׳§'],
    ['music',     'נµ ׳׳•׳–׳™׳§׳” / DJ'],
    ['learning',  'נ“ ׳׳™׳׳•׳“']
  ];
  const taskPriorityOpts = [
    ['normal', 'נ”µ ׳¨׳’׳™׳'],
    ['urgent', 'ג ן¸ ׳“׳—׳•׳£'],
    ['low',    'ג× ׳ ׳׳•׳']
  ];
  const fieldsCfg = kind === 'task'
    ? [
        ['title','׳›׳•׳×׳¨׳×','text'],
        ['category','׳§׳˜׳’׳•׳¨׳™׳”','select', taskCategoryOpts],
        ['priority','׳¢׳“׳™׳₪׳•׳×','select', taskPriorityOpts],
        ['due_date','׳×׳׳¨׳™׳','date'],
        ['reminder_at','׳©׳¢׳”','time'],
        ['notes','׳”׳¢׳¨׳•׳×','textarea']
      ]
    : [['title','׳›׳•׳×׳¨׳×','text'],['body','׳×׳•׳›׳ ׳”׳₪׳•׳¡׳˜','textarea'],
       ['scheduled_for','׳׳×׳•׳–׳׳ ׳׳™׳•׳','date'],['docs_url','Google Docs URL','text']];
  const valueOf = (k) => {
    if (kind === 'task' && k === 'reminder_at' && item.reminder_at && item.reminder_at.length >= 16) return item.reminder_at.slice(11, 16);
    if (kind === 'task' && k === 'category') return item.category || 'general';
    if (kind === 'task' && k === 'priority') return item.priority || 'normal';
    return item[k] != null ? item[k] : '';
  };
  const formHtml = `<div class="inline-edit-form">
    ${fieldsCfg.map(([k, l, t, opts]) => fld(k, l, valueOf(k), t, opts)).join('')}
    <div class="ef-actions">
      <button class="ef-save" type="button">׳©׳׳•׳¨</button>
      ${kind === 'task' ? '<button class="ef-del" type="button">ג• ׳׳—׳§</button>' : ''}
      <button class="ef-cancel" type="button">׳¡׳’׳•׳¨</button>
    </div>
  </div>`;
  rowEl.insertAdjacentHTML('afterend', formHtml);
  const form = rowEl.nextElementSibling;

  // inject multi-image widget for content items
  if (kind === 'content') {
    const existingUrls = item.creative_urls && item.creative_urls.length
      ? item.creative_urls
      : (item.creative_url ? [item.creative_url] : []);
    const widget = buildMultiImgWidget(existingUrls);
    form.querySelector('.ef-actions').insertAdjacentElement('beforebegin', widget);
  }

  form.querySelector('.ef-save').addEventListener('click', async () => {
    const data = collectForm(form);
    if (kind === 'task' && data.due_date && data.reminder_at && !data.reminder_at.includes('T')) {
      data.reminder_at = data.due_date + 'T' + data.reminder_at;
    } else if (kind === 'task' && data.reminder_at && !data.due_date) {
      delete data.reminder_at;
    }
    if (kind === 'content') {
      const widget = form.querySelector('.multi-img-widget');
      if (widget) data.creative_urls = JSON.parse(widget.dataset.urls || '[]');
    }
    await api(kind === 'task' ? '/api/task/update' : '/api/content/update', { ...data, id });
    toast('ג“ ׳¢׳•׳“׳›׳');
    loadState();
  });
  const del = form.querySelector('.ef-del');
  if (del) del.addEventListener('click', async () => {
    await api('/api/task', { action: 'toggle', id });
    toast('נ—‘ן¸ ׳”׳׳©׳™׳׳” ׳”׳•׳¡׳¨׳”');
    loadState();
  });
  form.querySelector('.ef-cancel').addEventListener('click', () => loadState());

}

// ---------- Multi-image gallery (content edit) ----------
function renderMultiImgGallery(container, urls) {
  const list = container.querySelector('.mig-list');
  if (!list) return;
  list.innerHTML = (urls || []).map((url) => {
    const fname = url.split('/').pop();
    const displayName = fname.replace(/^[a-z0-9]+-/, '');          // strip timestamp prefix
    const fullPath = '/uploads/' + fname;
    const isImg = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url);
    return `<div class="mig-item" data-url="${url}">
      ${isImg
        ? `<img src="${url}" class="mig-thumb" alt="${displayName}">`
        : `<div class="mig-file-icon">נ“</div>`}
      <span class="mig-name" title="${displayName}">${displayName}</span>
      <span class="mig-path" title="${fullPath}">uploads\\${fname.slice(0,20)}${fname.length>20?'ג€¦':''}</span>
      <button class="mig-remove" type="button" title="׳”׳¡׳¨">ג•</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.mig-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.closest('.mig-item').dataset.url;
      const current = JSON.parse(container.dataset.urls || '[]');
      const updated = current.filter(u => u !== url);
      container.dataset.urls = JSON.stringify(updated);
      updateMigHint(container, updated.length);
      renderMultiImgGallery(container, updated);
    });
  });
}

function updateMigHint(container, count) {
  const hint = container.querySelector('.mig-count-hint');
  if (hint) hint.textContent = count + ' ׳×׳׳•׳ ׳•׳× ֲ· ׳¢׳“ 20MB ׳׳›׳ ׳§׳•׳‘׳¥';
}

function buildMultiImgWidget(existingUrls) {
  const urls = existingUrls || [];
  const div = document.createElement('div');
  div.className = 'multi-img-widget';
  div.dataset.urls = JSON.stringify(urls);
  div.innerHTML = `
    <span class="mig-label">נ“¸ ׳×׳׳•׳ ׳•׳× / ׳§׳¨׳™׳׳˜׳™׳‘׳™׳</span>
    <div class="mig-list"></div>
    <div class="mig-add">
      <input type="file" class="mig-file-input" accept="image/*,video/*" multiple placeholder="׳‘׳—׳¨ ׳§׳‘׳¦׳™׳...">
      <div class="mig-count-hint">${urls.length} ׳×׳׳•׳ ׳•׳× ֲ· ׳¢׳“ 20MB ׳׳›׳ ׳§׳•׳‘׳¥</div>
    </div>
  `;
  renderMultiImgGallery(div, urls);

  div.querySelector('.mig-file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) { toast('׳”׳§׳•׳‘׳¥ ׳’׳“׳•׳ ׳-20MB: ' + file.name, false); continue; }
      const reader = new FileReader();
      await new Promise(resolve => {
        reader.onload = async () => {
          const dataBase64 = String(reader.result).split(',')[1];
          try {
            const r = await api('/api/upload', { filename: file.name, dataBase64 });
            if (r && r.url) {
              const current = JSON.parse(div.dataset.urls || '[]');
              current.push(r.url);
              div.dataset.urls = JSON.stringify(current);
              updateMigHint(div, current.length);
              renderMultiImgGallery(div, current);
              toast('ג“ ' + file.name.slice(0, 30) + ' ׳”׳•׳¢׳׳”');
            }
          } catch (err) { toast('׳©׳’׳™׳׳” ׳‘׳”׳¢׳׳׳”: ' + file.name, false); }
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    e.target.value = ''; // reset so same file can be re-selected
  });
  return div;
}

function contactChip(t) {
  if (t.client_id) {
    const c = (lastState && lastState.clients || []).find(x => x.id === t.client_id);
    if (c) return `<span class="contact-chip">נ’† ${c.name || '(׳׳˜׳•׳₪׳)'}</span>`;
  }
  if (t.event_id) {
    const e = (lastState && lastState.events || []).find(x => x.id === t.event_id);
    if (e) return `<span class="contact-chip">נµ ${[e.date, e.contact].filter(Boolean).join(' ֲ· ') || '(׳׳™׳¨׳•׳¢)'}</span>`;
  }
  return '';
}

// ---------- Tomorrow ----------
function tomorrowStr() {
  return ilDate(1);
}

function renderTomorrow(tasks, upcomingEvents) {
  const tmrw = tomorrowStr();
  const d = new Date(tmrw + 'T12:00:00Z');
  const label = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const el = document.getElementById('tomorrow-date');
  if (el) el.textContent = label;

  // Render upcoming Google Calendar events for tomorrow
  const gcalEl = document.getElementById('tomorrow-gcal-events');
  if (gcalEl) {
    const renderGcal = (data) => {
      const evts = (data && data.events)
        ? data.events.filter(e => e.date === tmrw) : [];
      if (evts.length) {
        gcalEl.innerHTML = '<div class="tmrw-gcal-title">נ“† ׳₪׳’׳™׳©׳•׳× ׳‘׳™׳•׳׳</div>' +
          evts.map(e => {
            const timeStr = (!e.time || e.time === 'allday') ? '׳›׳ ׳”׳™׳•׳' : e.time;
            return `<div class="tmrw-gcal-item">` +
              `<span class="tmrw-gcal-time">${timeStr}</span>` +
              `<span class="tmrw-gcal-title-text">${_esc(e.title)}</span>` +
              `</div>`;
          }).join('');
      } else {
        gcalEl.innerHTML = '<div class="tmrw-gcal-empty">נ“† ׳׳™׳ ׳₪׳’׳™׳©׳•׳× ׳‘׳™׳•׳׳ ׳׳׳—׳¨</div>';
      }
    };
    // Use state data if available, otherwise fetch directly
    if (upcomingEvents && upcomingEvents.events && upcomingEvents.events.length) {
      renderGcal(upcomingEvents);
    } else {
      api('/api/calendar-upcoming').then(renderGcal).catch(() => {
        gcalEl.innerHTML = '<div class="tmrw-gcal-empty">נ“† ׳™׳•׳׳ ׳׳ ׳–׳׳™׳</div>';
      });
    }
  }

  const tmrwTasks = (tasks || []).filter(t => t.due_date === tmrw);
  const list = $('#tomorrow-list');
  if (!list) return;

  list.innerHTML = tmrwTasks.length
    ? tmrwTasks.map(t => {
        const time = t.reminder_at && t.reminder_at.length >= 16 ? ' ֲ· ' + t.reminder_at.slice(11, 16) : '';
        return `<li data-id="${t.id}">
          <input type="checkbox" data-id="${t.id}">
          <span>${t.title}</span>
          ${time ? `<span class="due-chip">ג°${time}</span>` : ''}
          <button class="row-edit-btn" data-id="${t.id}" data-kind="task" title="׳¢׳¨׳•׳">גן¸</button>
        </li>`;
      }).join('')
    : '';

  list.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/task', { action: 'toggle', id: cb.dataset.id });
      toast('ג“ ׳”׳•׳©׳׳');
      loadState();
    }));

  bindRowEditBtns('#tomorrow-list');
}

$('#add-tomorrow').addEventListener('click', async () => {
  const v = document.getElementById('tomorrow-task').value.trim();
  if (!v) { toast('׳›׳×׳•׳‘ ׳׳©׳™׳׳” ׳§׳•׳“׳', false); return; }
  const tmrw = tomorrowStr();
  const time = document.getElementById('tomorrow-time').value;
  const payload = { action: 'add', title: v, due_date: tmrw };
  if (time) payload.reminder_at = tmrw + 'T' + time;
  await api('/api/task', payload);
  document.getElementById('tomorrow-task').value = '';
  document.getElementById('tomorrow-time').value = '';
  toast('ג“ ׳ ׳•׳¡׳£ ׳׳׳—׳¨ ג€” ' + (time ? time : '׳׳׳ ׳©׳¢׳”'));
  loadState();
});
document.getElementById('tomorrow-task')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-tomorrow').click();
});

function renderHabits(habits, date) {
  const completions = habits.completions || {};
  const done = completions[date] || [];
  const todayUtc = new Date(date + 'T12:00:00Z');
  const daysInMonth = new Date(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() + 1, 0).getDate();
  const weekDays = [], monthDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayUtc); d.setUTCDate(d.getUTCDate() - i);
    weekDays.push(d.toISOString().slice(0, 10));
  }
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(todayUtc); d.setUTCDate(d.getUTCDate() - i);
    monthDays.push(d.toISOString().slice(0, 10));
  }
  const weeklyCount = id => weekDays.filter(d => (completions[d] || []).includes(id)).length;
  const monthCount = id => monthDays.filter(d => (completions[d] || []).includes(id)).length;
  const streakOf = id => {
    let streak = 0;
    const startedToday = (completions[date] || []).includes(id);
    for (let i = startedToday ? 0 : 1; i < 365; i++) {
      const d = new Date(todayUtc); d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      if ((completions[key] || []).includes(id)) streak++;
      else break;
    }
    return streak;
  };
  const habitHtml = habits.habits.length
    ? habits.habits.map(h => `<label class="habit">
        <input type="checkbox" data-id="${h.id}" ${done.includes(h.id) ? 'checked' : ''}>
        <span class="habit-name">${h.emoji} ${h.label}</span>
        <span class="habit-stats">
          <span>${weeklyCount(h.id)}/7 ׳©׳‘׳•׳¢</span>
          <span>${monthCount(h.id)}/${daysInMonth} ׳—׳•׳“׳©</span>
          <span class="habit-streak">נ”¥ ${streakOf(h.id)}</span>
        </span>
      </label>`).join('')
    : '<div class="muted-text" style="font-size:.85rem;padding:6px 0">׳׳™׳ ׳”׳¨׳’׳׳™׳ ג€” ׳”׳•׳¡׳£ ׳“׳¨׳ ג™ן¸ ׳”׳’׳“׳¨׳•׳×</div>';

  $('#habit-list').innerHTML = habitHtml;

  document.querySelectorAll('#habit-list input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/habit', { id: cb.dataset.id });
      loadState();
    }));
}

function renderTimeToday(timeLog, date) {
  const sessions = (timeLog.sessions || []).filter(s => (s.ended_at || '').slice(0, 10) === date);
  const el = $('#time-list');
  if (!sessions.length) { el.innerHTML = '<span class="muted-text">׳¢׳“׳™׳™׳ ׳׳ ׳ ׳¨׳©׳ ׳–׳׳ ׳”׳™׳•׳</span>'; return; }
  const total = sessions.reduce((sum, x) => sum + (x.seconds || 0), 0);
  el.innerHTML = sessions.map(s =>
    `<div class="time-row">
       <span>${s.label || s.domain}</span>
       <span class="time-meta">
         <span class="muted-text">${fmt(s.seconds)}${s.note ? ' ֲ· ' + s.note : ''}</span>
         <button class="time-del" data-id="${s.id}" title="׳׳—׳§ ׳¨׳™׳©׳•׳">ג•</button>
       </span>
     </div>`
  ).join('') + `<div class="time-total">׳¡׳”"׳› ׳”׳™׳•׳: ${fmt(total)}</div>`;
  document.querySelectorAll('.time-del').forEach(b =>
    b.addEventListener('click', async () => {
      await api('/api/timer/delete', { id: b.dataset.id });
      toast('נ—‘ן¸ ׳”׳–׳׳ ׳ ׳׳—׳§');
      loadState();
    }));
}

// ---------- Content ----------
const NEXT_STATUS = { idea: 'draft', draft: 'ready', ready: 'published' };
let _contentCollapsed = localStorage.getItem('contentPublishedCollapsed') !== 'false';
const STATUS_LABEL = {
  idea: 'נ’¡ ׳¨׳¢׳™׳•׳ ׳•׳×',
  draft: 'גן¸ ׳˜׳™׳•׳˜׳•׳×',
  ready: 'ג… ׳׳•׳›׳ ׳™׳ ׳׳₪׳¨׳¡׳•׳',
  published: 'נ“₪ ׳₪׳•׳¨׳¡׳ ׳”׳©׳‘׳•׳¢'
};
const NEXT_LABEL = { idea: 'ג†’ ׳˜׳™׳•׳˜׳”', draft: 'ג†’ ׳׳•׳›׳', ready: 'ג†’ ׳₪׳•׳¨׳¡׳' };

// CONTENT_DOMAINS reads from DOMAINS (loaded from config.json in loadState)
const domainLabel = id => (DOMAINS.find(d => d.id === id) || DOMAINS[DOMAINS.length - 1]).label;

function renderContent(content, weekly) {
  const items = (content && content.items) || [];
  const buckets = { idea: [], draft: [], ready: [], published: [] };
  items.forEach(i => { (buckets[i.status] || buckets.idea).push(i); });

  const html = ['idea', 'draft', 'ready', 'published'].map(s => {
    if (!buckets[s].length) return '';
    const isPublished = s === 'published';
    const collapsedCls = isPublished && _contentCollapsed ? ' c-collapsed' : '';
    const toggleBtn = isPublished
      ? `<button class="c-bucket-toggle" data-bucket="published" title="${_contentCollapsed ? '׳”׳¨׳—׳‘' : '׳׳–׳¢׳¨'}">${_contentCollapsed ? 'ג–¸' : 'ג–¾'}</button>`
      : '';
    return `<div class="c-bucket c-bucket-${s}${collapsedCls}">
      <div class="c-bucket-title">${toggleBtn}${STATUS_LABEL[s]} (${buckets[s].length})</div>
      ${buckets[s].map(item => {
        const icon = item.type === 'reel' ? 'נ¬' : 'נ“';
        const next = NEXT_STATUS[item.status];
            const thumbUrls = item.creative_urls && item.creative_urls.length
          ? item.creative_urls
          : (item.creative_url ? [item.creative_url] : []);
        const firstThumb = thumbUrls[0] || '';
        const isImg = firstThumb && /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(firstThumb);
        const thumbHtml = thumbUrls.length
          ? (isImg
              ? `<img src="${firstThumb}" class="c-item-thumb" title="${thumbUrls.length} ׳×׳׳•׳ ׳•׳×">`
              : `<span class="c-img-badge">נ“ ${thumbUrls.length}</span>`)
          : '';
        return `<div class="c-item" data-id="${item.id}">
          ${thumbHtml}
          <span class="c-item-title">${icon} ${item.title || '(׳׳׳ ׳›׳•׳×׳¨׳×)'}</span>
          <span class="c-domain">${domainLabel(item.domain)}</span>
          ${thumbUrls.length > 1 ? `<span class="c-img-badge">נ“¸ ${thumbUrls.length}</span>` : ''}
          ${next ? `<button class="c-next-btn" data-id="${item.id}" data-next="${next}">${NEXT_LABEL[item.status]}</button>` : ''}
          <button class="row-edit-btn" data-id="${item.id}" data-kind="content" title="׳¢׳¨׳•׳">גן¸</button>
          <button class="c-del-btn" data-id="${item.id}" title="׳׳—׳§">ג•</button>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  $('#content-buckets').innerHTML = html || '<span class="muted-text">׳׳™׳ ׳×׳•׳›׳ ׳¢׳“׳™׳™׳ ג€” ׳”׳•׳¡׳£ ׳¨׳¢׳™׳•׳ ׳׳‘׳ ׳§</span>';
  const q = weekly && weekly.quotas;
  if (q) {
    $('#content-summary').textContent =
      `נ’† ${(q.treatments_reels||{done:0,target:0}).done}/${(q.treatments_reels||{}).target||0}R ֲ· ${(q.treatments_posts||{done:0,target:0}).done}/${(q.treatments_posts||{}).target||0}P  ֲ·  ` +
      `נµ ${(q.music_reels||{done:0,target:0}).done}/${(q.music_reels||{}).target||0}R ֲ· ${(q.music_posts||{done:0,target:0}).done}/${(q.music_posts||{}).target||0}P  ֲ·  ` +
      `נ€ ${(q.product_reels||{done:0,target:0}).done}/${(q.product_reels||{}).target||0}R ֲ· ${(q.product_posts||{done:0,target:0}).done}/${(q.product_posts||{}).target||0}P`;
  } else {
    $('#content-summary').textContent = '';
  }

  document.querySelectorAll('#content-buckets .c-next-btn').forEach(b =>
    b.addEventListener('click', async () => {
      await api('/api/content/update', { id: b.dataset.id, status: b.dataset.next });
      toast(b.dataset.next === 'published' ? 'ג“ ׳₪׳•׳¨׳¡׳! ׳”׳׳›׳¡׳” ׳”׳×׳¢׳“׳›׳ ׳”' : 'ג“ ׳׳¦׳‘ ׳”׳×׳¢׳“׳›׳');
      loadState();
    }));
  document.querySelectorAll('#content-buckets .c-del-btn').forEach(b =>
    b.addEventListener('click', async () => {
      await api('/api/content/delete', { id: b.dataset.id });
      toast('נ—‘ן¸ ׳ ׳׳—׳§');
      loadState();
    }));
  bindRowEditBtns('#content-buckets');

  document.querySelectorAll('#content-buckets .c-bucket-toggle').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation();
      _contentCollapsed = !_contentCollapsed;
      localStorage.setItem('contentPublishedCollapsed', _contentCollapsed);
      renderContent(content, weekly);
    }));
}

$('#add-content').addEventListener('click', async () => {
  const title = $('#new-content-title').value.trim();
  if (!title) { toast('׳›׳×׳•׳‘ ׳©׳/׳¨׳¢׳™׳•׳', false); return; }
  const type = $('#new-content-type').value;
  const domain = $('#new-content-domain').value;
  await api('/api/content/add', { type, domain, title });
  $('#new-content-title').value = '';
  toast('ג“ ׳ ׳•׳¡׳£ ׳׳‘׳ ׳§ ׳›׳¨׳¢׳™׳•׳ ֲ· ' + domainLabel(domain));
  loadState();
});
$('#new-content-title').addEventListener('keydown', e => { if (e.key === 'Enter') $('#add-content').click(); });

function renderQuotaBars(containerSel, quotas, scope) {
  $(containerSel).innerHTML = Object.entries(quotas).map(([key, q]) => {
    const pct = Math.min(100, q.target ? (q.done / q.target * 100) : 0);
    return `<div class="quota" data-key="${key}" data-scope="${scope}">
      <div class="quota-label">
        <span>${q.emoji} ${q.label}</span>
        <span class="quota-nums">${q.done} / <span class="quota-target">${q.target}</span>
          <button class="quota-edit" title="׳¢׳¨׳•׳ ׳™׳¢׳“">גן¸</button></span>
      </div>
      <div class="quota-track"><div class="quota-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  $(containerSel).querySelectorAll('.quota-edit').forEach(b =>
    b.addEventListener('click', () => editQuota(b)));
}
function renderQuotas(quotas) { renderQuotaBars('#quota-bars', quotas, 'weekly'); }
function renderDaily(quotas) { renderQuotaBars('#daily-bars', quotas, 'daily'); }

function renderTaskStats(s) {
  if (!s) return;
  $('#task-stats').textContent = `ג… ׳”׳•׳©׳׳׳•: ${s.today} ׳”׳™׳•׳ ֲ· ${s.week} ׳”׳©׳‘׳•׳¢ ֲ· ${s.total} ׳‘׳¡׳”"׳›`;
}

function renderConsistency(stats) {
  if (!stats || stats.totalEvents === 0) {
    $('#consistency-content').innerHTML =
      '<div class="muted-text">׳¢׳“׳™׳™׳ ׳׳™׳ ׳ ׳×׳•׳ ׳™ ׳₪׳¨׳¡׳•׳ ג€” ׳×׳₪׳¨׳¡׳ ׳₪׳•׳¡׳˜/׳¨׳™׳׳¡ ׳•׳ ׳×׳—׳™׳ ׳׳¢׳§׳•׳‘ נ¯</div>';
    return;
  }
  const streakLine = stats.streak > 0
    ? `<div class="cs-streak">נ”¥ ׳¨׳¦׳£ ׳ ׳•׳›׳—׳™: <strong>${stats.streak} ׳™׳׳™׳</strong> ׳¢׳ ׳₪׳¨׳¡׳•׳</div>`
    : `<div class="cs-streak muted-text">נ“‰ ׳׳™׳ ׳¨׳¦׳£ ׳₪׳¢׳™׳ ג€” ׳×׳₪׳¨׳¡׳ ׳”׳™׳•׳ ׳›׳“׳™ ׳׳”׳×׳—׳™׳</div>`;
  const weeklyRows = (stats.weekly || []).map(w => `
    <div class="cs-week-row">
      <span class="cs-week-label">${w.weekLabel}</span>
      <span class="cs-week-vals">נ¬ ${w.reels} ֲ· נ“ ${w.posts}</span>
    </div>`).join('');
  const avgLine = `<div class="cs-avg muted-text">׳׳׳•׳¦׳¢ 4 ׳©׳‘׳•׳¢׳•׳×: נ¬ ${stats.avgReels} ֲ· נ“ ${stats.avgPosts} ׳‘׳©׳‘׳•׳¢</div>`;
  $('#consistency-content').innerHTML = streakLine + '<div class="cs-weeks">' + weeklyRows + '</div>' + avgLine;
}

function renderOpenLoops(state) {
  const STALE_DAYS = 14;
  const ms = STALE_DAYS * 86400 * 1000;
  const now = Date.now();
  const ageOf = iso => iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : 0;
  const stale = iso => iso && (now - new Date(iso).getTime() > ms);

  const tasks = (state.tasks || []).filter(t => stale(t.created_at));
  const leads = (state.events || []).filter(e => e.status === 'lead' && stale(e.updated_at || e.created_at));
  const ideas = ((state.content || {}).items || []).filter(c => c.status === 'idea' && stale(c.created_at));

  if (!(tasks.length + leads.length + ideas.length)) {
    $('#open-loops-content').innerHTML = '<div class="muted-text">׳”׳›׳ ׳׳×׳¢׳“׳›׳ נ¯ ׳׳™׳ ׳“׳‘׳¨׳™׳ ׳×׳§׳•׳¢׳™׳ ׳׳¢׳ 14 ׳™׳׳™׳</div>';
    return;
  }
  const group = (title, items, render) => items.length ? `<div class="ol-group">
    <div class="ol-title">${title} (${items.length})</div>
    ${items.map(render).join('')}
  </div>` : '';

  $('#open-loops-content').innerHTML =
    group('ג° ׳׳©׳™׳׳•׳× ׳™׳©׳ ׳•׳×', tasks, t => `<div class="ol-item"><span>${t.title}</span><span class="ol-age">${ageOf(t.created_at)} ׳™׳׳™׳</span></div>`) +
    group('נ¡ ׳׳™׳“׳™׳ ׳×׳§׳•׳¢׳™׳', leads, e => `<div class="ol-item"><span>${[e.date, e.contact].filter(Boolean).join(' ֲ· ') || '(׳׳™׳¨׳•׳¢)'}</span><span class="ol-age">${ageOf(e.updated_at || e.created_at)} ׳™׳׳™׳</span></div>`) +
    group('נ’¡ ׳¨׳¢׳™׳•׳ ׳•׳× ׳׳ ׳§׳•׳“׳׳•', ideas, c => `<div class="ol-item"><span>${c.title || '(׳׳׳ ׳›׳•׳×׳¨׳×)'}</span><span class="ol-age">${ageOf(c.created_at)} ׳™׳׳™׳</span></div>`);
}

function editQuota(btn) {
  const row = btn.closest('.quota');
  const key = row.dataset.key;
  const scope = row.dataset.scope || 'weekly';
  const numsSpan = btn.parentElement;
  const original = numsSpan.innerHTML;
  const current = parseInt(numsSpan.querySelector('.quota-target').textContent) || 0;
  numsSpan.innerHTML =
    `<input type="number" class="quota-input" min="0" value="${current}">
     <button class="quota-save">ג“</button>
     <button class="quota-cancel">ג•</button>`;
  const input = numsSpan.querySelector('.quota-input');
  input.focus(); input.select();
  const cancel = () => {
    numsSpan.innerHTML = original;
    numsSpan.querySelector('.quota-edit').addEventListener('click', () =>
      editQuota(numsSpan.querySelector('.quota-edit')));
  };
  numsSpan.querySelector('.quota-cancel').addEventListener('click', cancel);
  const save = async () => {
    const t = parseInt(input.value);
    if (isNaN(t) || t < 0) { toast('׳׳¡׳₪׳¨ ׳׳ ׳×׳§׳™׳', false); return; }
    await api('/api/quota/update', { key, target: t, scope });
    toast('ג“ ׳”׳™׳¢׳“ ׳¢׳•׳“׳›׳');
    loadState();
  };
  numsSpan.querySelector('.quota-save').addEventListener('click', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  });
}

// ---------- Tasks ----------
$('#add-task').addEventListener('click', async () => {
  const v = $('#new-task').value.trim();
  if (!v) { toast('׳›׳×׳•׳‘ ׳׳©׳™׳׳” ׳§׳•׳“׳', false); return; }
  const date = $('#new-task-date').value;
  const time = $('#new-task-time').value;
  const category = $('#new-task-category').value || 'general';
  const priority = $('#new-task-priority').value || 'normal';
  const payload = { action: 'add', title: v, category, priority };
  if (date) {
    payload.due_date = date;
    if (time) payload.reminder_at = date + 'T' + time;
  }
  await api('/api/task', payload);
  $('#new-task').value = ''; $('#new-task-date').value = todayStr(); $('#new-task-time').value = '';
  $('#new-task-category').value = 'general'; $('#new-task-priority').value = 'normal';
  toast('ג“ ' + (date ? '׳׳©׳™׳׳” ׳ ׳§׳‘׳¢׳” ׳-' + (date === todayStr() ? '׳”׳™׳•׳' : date) + (time ? ' ' + time : '') : '׳”׳׳©׳™׳׳” ׳ ׳•׳¡׳₪׳”'));
  loadState();
});
$('#new-task').addEventListener('keydown', e => { if (e.key === 'Enter') $('#add-task').click(); });

// ---------- Journal ----------
$('#journal-save').addEventListener('click', async () => {
  const v = $('#journal-text').value.trim();
  if (!v) { toast('׳›׳×׳•׳‘ ׳׳©׳”׳• ׳§׳•׳“׳', false); return; }
  await api('/api/journal', { text: v });
  $('#journal-text').value = '';
  toast('ג“ ׳ ׳©׳׳¨ ׳׳™׳•׳׳ ׳”׳׳™׳©׳™ ׳©׳ ׳”׳™׳•׳');
  loadState();
});

// ---------- Sound (real audio files + unlock on first gesture) ----------
let audioReady = false;
function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  ['snd-beep', 'snd-chime'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.muted = true;
    Promise.resolve(el.play()).then(() => {
      el.pause(); el.currentTime = 0; el.muted = false;
    }).catch(() => { el.muted = false; });
  });
}
document.addEventListener('click', unlockAudio);

function playSound(loop = false) {
  const type = localStorage.getItem('carlos-sound') || 'chime';
  const el = document.getElementById('snd-' + type);
  if (!el) return;
  el.muted = false;
  el.loop = (loop && type === 'chime');           // ׳׳•׳׳׳” ׳¨׳§ ׳›׳©׳”׳˜׳™׳™׳׳¨ ׳׳¡׳™׳™׳, ׳׳ ׳‘׳×׳¦׳•׳’׳” ׳׳§׳“׳™׳׳”
  try { el.currentTime = 0; } catch (e) {}
  Promise.resolve(el.play()).catch(() =>
    toast('׳”׳“׳₪׳“׳₪׳ ׳—׳¡׳ ׳׳× ׳”׳¦׳׳™׳ ג€” ׳׳—׳¥ ׳₪׳¢׳ ׳׳—׳× ׳¢׳ ׳”׳“׳£ ׳•׳ ׳¡׳” ׳©׳•׳‘', false));
}

function silenceChime() {
  const el = document.getElementById('snd-chime');
  if (el) { el.loop = false; el.pause(); try { el.currentTime = 0; } catch (e) {} }
  $('#attrib-silence').classList.add('hidden');
}
function refreshSoundLabel() {
  const type = localStorage.getItem('carlos-sound') || 'chime';
  $('#tw-sound').textContent = 'נ”” ' + (type === 'beep' ? '׳¦׳™׳₪׳¦׳•׳£' : '׳¦׳׳¦׳•׳');
}
$('#tw-sound').addEventListener('click', (e) => {
  e.preventDefault();
  silenceChime();                                 // ׳¢׳•׳¦׳¨ ׳¦׳׳¦׳•׳ ׳§׳•׳“׳ ׳׳ ׳ ׳©׳׳¨ ׳—׳™
  const type = localStorage.getItem('carlos-sound') || 'chime';
  localStorage.setItem('carlos-sound', type === 'beep' ? 'chime' : 'beep');
  refreshSoundLabel();
  playSound();                                    // ׳×׳¦׳•׳’׳” ׳׳§׳“׳™׳׳” ג€” ׳₪׳¢׳ ׳׳—׳× ׳‘׳׳‘׳“
});

// ---------- Timer (timestamp-based ג€” ׳׳׳©׳™׳ ׳ ׳›׳•׳ ׳’׳ ׳‘׳¨׳§׳¢) ----------
let timerMode = 'stopwatch', interval = null, endTimeout = null;
let startTs = 0, endTs = 0, plannedTotal = 0;
let startedAt = null, pendingSeconds = 0;

const configuredSeconds = () => {
  const n = parseInt($('#tw-amount').value) || 0;
  return $('#tw-unit').value === 'seconds' ? n : n * 60;
};

function applyMode() {
  timerMode = $('#tw-mode').value;
  $('#tw-minutes-row').classList.toggle('hidden', timerMode !== 'timer');
  resetTimer();
}
$('#tw-mode').addEventListener('change', applyMode);

function resetTimer() {
  clearInterval(interval); interval = null;
  clearTimeout(endTimeout); endTimeout = null;
  startTs = 0; endTs = 0; plannedTotal = 0;
  $('#tw-display').textContent = fmt(timerMode === 'timer' ? configuredSeconds() : 0);
  $('#tw-start').classList.remove('hidden');
  $('#tw-stop').classList.add('hidden');
}

function tick() {
  if (!interval) return;
  if (timerMode === 'stopwatch') {
    const elapsedSec = Math.floor((Date.now() - startTs) / 1000);
    $('#tw-display').textContent = fmt(elapsedSec);
  } else {
    const remainingSec = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
    $('#tw-display').textContent = fmt(remainingSec);
    if (remainingSec <= 0) triggerFinish();          // ׳’׳™׳‘׳•׳™ ׳׳ setTimeout ׳₪׳™׳’׳¨
  }
}

function triggerFinish() {
  if (!interval) return;                              // ׳׳•׳’׳ ׳׳§׳¨׳™׳׳” ׳›׳₪׳•׳׳”
  playSound(true);
  toast('ג° ׳”׳˜׳™׳™׳׳¨ ׳”׳¡׳×׳™׳™׳!');
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('ג° ׳”׳˜׳™׳™׳׳¨ ׳”׳¡׳×׳™׳™׳', { body: '׳§׳¨׳׳•׳¡ ׳“׳׳©׳‘׳•׳¨׳“' }); } catch (e) {}
  }
  finishTimer();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && interval) tick();           // ׳¡׳ ׳›׳¨׳•׳ ׳׳™׳™׳“׳™ ׳‘׳—׳–׳¨׳” ׳׳˜׳׳‘
});

$('#tw-start').addEventListener('click', () => {
  if (timerMode === 'timer') {
    plannedTotal = configuredSeconds();
    if (plannedTotal <= 0) { toast('׳§׳‘׳¢ ׳“׳§׳•׳× ׳׳• ׳©׳ ׳™׳•׳×', false); return; }
  } else {
    plannedTotal = 0;
  }
  startTs = Date.now();
  endTs = (timerMode === 'timer') ? startTs + plannedTotal * 1000 : 0;
  startedAt = new Date(startTs).toISOString();
  $('#tw-start').classList.add('hidden');
  $('#tw-stop').classList.remove('hidden');
  interval = setInterval(tick, 1000);
  if (timerMode === 'timer') endTimeout = setTimeout(triggerFinish, plannedTotal * 1000);
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }
  tick();
});

$('#tw-stop').addEventListener('click', finishTimer);

function finishTimer() {
  clearInterval(interval); interval = null;
  clearTimeout(endTimeout); endTimeout = null;
  $('#tw-stop').classList.add('hidden');
  const totalSec = (timerMode === 'timer')
    ? plannedTotal
    : Math.floor((Date.now() - startTs) / 1000);
  if (totalSec > 0) openAttrib(totalSec); else resetTimer();
}

// ---------- Attribution dialog (event delegation, bound once) ----------
function openAttrib(seconds) {
  pendingSeconds = seconds;
  $('#attrib-dur').textContent = '׳׳©׳: ' + fmt(seconds);
  $('#attrib-note').value = '';
  $('#attrib-domains').innerHTML = `
    <div class="attrib-domains-label">׳‘׳—׳¨ ׳ ׳•׳©׳:</div>
    <div class="attrib-radios">
      ${DOMAINS.map((d, i) => `<label class="attrib-radio">
        <input type="radio" name="attrib-domain" value="${d.id}" data-label="${d.label}" ${i === 4 ? 'checked' : ''}>
        <span>${d.label}</span>
      </label>`).join('')}
    </div>
    <button id="attrib-save" type="button" class="attrib-save">נ’¾ ׳©׳׳•׳¨ ׳–׳׳</button>
  `;
  const chimeLooping = (localStorage.getItem('carlos-sound') || 'chime') === 'chime' && timerMode === 'timer';
  $('#attrib-silence').classList.toggle('hidden', !chimeLooping);
  $('#attrib-overlay').classList.remove('hidden');
  setTimeout(() => $('#attrib-note').focus(), 50);

  $('#attrib-save').addEventListener('click', async () => {
    silenceChime();
    const sel = document.querySelector('input[name="attrib-domain"]:checked');
    if (!sel) { toast('׳‘׳—׳¨ ׳ ׳•׳©׳', false); return; }
    const note = $('#attrib-note').value.trim();
    await api('/api/timer', {
      domain: sel.value, label: sel.dataset.label, mode: timerMode,
      seconds: pendingSeconds, note: note, started_at: startedAt
    });
    closeAttrib();
    toast('ג“ ׳ ׳¨׳©׳: ' + fmt(pendingSeconds) + ' ֲ· ' + sel.dataset.label + (note ? ' ֲ· "' + note + '"' : ''));
    loadState();
  });
}
function closeAttrib() {
  silenceChime();
  $('#attrib-overlay').classList.add('hidden');
  resetTimer();
}
$('#attrib-domains').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  silenceChime();
  const note = $('#attrib-note').value.trim();
  await api('/api/timer', {
    domain: b.dataset.id, label: b.dataset.label, mode: timerMode,
    seconds: pendingSeconds, note: note, started_at: startedAt
  });
  closeAttrib();
  toast('ג“ ׳ ׳¨׳©׳: ' + fmt(pendingSeconds) + ' ֲ· ' + b.dataset.label + (note ? ' ֲ· "' + note + '"' : ''));
  loadState();
});
$('#attrib-close').addEventListener('click', () => {
  closeAttrib();
  toast('׳”׳—׳׳•׳ ׳ ׳¡׳’׳¨ ג€” ׳”׳–׳׳ ׳׳ ׳ ׳¨׳©׳');
});
$('#attrib-silence').addEventListener('click', () => {
  silenceChime();
  toast('נ”• ׳”׳¦׳׳¦׳•׳ ׳”׳•׳©׳×׳§');
});

// ---------- Manual time entry ----------
$('#tw-manual').addEventListener('click', (e) => {
  e.preventDefault();
  const box = $('#tw-manual-box');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  box.innerHTML =
    `<select id="m-domain">${DOMAINS.map(d => `<option value="${d.id}">${d.label}</option>`).join('')}</select>
     <input type="number" id="m-min" min="1" placeholder="׳“׳§׳•׳×">
     <input type="text" id="m-note" placeholder="׳”׳¢׳¨׳” (׳׳•׳₪׳¦׳™׳•׳ ׳׳™)">
     <button id="m-save">׳©׳׳•׳¨ ׳–׳׳</button>`;
  box.classList.remove('hidden');
  $('#m-save').addEventListener('click', async () => {
    const min = parseInt($('#m-min').value);
    if (!min) { toast('׳›׳×׳•׳‘ ׳›׳׳” ׳“׳§׳•׳×', false); return; }
    const d = DOMAINS.find(x => x.id === $('#m-domain').value);
    const note = $('#m-note').value.trim();
    await api('/api/timer', {
      domain: d.id, label: d.label, mode: 'manual',
      seconds: min * 60, note: note, started_at: new Date().toISOString()
    });
    box.classList.add('hidden');
    toast('ג“ ' + min + ' ׳“׳§׳•׳× ׳ ׳¨׳©׳׳• ֲ· ' + d.label);
    loadState();
  });
});

// ---------- Contacts (clients + events) ----------
let activeTab = 'clients';

let showArchive = false;

function renderContacts(state) {
  let allItems = activeTab === 'clients' ? (state.clients || []) : (state.events || []);
  if (contactSearchQ) {
    const q = contactSearchQ;
    allItems = allItems.filter(it => {
      const hay = [it.name, it.contact, it.phone, it.email, it.city, it.location]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  const active   = allItems.filter(it => !it.archived);
  const archived = allItems.filter(it =>  it.archived);

  document.querySelectorAll('.ct-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === activeTab));

  const renderItem = (it) => activeTab === 'clients' ? clientCard(it) : eventCard(it);

  let html = active.length
    ? active.map(renderItem).join('')
    : '<div class="muted-text" style="padding:8px 0">׳׳™׳ ׳¢׳“׳™׳™׳ ג€” ׳׳—׳¥ "+ ׳”׳•׳¡׳£"</div>';

  // Archive section
  if (archived.length > 0) {
    if (showArchive) {
      html += `<div class="ct-archive-divider">
        <span class="ct-archive-label">נ“¦ ׳׳¨׳›׳™׳•׳ (${archived.length})</span>
        <button class="ct-archive-toggle" id="ct-hide-archive">ג• ׳”׳¡׳×׳¨ ׳׳¨׳›׳™׳•׳</button>
      </div>`;
      html += '<div class="ct-archive-list">' + archived.map(renderItem).join('') + '</div>';
    } else {
      html += `<div class="ct-archive-divider">
        <button class="ct-archive-toggle" id="ct-show-archive">נ“¦ ׳”׳¦׳’ ׳׳¨׳›׳™׳•׳ (${archived.length})</button>
      </div>`;
    }
  }

  $('#contacts-list').innerHTML = html;

  document.querySelectorAll('#contacts-list .ct-card').forEach(card =>
    card.addEventListener('click', () => {
      if (card.classList.contains('expanded')) return;
      expandCard(card, card.dataset.type, card.dataset.id);
    }));
  document.getElementById('ct-show-archive')?.addEventListener('click', () => {
    showArchive = true; renderContacts(state);
  });
  document.getElementById('ct-hide-archive')?.addEventListener('click', () => {
    showArchive = false; renderContacts(state);
  });
}

function clientCard(c) {
  const sub = [c.city, c.phone].filter(Boolean).join(' ֲ· ');
  const photo = c.photo_url
    ? `<img src="${c.photo_url}" class="ct-avatar" alt="">`
    : `<span class="ct-avatar ct-avatar-empty">נ‘₪</span>`;
  const archCls = c.archived ? ' ct-card-archived' : '';
  return `<div class="ct-card${archCls}" data-id="${c.id}" data-type="client">
    <div class="ct-summary">
      ${photo}
      <div><strong>${c.name || '(׳׳׳ ׳©׳)'}</strong>
      <span class="muted-text">${sub || ' '}</span></div>
    </div>
  </div>`;
}

function eventCard(e) {
  const statusLabel = { lead: 'נ¡ ׳׳™׳“', booked: 'נ¢ ׳¡׳’׳•׳¨', done: 'ג× ׳‘׳•׳¦׳¢' }[e.status] || '';
  const archCls = e.archived ? ' ct-card-archived' : '';
  return `<div class="ct-card${archCls}" data-id="${e.id}" data-type="event">
    <div class="ct-summary">
      <strong>${e.date || '(׳׳׳ ׳×׳׳¨׳™׳)'} ֲ· ${e.contact || ''}</strong>
      <span class="muted-text">${statusLabel}</span>
    </div>
  </div>`;
}

function expandCard(card, type, id) {
  const item = (type === 'client'
    ? (lastState.clients || []).find(c => c.id === id)
    : (lastState.events || []).find(e => e.id === id)) || {};
  card.classList.add('expanded');
  card.innerHTML = type === 'client' ? clientForm(item) : eventForm(item);
  bindFormButtons(card, type, id);
}

function fld(name, label, value, type, options) {
  const v = (value == null ? '' : String(value)).replace(/"/g, '&quot;');
  if (type === 'textarea') {
    const ph = name === 'notes' ? '׳›׳×׳•׳‘ ׳‘׳—׳•׳₪׳©׳™׳•׳× ׳¢׳ ׳”׳©׳™׳—׳” ג€” ׳§׳¨׳׳•׳¡ ׳™׳©׳׳‘ ׳׳× ׳”׳₪׳¨׳˜׳™׳' : '';
    return `<label>${label}<textarea name="${name}" placeholder="${ph}">${v}</textarea></label>`;
  }
  if (type === 'select' && options) {
    const opts = options.map(([val, txt]) => `<option value="${val}"${val === value ? ' selected' : ''}>${txt}</option>`).join('');
    return `<label>${label}<select name="${name}">${opts}</select></label>`;
  }
  if (type === 'number') return `<label>${label}<input type="number" name="${name}" value="${v}"></label>`;
  if (type === 'date') return `<label>${label}<input type="date" name="${name}" value="${v}"></label>`;
  if (type === 'time') return `<label>${label}<input type="time" name="${name}" value="${v}"></label>`;
  if (type === 'file_upload') return `<label>${label}<input type="file" data-upload-target="${name}" accept="image/*,video/*"><div class="hint muted-text">׳§׳•׳‘׳¥ ׳¢׳“ 20MB ׳™׳™׳©׳׳¨ ׳׳¦׳׳ ׳׳§׳•׳׳™׳×</div></label>`;
  return `<label>${label}<input type="text" name="${name}" value="${v}"></label>`;
}

function clientForm(c) {
  const photoHtml = c.photo_url
    ? `<div class="client-photo-wrap"><img src="${c.photo_url}" class="client-photo-thumb" alt="׳×׳׳•׳ ׳”">
        <button type="button" class="client-photo-remove" title="׳”׳¡׳¨ ׳×׳׳•׳ ׳”">ג•</button></div>`
    : `<div class="client-photo-wrap client-photo-empty">נ‘₪</div>`;
  return `<div class="ct-form">
    <div class="client-photo-row">
      <div class="client-photo-area" data-url="${c.photo_url || ''}">
        ${photoHtml}
      </div>
      <label class="client-photo-label">
        <span class="client-photo-btn">נ“· ׳”׳¢׳׳” ׳×׳׳•׳ ׳”</span>
        <input type="file" class="client-photo-input" accept="image/*" style="display:none">
      </label>
    </div>
    ${fld('name', '׳©׳', c.name)}
    ${fld('contact', '׳׳™׳© ׳§׳©׳¨', c.contact)}
    ${fld('city', '׳¢׳™׳¨', c.city)}
    ${fld('phone', '׳˜׳׳₪׳•׳', c.phone)}
    ${fld('email', '׳׳™׳™׳', c.email)}
    ${fld('source', '׳׳§׳•׳¨ ׳”׳₪׳ ׳™׳”', c.source)}
    ${fld('treatment_type', '׳¡׳•׳’ ׳˜׳™׳₪׳•׳ / ׳›׳׳‘', c.treatment_type)}
    ${fld('notes', '׳”׳¢׳¨׳•׳×', c.notes, 'textarea')}
    ${c.id ? contactTasksSection(c.id, 'client') : ''}
    <div class="ct-actions">
      <button class="ct-save">׳©׳׳•׳¨</button>
      ${c.id && !c.archived ? '<button class="ct-archive">נ“¦ ׳”׳¢׳‘׳¨ ׳׳׳¨׳›׳™׳•׳</button>' : ''}
      ${c.id && c.archived ? '<button class="ct-unarchive">ג†© ׳”׳—׳–׳¨ ׳׳₪׳¢׳™׳׳™׳</button>' : ''}
      ${c.id ? '<button class="ct-del">ג• ׳׳—׳§</button>' : ''}
      <button class="ct-cancel">׳¡׳’׳•׳¨</button>
    </div>
  </div>`;
}

function eventForm(e) {
  const s = e.status || 'lead';
  return `<div class="ct-form">
    ${fld('date', '׳×׳׳¨׳™׳', e.date, 'date')}
    ${fld('contact', '׳׳™׳© ׳§׳©׳¨', e.contact)}
    ${fld('phone', '׳˜׳׳₪׳•׳', e.phone)}
    ${fld('source', '׳׳§׳•׳¨ ׳”׳₪׳ ׳™׳”', e.source)}
    ${fld('location', '׳׳™׳§׳•׳', e.location)}
    ${fld('attendees', '׳›׳׳•׳× ׳׳ ׳©׳™׳', e.attendees, 'number')}
    ${fld('style', '׳¡׳’׳ ׳•׳ ׳׳•׳–׳™׳§׳׳™', e.style)}
    ${fld('hours', '׳©׳¢׳•׳×', e.hours)}
    ${fld('payment', '׳×׳©׳׳•׳ (ג‚×)', e.payment, 'number')}
    <label>׳¡׳˜׳˜׳•׳¡
      <select name="status">
        <option value="lead" ${s==='lead'?'selected':''}>נ¡ ׳׳™׳“</option>
        <option value="booked" ${s==='booked'?'selected':''}>נ¢ ׳¡׳’׳•׳¨</option>
        <option value="done" ${s==='done'?'selected':''}>ג× ׳‘׳•׳¦׳¢</option>
      </select>
    </label>
    ${fld('notes', '׳”׳¢׳¨׳•׳×', e.notes, 'textarea')}
    ${e.id ? contactTasksSection(e.id, 'event') : ''}
    <div class="ct-actions">
      <button class="ct-save">׳©׳׳•׳¨</button>
      ${e.id && !e.archived ? '<button class="ct-archive">נ“¦ ׳”׳¢׳‘׳¨ ׳׳׳¨׳›׳™׳•׳</button>' : ''}
      ${e.id && e.archived ? '<button class="ct-unarchive">ג†© ׳”׳—׳–׳¨ ׳׳₪׳¢׳™׳׳™׳</button>' : ''}
      ${e.id ? '<button class="ct-del">ג• ׳׳—׳§</button>' : ''}
      <button class="ct-cancel">׳¡׳’׳•׳¨</button>
    </div>
  </div>`;
}

function contactTasksSection(contactId, type) {
  const key = type === 'client' ? 'client_id' : 'event_id';
  const tasks = ((lastState && lastState.tasks) || []).filter(t => t[key] === contactId && t.status === 'pending');
  const rows = tasks.length
    ? tasks.map(t => `<div class="ct-task-row">
        <input type="checkbox" data-task-id="${t.id}" class="ct-task-check">
        <span>${t.title}</span>
        ${t.due_date ? `<span class="due-chip">${dueLabel(t)}</span>` : ''}
      </div>`).join('')
    : '<div class="muted-text" style="font-size:.85rem">׳׳™׳ ׳׳©׳™׳׳•׳× ׳₪׳×׳•׳—׳•׳×</div>';
  return `<div class="ct-tasks">
    <div class="ct-tasks-title">נ“‹ ׳׳©׳™׳׳•׳× (${tasks.length})</div>
    <div class="ct-tasks-list">${rows}</div>
    <div class="ct-tasks-add">
      <input type="text" class="ct-task-new" placeholder="+ ׳׳©׳™׳׳” ׳—׳“׳©׳”">
      <input type="date" class="ct-task-date" title="׳×׳׳¨׳™׳ (׳׳•׳₪׳¦׳™׳•׳ ׳׳™)">
      <button type="button" class="ct-task-add">׳”׳•׳¡׳£</button>
    </div>
  </div>`;
}

function collectForm(card) {
  const data = {};
  card.querySelectorAll('[name]').forEach(el => {
    if (el.value !== '') {
      if (el.type === 'number') {
        const n = parseFloat(el.value);
        if (!isNaN(n)) data[el.name] = n;
      } else {
        data[el.name] = el.value;
      }
    }
  });
  return data;
}

function bindFormButtons(card, type, id) {
  const apiBase = '/api/' + (type === 'client' ? 'client' : 'event');

  // ׳×׳׳•׳ ׳× ׳₪׳¨׳•׳₪׳™׳ ׳׳׳§׳•׳—
  if (type === 'client') {
    const photoInput = card.querySelector('.client-photo-input');
    const photoArea  = card.querySelector('.client-photo-area');
    if (photoInput && photoArea) {
      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { toast('׳”׳§׳•׳‘׳¥ ׳’׳“׳•׳ ׳-20MB', false); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const dataBase64 = String(reader.result).split(',')[1];
          try {
            const r = await api('/api/upload', { filename: file.name, dataBase64 });
            if (r && r.url) {
              photoArea.dataset.url = r.url;
              photoArea.innerHTML = `<img src="${r.url}" class="client-photo-thumb" alt="׳×׳׳•׳ ׳”">
                <button type="button" class="client-photo-remove" title="׳”׳¡׳¨ ׳×׳׳•׳ ׳”">ג•</button>`;
              bindPhotoRemove(photoArea);
              toast('ג“ ׳×׳׳•׳ ׳” ׳”׳•׳¢׳׳×׳”');
            }
          } catch (err) { toast('׳©׳’׳™׳׳” ׳‘׳”׳¢׳׳׳× ׳×׳׳•׳ ׳”', false); }
        };
        reader.readAsDataURL(file);
      });
      bindPhotoRemove(photoArea);
    }
  }

  card.querySelector('.ct-save').addEventListener('click', async () => {
    const data = collectForm(card);
    // ׳”׳•׳¡׳£ photo_url ׳׳”-data attribute
    const photoArea = card.querySelector('.client-photo-area');
    if (photoArea) {
      const url = photoArea.dataset.url;
      if (url) data.photo_url = url; else delete data.photo_url;
    }
    if (id && id !== 'new') {
      await api(apiBase + '/update', { ...data, id });
      toast('ג“ ׳¢׳•׳“׳›׳');
    } else {
      if (!Object.keys(data).length) { toast('׳׳׳ ׳׳₪׳—׳•׳× ׳©׳“׳” ׳׳—׳“', false); return; }
      await api(apiBase + '/add', data);
      toast('ג“ ׳ ׳•׳¡׳£');
    }
    loadState();
  });
  const delBtn = card.querySelector('.ct-del');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const label = type === 'event' ? '׳”׳׳™׳¨׳•׳¢' : '׳”׳׳˜׳•׳₪׳';
      if (!confirm(`׳”׳׳ ׳׳×׳” ׳‘׳˜׳•׳— ׳©׳‘׳¨׳¦׳•׳ ׳ ׳׳׳—׳•׳§ ׳׳× ${label} ׳׳¦׳׳™׳×׳•׳×?\n\n׳₪׳¢׳•׳׳” ׳–׳• ׳׳ ׳ ׳™׳×׳ ׳× ׳׳‘׳™׳˜׳•׳.\n׳׳ ׳¨׳§ ׳¨׳•׳¦׳” ׳׳”׳¡׳×׳™׳¨ ג€” ׳׳—׳¥ "נ“¦ ׳”׳¢׳‘׳¨ ׳׳׳¨׳›׳™׳•׳" ׳‘׳׳§׳•׳.`)) return;
      await api(apiBase + '/delete', { id });
      toast('נ—‘ן¸ ׳ ׳׳—׳§ ׳׳¦׳׳™׳×׳•׳×');
      loadState();
    });
  }
  const archBtn = card.querySelector('.ct-archive');
  if (archBtn) {
    archBtn.addEventListener('click', async () => {
      await api(apiBase + '/update', { id, archived: true });
      toast('נ“¦ ׳”׳•׳¢׳‘׳¨ ׳׳׳¨׳›׳™׳•׳');
      loadState();
    });
  }
  const unarchBtn = card.querySelector('.ct-unarchive');
  if (unarchBtn) {
    unarchBtn.addEventListener('click', async () => {
      await api(apiBase + '/update', { id, archived: false });
      toast('ג†© ׳”׳•׳—׳–׳¨ ׳׳₪׳¢׳™׳׳™׳');
      loadState();
    });
  }
  card.querySelector('.ct-cancel').addEventListener('click', () => loadState());

  // Per-contact task checkboxes + add row
  card.querySelectorAll('.ct-task-check').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/task', { action: 'toggle', id: cb.dataset.taskId });
      toast('ג“ ׳׳©׳™׳׳” ׳”׳•׳©׳׳׳”');
      loadState();
    }));
  const tAdd = card.querySelector('.ct-task-add');
  const tInp = card.querySelector('.ct-task-new');
  if (tAdd && tInp && id !== 'new') {
    const tDate = card.querySelector('.ct-task-date');
    const addCT = async () => {
      const v = tInp.value.trim();
      if (!v) return;
      const payload = { action: 'add', title: v };
      payload[type === 'client' ? 'client_id' : 'event_id'] = id;
      if (tDate && tDate.value) payload.due_date = tDate.value;
      await api('/api/task', payload);
      toast('ג“ ׳׳©׳™׳׳” ׳ ׳•׳¡׳₪׳”');
      loadState();
    };
    tAdd.addEventListener('click', addCT);
    tInp.addEventListener('keydown', e => { if (e.key === 'Enter') addCT(); });
  }
}

document.querySelectorAll('.ct-tab').forEach(t =>
  t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    if (lastState) renderContacts(lastState);
  }));

// ---------- Capture (׳©׳™׳—׳” ׳—׳•׳₪׳©׳™׳×) ----------
document.getElementById('capture-btn')?.addEventListener('click', () => {
  document.getElementById('capture-box').classList.remove('hidden');
  document.getElementById('capture-btn').classList.add('hidden');
  setTimeout(() => document.getElementById('capture-text').focus(), 60);
});
document.getElementById('capture-cancel')?.addEventListener('click', () => {
  document.getElementById('capture-box').classList.add('hidden');
  document.getElementById('capture-btn').classList.remove('hidden');
  document.getElementById('capture-text').value = '';
  document.getElementById('capture-result').classList.add('hidden');
});
document.getElementById('capture-save')?.addEventListener('click', async () => {
  const text = (document.getElementById('capture-text').value || '').trim();
  if (!text) { toast('׳›׳×׳•׳‘ ׳׳× ׳”׳©׳™׳—׳” ׳§׳•׳“׳', false); return; }
  const type = document.querySelector('input[name="capture-type"]:checked')?.value || 'client';

  // Parse the text into structured fields using simple regex/heuristics
  const parsed = parseCaptureText(text, type);

  const res = await api('/api/capture/save', { text, type, parsed });
  const resultEl = document.getElementById('capture-result');
  resultEl.classList.remove('hidden');

  if (res.created) {
    resultEl.innerHTML = `<div class="capture-ok">ג… ${type === 'client' ? '׳׳˜׳•׳₪׳' : '׳׳™׳¨׳•׳¢'} ׳ ׳•׳¦׳¨!
      <div class="capture-fields">${formatParsed(parsed)}</div>
      <div class="capture-note muted-text">׳‘׳“׳•׳§ ׳‘׳›׳¨׳˜׳™׳¡ ׳”׳׳˜׳•׳₪׳ ׳•׳¢׳“׳›׳ ׳׳ ׳¦׳¨׳™׳ גן¸</div>
    </div>`;
    toast(type === 'client' ? 'ג“ ׳׳˜׳•׳₪׳ ׳ ׳•׳¡׳£ ׳׳”׳©׳™׳—׳”' : 'ג“ ׳׳™׳¨׳•׳¢ ׳ ׳•׳¡׳£ ׳׳”׳©׳™׳—׳”');
    loadState();
  } else {
    resultEl.innerHTML = `<div class="capture-ok">נ’¾ ׳”׳©׳™׳—׳” ׳ ׳©׳׳¨׳” (carlos/captures/)
      <div class="capture-note muted-text">׳”׳₪׳¨׳˜׳™׳ ׳©׳ ׳׳¦׳׳•: ${formatParsed(parsed) || '׳׳ ׳ ׳׳¦׳׳• ׳₪׳¨׳˜׳™׳ ׳׳•׳‘׳ ׳™׳ ג€” ׳”׳•׳¡׳£ ׳™׳“׳ ׳™׳×'}</div>
    </div>`;
    toast('ג“ ׳©׳™׳—׳” ׳ ׳©׳׳¨׳”');
  }
});

function parseCaptureText(text, type) {
  const p = {};
  // Phone: 05X-XXXXXXX or 05XXXXXXXXX
  const phone = text.match(/0(?:5[0-9])[- ]?\d{3}[- ]?\d{4}/);
  if (phone) p.phone = phone[0].replace(/[- ]/g, '-');
  // Email
  const email = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  if (email) p.email = email[0];
  // City: common Israeli cities
  const cities = ['׳×׳ ׳׳‘׳™׳‘','׳™׳¨׳•׳©׳׳™׳','׳—׳™׳₪׳”','׳¨׳׳©׳•׳ ׳׳¦׳™׳•׳','׳₪׳×׳— ׳×׳§׳•׳•׳”','׳׳©׳“׳•׳“','׳‘׳׳¨ ׳©׳‘׳¢','׳ ׳×׳ ׳™׳”','׳‘׳ ׳™ ׳‘׳¨׳§','׳¨׳׳× ׳’׳','׳’׳‘׳¢׳×׳™׳™׳','׳”׳¨׳¦׳׳™׳”','׳—׳•׳׳•׳','׳¨׳¢׳ ׳ ׳”','׳›׳₪׳¨ ׳¡׳‘׳','׳׳•׳“׳™׳¢׳™׳','׳׳©׳§׳׳•׳','׳¨׳—׳•׳‘׳•׳×','׳‘׳× ׳™׳','׳׳•׳“'];
  const cityMatch = cities.find(c => text.includes(c));
  if (cityMatch) p.city = cityMatch;
  // Date patterns: DD/MM, ׳™׳•׳ X
  const hebrewDate = text.match(/׳™׳•׳\s+(׳¨׳׳©׳•׳|׳©׳ ׳™|׳©׳׳™׳©׳™|׳¨׳‘׳™׳¢׳™|׳—׳׳™׳©׳™|׳©׳™׳©׳™|׳©׳‘׳×)/);
  if (hebrewDate && type === 'event') p.date = hebrewDate[0];
  // Name: first Hebrew word-pair that follows common intros
  const nameMatch = text.match(/(?:׳¢׳|׳©׳|׳׳§׳•׳—(?:׳”)?|׳-?)\s+([׳-׳×]{2,}\s+[׳-׳×]{2,})/);
  if (nameMatch) {
    if (type === 'client') p.name = nameMatch[1];
    else p.contact = nameMatch[1];
  } else {
    // Single Hebrew name after common words
    const singleName = text.match(/(?:׳¢׳|׳׳§׳•׳—(?:׳”)?|׳-?)\s+([׳-׳×]{2,8})/);
    if (singleName) {
      if (type === 'client') p.name = singleName[1];
      else p.contact = singleName[1];
    }
  }
  // Notes: always save the full text
  p.notes = text;
  return p;
}

function formatParsed(p) {
  const labels = { name:'׳©׳', contact:'׳׳™׳© ׳§׳©׳¨', phone:'׳˜׳׳₪׳•׳', email:'׳׳™׳™׳', city:'׳¢׳™׳¨', date:'׳×׳׳¨׳™׳', notes:'' };
  return Object.entries(p)
    .filter(([k, v]) => v && k !== 'notes')
    .map(([k, v]) => `<span class="cp-field">${labels[k] || k}: <strong>${v}</strong></span>`)
    .join('');
}

function bindPhotoRemove(photoArea) {
  const btn = photoArea.querySelector('.client-photo-remove');
  if (!btn) return;
  btn.addEventListener('click', () => {
    photoArea.dataset.url = '';
    photoArea.innerHTML = `<div class="client-photo-empty">נ‘₪</div>`;
  });
}

$('#add-contact').addEventListener('click', () => {
  const type = activeTab === 'clients' ? 'client' : 'event';
  const card = document.createElement('div');
  card.className = 'ct-card expanded';
  card.dataset.id = 'new';
  card.dataset.type = type;
  card.innerHTML = type === 'client' ? clientForm({}) : eventForm({ status: 'lead' });
  $('#contacts-list').prepend(card);
  bindFormButtons(card, type, 'new');
});

// ---------- Calendar quick-access ----------
$('#cal-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.open('https://calendar.google.com/calendar/u/0/r/week', 'gcal',
    'width=960,height=720,left=120,top=80');
});

// ---------- Habits history ג€” last 7 days grid ----------
function renderHabitsHistory(habits, todayKey) {
  const container = document.getElementById('habits-history-grid');
  if (!container) return;
  const completions = habits.completions || {};
  const todayUtc = new Date(todayKey + 'T12:00:00Z');

  // Build last 7 days (today included as rightmost)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayUtc); d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('he-IL', { weekday: 'short' });
    days.push({ key, label, isToday: key === todayKey });
  }

  const headRow = `<tr>
    <th></th>
    ${days.map(d => `<th class="${d.isToday ? 'hh-label-today' : ''}">${d.label}</th>`).join('')}
    <th class="hh-sum">׳¡׳”"׳›</th>
  </tr>`;

  const bodyRows = habits.habits.map(h => {
    const cells = days.map(d => {
      const done = (completions[d.key] || []).includes(h.id);
      const cls = d.isToday ? 'hh-dot-today' : (done ? 'hh-dot-done' : 'hh-dot-miss');
      return `<td class="hh-dot ${cls}"><span>${done ? 'ג“' : 'ֲ·'}</span></td>`;
    });
    const total = days.filter(d => (completions[d.key] || []).includes(h.id)).length;
    const sumCls = total >= 5 ? 'hh-sum-good' : '';
    return `<tr>
      <td class="hh-habit-name">${h.emoji} ${h.label}</td>
      ${cells.join('')}
      <td class="hh-sum ${sumCls}">${total}/7</td>
    </tr>`;
  }).join('');

  container.innerHTML = `<table class="hh-table"><thead>${headRow}</thead><tbody>${bodyRows}</tbody></table>`;
}

// ---------- Sidebar ג€” Focus (editable) ----------
function renderSbFocus(items, dateKey) {
  const body = document.getElementById('sb-focus-body');
  const dateEl = document.getElementById('sb-focus-date');
  if (!body) return;
  if (dateEl && dateKey) {
    dateEl.textContent = new Date(dateKey + 'T12:00:00Z')
      .toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  const itemsHtml = items.length
    ? items.map((it, i) =>
        `<div class="sbf-item">
          <span class="sbf-emoji">${it.emoji || 'ג€¢'}</span>
          <span class="sbf-text">${it.text || ''}</span>
          <button class="sbf-edit-btn" data-idx="${i}" title="׳¢׳¨׳•׳">גן¸</button>
          <button class="sbf-del-btn"  data-idx="${i}" title="׳”׳¡׳¨">ג•</button>
        </div>`).join('')
    : '<div class="muted-text" style="font-size:.88rem;padding:6px 0">׳׳ ׳”׳•׳’׳“׳¨ ׳₪׳•׳§׳•׳¡ ׳׳”׳™׳•׳</div>';

  body.innerHTML = itemsHtml + `<button class="sbf-add-btn">+ ׳”׳•׳¡׳£ ׳₪׳•׳§׳•׳¡</button>`;

  body.querySelectorAll('.sbf-edit-btn').forEach(btn =>
    btn.addEventListener('click', () => openSbFocusForm(items, parseInt(btn.dataset.idx))));
  body.querySelectorAll('.sbf-del-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const updated = items.filter((_, i) => i !== idx);
      await api('/api/focus/update', { focus_today: updated });
      toast('ג“ ׳”׳•׳¡׳¨');
      loadState();
    }));
  body.querySelector('.sbf-add-btn').addEventListener('click', () => openSbFocusForm(items, -1));
}

function openSbFocusForm(items, idx) {
  const body = document.getElementById('sb-focus-body');
  if (!body) return;
  const it = idx >= 0 ? items[idx] : { emoji: 'נ¯', text: '' };

  // Remove existing form if open
  body.querySelector('.sbf-form')?.remove();

  const form = document.createElement('div');
  form.className = 'sbf-form';
  form.innerHTML = `
    <div class="sbf-form-row">
      <input type="text" id="sbf-emoji" value="${it.emoji || 'נ¯'}" maxlength="2" placeholder="נ¯">
      <input type="text" id="sbf-text"  value="${(it.text || '').replace(/"/g,'&quot;')}" placeholder="׳₪׳•׳§׳•׳¡ ׳׳”׳™׳•׳...">
    </div>
    <div class="sbf-form-btns">
      <button id="sbf-save">נ’¾ ׳©׳׳•׳¨</button>
      <button id="sbf-cancel" class="sbf-cancel">׳‘׳™׳˜׳•׳</button>
    </div>`;
  body.appendChild(form);
  form.querySelector('#sbf-text').focus();

  form.querySelector('#sbf-cancel').addEventListener('click', () => loadState());
  const doSave = async () => {
    const emoji = form.querySelector('#sbf-emoji').value.trim() || 'ג€¢';
    const text  = form.querySelector('#sbf-text').value.trim();
    if (!text) { toast('׳›׳×׳•׳‘ ׳˜׳§׳¡׳˜', false); return; }
    const updated = [...items];
    if (idx >= 0) updated[idx] = { emoji, text };
    else updated.push({ emoji, text });
    await api('/api/focus/update', { focus_today: updated });
    toast('ג“ ׳₪׳•׳§׳•׳¡ ׳¢׳•׳“׳›׳');
    loadState();
  };
  form.querySelector('#sbf-save').addEventListener('click', doSave);
  form.querySelector('#sbf-text').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') loadState();
  });
}

// ---------- Sidebar ג€” Calendar ----------
function renderSbCalendar(cal, todayKey) {
  const el = document.getElementById('sb-calendar');
  if (!el) return;

  // Merge Google Calendar events + today's appointments
  const calEvents = (cal && cal.events) ? cal.events : [];
  // Fallback: if calendar-today is empty, pull today's events from upcoming
  const effectiveCalEvents = calEvents.length > 0 ? calEvents :
    ((lastState && lastState.calendarUpcoming && lastState.calendarUpcoming.events)
      ? lastState.calendarUpcoming.events.filter(e => e.date === todayKey)
      : []);
  const bookingAppts = (lastState && lastState.bookingData && lastState.bookingData.appointments)
    ? lastState.bookingData.appointments
        .filter(a => a.status !== 'cancelled' && a.date === todayStr())
        .map(a => ({
          time: a.time,
          end_time: a.time_to || '',
          title: `נ“… ${a.patient_name}${a.service ? ' ֲ· ' + a.service : ''}`,
          location: '',
          _isBooking: true
        }))
    : [];

  const allEvents = [...effectiveCalEvents, ...bookingAppts]
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  if (!allEvents.length) {
    el.innerHTML = `<div class="cal-empty">׳׳™׳ ׳׳™׳¨׳•׳¢׳™׳ ׳׳• ׳”׳™׳•׳׳ ׳׳ ׳¢׳•׳“׳›׳ ׳¢׳“׳™׳™׳</div>
      <div class="cal-stale">נ’¡ ׳©׳׳ ׳׳× ׳§׳¨׳׳•׳¡ "׳׳” ׳™׳© ׳׳™ ׳‘׳™׳•׳׳ ׳”׳™׳•׳" ׳›׳“׳™ ׳׳¢׳“׳›׳</div>`;
    return;
  }

  const isStale = cal && cal.date !== todayKey && effectiveCalEvents.length === calEvents.length;
  const eventsHtml = allEvents.map(ev => `
    <div class="cal-event${ev._isBooking ? ' cal-event-booking' : ''}">
      <span class="cal-time">${ev.time || ''}${ev.end_time ? 'ג€“' + ev.end_time : ''}</span>
      <div>
        <div class="cal-title">${ev.title || ''}</div>
        ${ev.location ? `<div class="cal-loc">נ“ ${ev.location}</div>` : ''}
      </div>
    </div>`).join('');

  el.innerHTML = eventsHtml + (isStale
    ? `<div class="cal-stale">ג ן¸ ׳™׳•׳׳ Google ׳-${cal.date || '׳×׳׳¨׳™׳ ׳׳ ׳™׳“׳•׳¢'}</div>` : '');
}

// ---------- Section collapse (all collapsible sections) ----------
function initSectionToggles() {
  document.querySelectorAll('.card.collapsible').forEach(section => {
    const tgl = section.querySelector('.section-toggle');
    const body = section.querySelector('.section-body');
    if (!tgl || !body) return;
    const id = section.id || '';
    const stored = id ? localStorage.getItem('carlos-sec-' + id) : null;
    if (stored === '1') { body.style.display = 'none'; tgl.textContent = 'ג–¸'; }
    tgl.addEventListener('click', () => {
      const isCollapsed = body.style.display === 'none';
      body.style.display = isCollapsed ? '' : 'none';
      tgl.textContent = isCollapsed ? 'ג–¾' : 'ג–¸';
      if (id) localStorage.setItem('carlos-sec-' + id, isCollapsed ? '0' : '1');
    });
  });
}

// ---------- Collapse / Expand All ----------
(function () {
  const collapseAllBtn = document.getElementById('collapse-all-btn');
  if (!collapseAllBtn) return;
  const updateIcon = () => {
    const anyExpanded = [...document.querySelectorAll('.card.collapsible')].some(s => {
      const b = s.querySelector('.section-body');
      return b && b.style.display !== 'none';
    });
    collapseAllBtn.textContent = anyExpanded ? 'ג' : 'ג';
    collapseAllBtn.title = anyExpanded ? '׳›׳•׳•׳¥ ׳׳× ׳›׳ ׳”׳—׳׳•׳ ׳•׳×' : '׳”׳¨׳—׳‘ ׳׳× ׳›׳ ׳”׳—׳׳•׳ ׳•׳×';
  };
  collapseAllBtn.addEventListener('click', () => {
    const sections = document.querySelectorAll('.card.collapsible');
    const anyExpanded = [...sections].some(s => {
      const b = s.querySelector('.section-body');
      return b && b.style.display !== 'none';
    });
    sections.forEach(section => {
      const body = section.querySelector('.section-body');
      const tgl  = section.querySelector('.section-toggle');
      if (!body || !tgl) return;
      body.style.display = anyExpanded ? 'none' : '';
      tgl.textContent    = anyExpanded ? 'ג–¸' : 'ג–¾';
      if (section.id) localStorage.setItem('carlos-sec-' + section.id, anyExpanded ? '1' : '0');
    });
    updateIcon();
  });
  updateIcon(); // set correct icon on load
})();

// ---------- Booking section: open Google Calendar ----------
document.getElementById('booking-cal-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.open('https://calendar.google.com/calendar/u/0/r/week', 'gcal',
    'width=960,height=720,left=120,top=80');
});

// ---------- Ask Carlos (sidebar chat) ----------
(function () {
  const input = document.getElementById('ask-input');
  const btn   = document.getElementById('ask-btn');
  const resp  = document.getElementById('ask-response');
  if (!input || !btn || !resp) return;

  async function doAsk() {
    const text = input.value.trim();
    if (!text) { toast('׳›׳×׳•׳‘ ׳©׳׳׳” ׳§׳•׳“׳', false); return; }
    input.disabled = true;
    btn.disabled   = true;
    btn.textContent = 'ג³ ׳§׳¨׳׳•׳¡ ׳—׳•׳©׳‘...';
    resp.classList.add('hidden');
    try {
      const r = await api('/api/ask', { text });
      resp.innerHTML = (r.response || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\n/g,'<br>');
      resp.classList.remove('hidden');
      // refresh dashboard if Carlos updated any files
      setTimeout(() => loadState(), 800);
    } catch (e) {
      resp.textContent = '׳©׳’׳™׳׳” ׳‘׳—׳™׳‘׳•׳¨ ׳׳§׳¨׳׳•׳¡';
      resp.classList.remove('hidden');
    } finally {
      input.disabled = false;
      btn.disabled   = false;
      btn.textContent = 'ג–¶ ׳©׳׳—';
      input.value = '';
    }
  }

  btn.addEventListener('click', doAsk);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); }
  });
})();

// ---------- Playbook viewer ----------
const PB_LABELS = {
  'treatments': 'נ’† ׳˜׳™׳₪׳•׳׳™׳',
  'dj-events':  'נµ DJ ׳׳™׳¨׳•׳¢׳™׳',
  'product':    'נ€ ׳›׳׳™ ׳׳׳˜׳₪׳׳™׳',
  'learning':   'נ“ ׳׳™׳׳•׳“ ׳׳•׳–׳™׳§׳”'
};

async function openPlaybook(domain) {
  const modal = document.getElementById('playbook-modal');
  const titleEl = document.getElementById('pb-modal-title');
  const bodyEl = document.getElementById('pb-modal-body');
  if (!modal) return;
  titleEl.textContent = 'נ“– ' + (PB_LABELS[domain] || domain);
  bodyEl.innerHTML = '<div class="muted-text">׳˜׳•׳¢׳...</div>';
  modal.classList.remove('hidden');
  try {
    const r = await fetch('/api/playbook/' + domain);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const md = await r.text();
    bodyEl.innerHTML = mdToHtml(md);
  } catch (e) {
    bodyEl.innerHTML = `<div class="muted-text">׳©׳’׳™׳׳” ׳‘׳˜׳¢׳™׳ ׳× ׳”׳₪׳׳™׳™׳‘׳•׳§: ${e.message}</div>`;
  }
}

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^# /.test(raw))       { if (inList) { html += '</ul>'; inList = false; } html += `<h3 class="pb-h1">${line.slice(2)}</h3>`; }
    else if (/^## /.test(raw)) { if (inList) { html += '</ul>'; inList = false; } html += `<h4 class="pb-h2">${line.slice(3)}</h4>`; }
    else if (/^### /.test(raw)){ if (inList) { html += '</ul>'; inList = false; } html += `<h5 class="pb-h3">${line.slice(4)}</h5>`; }
    else if (/^> /.test(raw))  { if (inList) { html += '</ul>'; inList = false; } html += `<blockquote class="pb-quote">${line.slice(2)}</blockquote>`; }
    else if (/^[-*] /.test(raw)){ if (!inList) { html += '<ul class="pb-list">'; inList = true; } html += `<li>${line.slice(2)}</li>`; }
    else if (/^\d+\. /.test(raw)){ if (!inList) { html += '<ol class="pb-list">'; inList = true; } html += `<li>${line.replace(/^\d+\. /, '')}</li>`; }
    else if (raw.trim() === '')  { if (inList) { html += '</ul>'; inList = false; } html += '<div class="pb-gap"></div>'; }
    else                         { if (inList) { html += '</ul>'; inList = false; } html += `<div class="pb-line">${line}</div>`; }
  }
  if (inList) html += '</ul>';
  return html;
}

document.querySelectorAll('.pb-btn').forEach(btn =>
  btn.addEventListener('click', () => openPlaybook(btn.dataset.domain)));

document.getElementById('pb-modal-close')?.addEventListener('click', () =>
  document.getElementById('playbook-modal').classList.add('hidden'));

document.getElementById('playbook-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('playbook-modal'))
    document.getElementById('playbook-modal').classList.add('hidden');
});

// Floating chat bubble removed ג€” use sidebar "׳©׳׳ ׳§׳¨׳׳•׳¡" panel instead

// ---------- Help Modal ----------
const HELP_SECTIONS = [
  { icon: 'נ¯', title: '׳׳” ׳–׳” ׳”׳“׳׳©׳‘׳•׳¨׳“?', body: `׳›׳׳™ ׳ ׳™׳”׳•׳ ׳™׳•׳׳™ ׳׳™׳©׳™ ג€” ׳׳©׳™׳׳•׳×, ׳׳§׳•׳—׳•׳×, ׳”׳¨׳’׳׳™׳, ׳×׳•׳›׳, ׳•׳–׳׳, ׳”׳›׳ ׳‘׳׳§׳•׳ ׳׳—׳“.<br>
    ׳”׳›׳ ׳¨׳¥ <strong>׳׳§׳•׳׳™׳× ׳¢׳ ׳”׳׳—׳©׳‘ ׳©׳׳</strong> ג€” ׳׳ ׳‘׳¢׳ ׳, ׳”׳ ׳×׳•׳ ׳™׳ ׳©׳׳•׳¨׳™׳ ׳׳¦׳׳ ׳‘׳׳‘׳“.<br>
    ׳”׳₪׳¢׳׳”: ׳׳—׳™׳¦׳” ׳›׳₪׳•׳׳” ׳¢׳ <strong>start-dashboard.bat</strong> ג† ׳”׳“׳₪׳“׳₪׳ ׳ ׳₪׳×׳— ׳׳•׳˜׳•׳׳˜׳™׳×.` },

  { icon: 'נ“', title: '׳׳©׳™׳׳•׳×', body: `<strong>׳”׳•׳¡׳₪׳”:</strong> ׳›׳×׳•׳‘ ׳‘׳©׳“׳” "׳׳©׳™׳׳” ׳—׳“׳©׳”" + ׳׳—׳¥ "׳”׳•׳¡׳£". ׳׳₪׳©׳¨ ׳׳¦׳¨׳£ ׳×׳׳¨׳™׳ ׳•׳©׳¢׳”.<br>
    <strong>׳”׳©׳׳׳”:</strong> ׳׳—׳¥ ׳¢׳ ג“ ג€” ׳”׳׳©׳™׳׳” ׳¢׳•׳‘׳¨׳× ׳׳¡׳˜׳¨׳™׳§׳׳•׳× ׳‘׳×׳—׳×׳™׳× (׳¢׳ ׳׳₪׳©׳¨׳•׳× ׳‘׳™׳˜׳•׳).<br>
    <strong>׳¢׳¨׳™׳›׳”:</strong> ׳׳—׳¥ גן¸ ׳׳™׳“ ׳׳©׳™׳׳” ג€” ׳ ׳™׳×׳ ׳׳©׳ ׳•׳× ׳›׳•׳×׳¨׳×, ׳×׳׳¨׳™׳, ׳”׳¢׳¨׳•׳×, ׳׳• ׳׳׳—׳•׳§.<br>
    <strong>׳׳—׳¨:</strong> ׳§׳˜׳¢ ׳ ׳₪׳¨׳“ ׳׳×׳›׳ ׳•׳ ׳׳©׳™׳׳•׳× ׳©׳ ׳׳—׳¨. ׳׳©׳™׳׳” ׳¢׳ ׳×׳׳¨׳™׳ ׳׳—׳¨ ׳׳ ׳×׳•׳₪׳™׳¢ ׳‘׳§׳˜׳¢ ׳”׳ ׳•׳›׳—׳™.<br>
    <strong>׳—׳™׳₪׳•׳©:</strong> ׳©׳“׳” נ” ׳׳¡׳ ׳ ׳‘׳–׳׳ ׳׳׳× ׳׳₪׳™ ׳©׳ ׳”׳׳©׳™׳׳”.<br>
    <strong>ג ן¸ ׳׳“׳•׳</strong> = ׳׳©׳™׳׳” ׳©׳¢׳‘׳¨ ׳×׳׳¨׳™׳›׳” ג€” ׳™׳© ׳׳˜׳₪׳ ׳‘׳”.` },

  { icon: 'נ‘¥', title: '׳׳§׳•׳—׳•׳× ׳•׳׳™׳¨׳•׳¢׳™׳', body: `<strong>׳׳©׳•׳ ׳™׳•׳×:</strong> נ’† ׳׳§׳•׳—׳•׳× | נµ ׳׳™׳¨׳•׳¢׳™׳ ג€” ׳׳•׳¢׳‘׳¨׳™׳ ׳‘׳׳—׳™׳¦׳”.<br>
    <strong>׳”׳•׳¡׳₪׳” ׳™׳“׳ ׳™׳×:</strong> "+ ׳”׳•׳¡׳£ ׳™׳“׳ ׳™׳×" ׳₪׳•׳×׳— ׳˜׳•׳₪׳¡ ׳׳₪׳•׳¨׳˜. ׳׳§׳•׳—: ׳©׳, ׳¢׳™׳¨, ׳˜׳׳₪׳•׳, ׳׳™׳™׳, ׳׳§׳•׳¨, ׳¡׳•׳’ ׳˜׳™׳₪׳•׳. ׳׳™׳¨׳•׳¢: ׳×׳׳¨׳™׳, ׳׳™׳§׳•׳, ׳׳ ׳©׳™׳, ׳×׳©׳׳•׳, ׳¡׳’׳ ׳•׳ ׳׳•׳–׳™׳§׳׳™, ׳¡׳˜׳˜׳•׳¡.<br>
    <strong>׳×׳׳•׳ ׳× ׳₪׳¨׳•׳₪׳™׳:</strong> ׳‘׳˜׳•׳₪׳¡ ׳”׳׳§׳•׳— ג€” ׳׳—׳¥ "נ“· ׳”׳¢׳׳” ׳×׳׳•׳ ׳”" (׳¢׳“ 20MB).<br>
    <strong>׳׳›׳™׳“׳× ׳©׳™׳—׳”:</strong> ׳׳—׳¥ "נ—£ן¸ ׳׳›׳™׳“׳× ׳©׳™׳—׳”" ג† ׳›׳×׳•׳‘ ׳‘׳—׳•׳₪׳©׳™׳•׳× ׳׳” ׳“׳™׳‘׳¨׳×׳ ג€” ׳”׳׳¢׳¨׳›׳× ׳©׳•׳׳‘׳× ׳׳•׳˜׳•׳׳˜׳™׳× ׳©׳, ׳˜׳׳₪׳•׳, ׳¢׳™׳¨.<br>
    <strong>׳׳©׳™׳׳•׳× ׳¦׳׳•׳“׳•׳×:</strong> ׳‘׳›׳ ׳›׳¨׳˜׳™׳¡ ג€” "נ“‹ ׳׳©׳™׳׳•׳×" ׳׳ ׳™׳”׳•׳ ׳׳©׳™׳׳•׳× ׳¡׳₪׳¦׳™׳₪׳™׳•׳× ׳׳׳§׳•׳—/׳׳™׳¨׳•׳¢.<br>
    <strong>׳—׳™׳₪׳•׳©:</strong> ׳©׳“׳” נ” ׳׳—׳₪׳© ׳׳₪׳™ ׳©׳, ׳˜׳׳₪׳•׳, ׳¢׳™׳¨.` },

  { icon: 'נ±', title: '׳”׳¨׳’׳׳™׳', body: `׳׳—׳¥ ג“ ׳¢׳ ׳”׳¨׳’׳ ׳©׳‘׳™׳¦׳¢׳× ׳”׳™׳•׳ ג€” ׳”׳•׳ ׳™׳¡׳•׳׳ ׳›"׳”׳•׳©׳׳".<br>
    ׳׳—׳¥ ׳©׳•׳‘ ׳׳‘׳™׳˜׳•׳ ׳”׳¡׳™׳׳•׳.<br>
    ׳›׳ ׳”׳¨׳’׳ ׳׳¦׳™׳’: <strong>X/7 ׳©׳‘׳•׳¢</strong> ֲ· <strong>X/28 ׳—׳•׳“׳©</strong> ֲ· <strong>נ”¥ ׳¨׳¦׳£ ׳™׳׳™׳</strong>.<br>
    ׳§׳˜׳¢ "נ“† ׳”׳¨׳’׳׳™׳ ג€” ׳©׳‘׳•׳¢ ׳©׳¢׳‘׳¨" ׳׳¦׳™׳’ ׳˜׳‘׳׳× ׳©׳‘׳•׳¢ ׳׳׳׳” ׳׳›׳ ׳”׳¨׳’׳.` },

  { icon: 'ג±ן¸', title: '׳˜׳™׳™׳׳¨', body: `׳”׳•׳•׳™׳“׳’'׳˜ ׳”׳§׳˜׳ ׳‘׳₪׳™׳ ׳” ׳”׳©׳׳׳׳™׳× ׳׳׳˜׳”.<br>
    <strong>׳¡׳˜׳•׳₪׳¨:</strong> ג–¶ ׳”׳×׳—׳ ג†’ ג–  ׳¢׳¦׳•׳¨ ג†’ ׳‘׳—׳¨ ׳×׳—׳•׳ ג†’ נ’¾ ׳©׳׳•׳¨ ׳–׳׳.<br>
    <strong>׳˜׳™׳™׳׳¨:</strong> ׳”׳’׳“׳¨ ׳“׳§׳•׳×/׳©׳ ׳™׳•׳× ג†’ ג–¶ ׳”׳×׳—׳ ג†’ ׳¦׳׳¦׳•׳ ׳‘׳¡׳™׳•׳ ג†’ ׳©׳׳•׳¨ ׳–׳׳.<br>
    <strong>ג• ׳™׳“׳ ׳™:</strong> ׳”׳•׳¡׳£ ׳–׳׳ ׳©׳¢׳‘׳“׳× ׳‘׳׳™ ׳©׳”׳˜׳™׳™׳׳¨ ׳¨׳¥.<br>
    ׳›׳ ׳”׳–׳׳ ׳©׳ ׳¨׳©׳ ׳׳•׳₪׳™׳¢ ׳‘׳§׳˜׳¢ "ג±ן¸ ׳–׳׳ ׳©׳ ׳¨׳©׳ ׳”׳™׳•׳".` },

  { icon: 'נ“²', title: '׳×׳•׳›׳ ׳”׳©׳‘׳•׳¢', body: `׳ ׳”׳ ׳¨׳™׳׳¡׳™׳ ׳•׳₪׳•׳¡׳˜׳™׳ ׳‘׳©׳׳‘׳™׳: <strong>׳¨׳¢׳™׳•׳ ג†’ ׳˜׳™׳•׳˜׳” ג†’ ׳׳•׳›׳ ג†’ ׳₪׳•׳¨׳¡׳</strong>.<br>
    ׳׳—׳¥ ׳¢׳ ׳”׳¡׳˜׳˜׳•׳¡ ׳›׳“׳™ ׳׳”׳×׳§׳“׳ ׳©׳׳‘. "׳₪׳•׳¨׳¡׳" ׳׳¢׳“׳›׳ ׳׳•׳˜׳•׳׳˜׳™׳× ׳׳× ׳׳›׳¡׳× ׳”׳©׳‘׳•׳¢.<br>
    גן¸ ׳׳¢׳¨׳™׳›׳× ׳×׳•׳›׳ ׳”׳₪׳•׳¡׳˜, ׳§׳™׳©׳•׳¨ Docs, ׳×׳׳¨׳™׳ ׳×׳–׳׳•׳, ׳§׳•׳‘׳¥ ׳׳“׳™׳” ׳׳¦׳•׳¨׳£.<br>
    ׳©׳™׳•׳ ׳׳×׳—׳•׳: נ’† ׳˜׳™׳₪׳•׳׳™׳ / נµ ׳׳™׳¨׳•׳¢׳™׳ / נ€ ׳›׳׳™ / ג× ׳›׳׳׳™.` },

  { icon: 'נ“', title: '׳׳›׳¡׳•׳× ׳©׳‘׳•׳¢׳™׳•׳× ׳•׳™׳•׳׳™׳•׳×', body: `<strong>׳©׳‘׳•׳¢׳™ (נ“ˆ):</strong> ׳™׳¢׳“׳™׳ ׳׳©׳‘׳•׳¢ ג€” ׳¨׳™׳׳¡׳™׳, ׳₪׳•׳¡׳˜׳™׳, ׳©׳¢׳•׳×, ׳©׳™׳•׳•׳§, ׳•׳›׳•\'.<br>
    <strong>׳™׳•׳׳™ (נ“):</strong> ׳׳•׳×׳ ׳™׳¢׳“׳™׳ ׳׳‘׳ ׳׳™׳•׳ ׳”׳ ׳•׳›׳—׳™ ג€” ׳׳×׳׳₪׳¡׳™׳ ׳›׳ ׳‘׳•׳§׳¨.<br>
    גן¸ ׳׳©׳™׳ ׳•׳™ ׳™׳¢׳“ ׳‘׳›׳ ׳©׳•׳¨׳”.<br>
    <strong>׳׳™׳₪׳•׳¡ ׳©׳‘׳•׳¢׳™:</strong> ׳›׳ ׳¨׳׳©׳•׳ ׳‘׳©׳‘׳•׳¢ ׳›׳ ׳”׳׳›׳¡׳•׳× ׳׳×׳׳₪׳¡׳•׳× ׳׳•׳˜׳•׳׳˜׳™׳×.` },

  { icon: 'נ…', title: '׳‘׳¨׳™׳₪׳™׳ ׳’ ׳‘׳•׳§׳¨', body: `׳׳¦׳™׳’ ׳¡׳™׳›׳•׳ ׳©׳ ׳©׳׳¨ ׳‘׳§׳•׳‘׳¥ <code>sync/morning-briefing.md</code>.<br>
    ׳›׳•׳×׳‘ ׳׳©׳ ׳‘׳¦׳•׳¨׳” ׳׳•׳˜׳•׳׳˜׳™׳× ׳›׳©׳§׳¨׳׳•׳¡ ׳׳™׳™׳¦׳¨ ׳‘׳¨׳™׳₪׳™׳ ׳’ (׳׳—׳™׳™׳‘ ׳—׳™׳‘׳•׳¨).<br>
    ׳ ׳™׳×׳ ׳’׳ ׳׳¢׳¨׳•׳ ׳׳× ׳”׳§׳•׳‘׳¥ ׳™׳©׳™׳¨׳•׳× ׳‘׳ ׳•׳˜׳₪׳“.` },

  { icon: 'נ“§', title: '׳¡׳™׳›׳•׳ ׳׳™׳™׳׳™׳', body: `׳׳¦׳™׳’ ׳¡׳™׳›׳•׳ ׳©׳ ׳©׳׳¨ ׳‘׳§׳•׳‘׳¥ <code>sync/email-summary.md</code>.<br>
    ׳׳×׳¢׳“׳›׳ ׳׳•׳˜׳•׳׳˜׳™׳× ׳›׳©׳׳×׳—׳‘׳¨׳™׳ ׳-Gmail ׳“׳¨׳ Composio.<br>
    ׳ ׳™׳×׳ ׳׳›׳×׳•׳‘ ׳‘׳§׳•׳‘׳¥ ׳™׳“׳ ׳™׳× ׳›׳ ׳¡׳™׳›׳•׳ ׳©׳×׳¨׳¦׳”.` },

  { icon: 'נ“…', title: '׳™׳•׳׳ Google Calendar', body: `<strong>׳¡׳™׳™׳“׳‘׳¨ ג€” ׳™׳•׳׳ ׳”׳™׳•׳:</strong> ׳׳¦׳™׳’ ׳׳™׳¨׳•׳¢׳™׳ ׳-<code>sync/calendar-today.json</code>.<br>
    ׳׳—׳¥ נ”„ ׳׳¨׳¢׳ ׳•׳ ׳™׳“׳ ׳™ (׳׳—׳™׳™׳‘ ׳—׳™׳‘׳•׳¨ ׳-Google Calendar).<br>
    ׳ ׳™׳×׳ ׳׳›׳×׳•׳‘ ׳׳§׳•׳‘׳¥ ׳™׳“׳ ׳™׳×: <code>{"date":"YYYY-MM-DD","events":[{"time":"09:00","title":"׳₪׳’׳™׳©׳”"}]}</code>` },

  { icon: 'נ“', title: '׳™׳•׳׳ ׳™׳•׳׳™', body: `׳›׳×׳•׳‘ ׳׳—׳©׳‘׳•׳×, ׳”׳¨׳”׳•׳¨׳™׳, ׳¨׳¢׳™׳•׳ ׳•׳×, ׳׳• ׳¡׳™׳›׳•׳ ׳™׳•׳.<br>
    ׳׳—׳¥ "׳©׳׳•׳¨ ׳׳™׳•׳׳" ג€” ׳”׳˜׳§׳¡׳˜ ׳׳¦׳˜׳¨׳£ ׳׳§׳•׳‘׳¥ <code>journal/YYYY-MM-DD.md</code>.<br>
    ׳§׳•׳‘׳¥ ׳—׳“׳© ׳׳›׳ ׳™׳•׳. ׳ ׳™׳×׳ ׳׳₪׳×׳•׳— ׳•׳׳§׳¨׳•׳ ׳‘׳ ׳•׳˜׳₪׳“.` },

  { icon: 'נ“–', title: '׳₪׳׳™׳™׳‘׳•׳§׳™׳', body: `׳׳“׳¨׳™׳›׳™ ׳₪׳¢׳•׳׳” ׳׳₪׳™ ׳×׳—׳•׳ ׳¢׳¡׳§׳™.<br>
    ׳׳—׳¥ ׳¢׳ ׳›׳₪׳×׳•׳¨ ׳×׳—׳•׳ ׳‘׳¡׳™׳™׳“׳‘׳¨ (נ’† / נµ / נ€ / נ“) ׳׳₪׳×׳™׳—׳× ׳”׳׳“׳¨׳™׳.<br>
    ׳§׳‘׳¦׳™ ׳”׳׳“׳¨׳™׳ ׳ ׳׳¦׳׳™׳ ׳‘: <code>domains/[׳×׳—׳•׳]/playbook.md</code><br>
    ׳ ׳™׳×׳ ׳׳¢׳¨׳•׳ ׳׳•׳×׳ ׳‘׳ ׳•׳˜׳₪׳“ ג€” ׳”׳ ׳™׳™׳˜׳¢׳ ׳• ׳¢׳“׳›׳ ׳™׳™׳ ׳‘׳›׳ ׳₪׳×׳™׳—׳”.` },

  { icon: 'נ“„', title: '׳™׳™׳¦׳•׳ PDF', body: `׳׳—׳¥ נ“„ ׳‘׳›׳•׳×׳¨׳× ג€” ׳”׳“׳₪׳“׳₪׳ ׳₪׳•׳×׳— ׳—׳׳•׳ ׳”׳“׳₪׳¡׳”.<br>
    <strong>׳›׳ ׳”׳¡׳§׳©׳ ׳™׳ ׳ ׳₪׳×׳—׳™׳ ׳׳•׳˜׳•׳׳˜׳™׳×</strong> ׳׳₪׳ ׳™ ׳”׳”׳“׳₪׳¡׳”.<br>
    ׳‘׳—׳׳•׳ ׳”׳”׳“׳₪׳¡׳”: "׳©׳׳•׳¨ ׳›-PDF" ג† ׳׳™׳™׳¦׳¨ ׳§׳•׳‘׳¥ PDF ׳׳¡׳•׳“׳¨.<br>
    ׳”׳¡׳™׳™׳“׳‘׳¨, ׳”׳˜׳™׳™׳׳¨, ׳•׳›׳₪׳×׳•׳¨׳™ ׳”׳₪׳¢׳•׳׳” ׳׳•׳¡׳×׳¨׳™׳ ׳‘׳”׳“׳₪׳¡׳”.` },

  { icon: 'ג™ן¸', title: '׳”׳’׳“׳¨׳•׳×', body: `׳׳—׳¥ ג™ן¸ ׳‘׳›׳•׳×׳¨׳× ׳׳₪׳×׳™׳—׳× ׳”׳”׳’׳“׳¨׳•׳×.<br>
    <strong>׳©׳:</strong> ׳”׳©׳ ׳©׳׳•׳¦׳’ ׳‘׳‘׳¨׳›׳” ("׳‘׳•׳§׳¨ ׳˜׳•׳‘ ׳“׳•׳“").<br>
    <strong>׳©׳ ׳”׳¢׳•׳–׳¨:</strong> ׳׳•׳¦׳’ ׳‘׳›׳•׳×׳¨׳× ׳”׳˜׳׳‘ ׳•׳‘׳₪׳•׳˜׳¨ ("׳§׳¨׳׳•׳¡ ׳“׳׳©׳‘׳•׳¨׳“").<br>
    ׳׳—׳¥ נ’¾ ׳©׳׳•׳¨ ג€” ׳”׳©׳™׳ ׳•׳™׳™׳ ׳™׳•׳₪׳™׳¢׳• ׳‘׳˜׳¢׳™׳ ׳” ׳”׳‘׳׳”.<br>
    <em>׳”׳’׳“׳¨׳•׳× ׳׳×׳§׳“׳׳•׳× (׳×׳—׳•׳׳™׳, ׳™׳¢׳“׳™׳) ג€” ׳¢׳¨׳•׳ ׳׳× <code>config.json</code> ׳•-<code>weekly_plan.json</code> ׳™׳©׳™׳¨׳•׳×.</em>` },

  { icon: 'נ”§', title: '׳”׳’׳“׳¨׳” ׳¨׳׳©׳•׳ ׳™׳× / ׳§׳‘׳¦׳™ ׳׳¢׳¨׳›׳×', body: `<strong>config.json</strong> ג€” ׳©׳, ׳ ׳×׳™׳‘׳™׳, ׳×׳—׳•׳׳™׳ ׳¢׳¡׳§׳™׳™׳.<br>
    <strong>weekly_plan.json</strong> ג€” ׳™׳¢׳“׳™׳ ׳©׳‘׳•׳¢׳™׳™׳ ׳׳›׳ ׳׳›׳¡׳”.<br>
    <strong>habits.json</strong> ג€” ׳”׳•׳¡׳£/׳”׳¡׳¨ ׳”׳¨׳’׳׳™׳: <code>{"id":"h1","emoji":"נƒ","label":"׳¡׳₪׳•׳¨׳˜"}</code><br>
    <strong>׳×׳™׳§׳™׳•׳×:</strong> <code>clients/</code> ׳׳§׳•׳—׳•׳× ֲ· <code>events/</code> ׳׳™׳¨׳•׳¢׳™׳ ֲ· <code>journal/</code> ׳™׳•׳׳<br>
    <strong>׳׳©׳™׳ ׳•׳™׳™׳ ׳‘׳§׳•׳‘׳¦׳™ JSON</strong> ג€” ׳₪׳×׳— ׳‘׳ ׳•׳˜׳₪׳“, ׳©׳׳•׳¨, ׳•׳¨׳¢׳ ׳ ׳׳× ׳”׳“׳₪׳“׳₪׳.` }
];

document.getElementById('help-btn')?.addEventListener('click', openHelp);
document.getElementById('help-close')?.addEventListener('click', () =>
  document.getElementById('help-modal')?.classList.add('hidden'));
document.getElementById('help-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('help-modal'))
    document.getElementById('help-modal').classList.add('hidden');
});

function openHelp() {
  const modal = document.getElementById('help-modal');
  const bodyEl = document.getElementById('help-body');
  if (!modal || !bodyEl) return;
  bodyEl.innerHTML = HELP_SECTIONS.map(s => `
    <div class="help-section">
      <div class="help-section-title">${s.icon} ${s.title}</div>
      <div class="help-section-body">${s.body}</div>
    </div>`).join('');
  modal.classList.remove('hidden');
}

// ---------- Task History Modal ----------
function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const toEl = document.getElementById('history-to');
  const fromEl = document.getElementById('history-from');
  const today = ilDate();
  const weekAgo = ilDate(-6);
  if (!toEl.value)   toEl.value   = today;
  if (!fromEl.value) fromEl.value = weekAgo;
  const searchEl = document.getElementById('history-search');
  if (searchEl) searchEl.value = '';
  loadHistory();
}
async function loadHistory() {
  const bodyEl = document.getElementById('history-body');
  const from = document.getElementById('history-from').value;
  const to   = document.getElementById('history-to').value;
  bodyEl.innerHTML = '<div class="muted-text">׳˜׳•׳¢׳...</div>';
  try {
    const qs = [];
    if (from) qs.push('from=' + from);
    if (to)   qs.push('to=' + to);
    const r = await fetch('/api/tasks/history' + (qs.length ? '?' + qs.join('&') : ''));
    const data = await r.json();
    renderHistory(data.tasks || []);
  } catch (e) {
    bodyEl.innerHTML = '<div class="muted-text">׳©׳’׳™׳׳”: ' + e.message + '</div>';
  }
}
let _historyAllTasks = [];
function renderHistory(tasks) {
  _historyAllTasks = tasks;
  applyHistorySearch();
}
function applyHistorySearch() {
  const bodyEl = document.getElementById('history-body');
  const q = (document.getElementById('history-search')?.value || '').trim().toLowerCase();
  const allTasks = _historyAllTasks;
  const tasks = q
    ? allTasks.filter(t => (t.title || '').toLowerCase().includes(q) ||
                            (t.notes || '').toLowerCase().includes(q))
    : allTasks;
  if (!tasks.length) {
    bodyEl.innerHTML = `<div class="muted-text" style="padding:20px;text-align:center">${q ? '׳׳ ׳ ׳׳¦׳׳• ׳×׳•׳¦׳׳•׳× ׳׳—׳™׳₪׳•׳©' : '׳׳™׳ ׳׳©׳™׳׳•׳× ׳©׳”׳•׳©׳׳׳• ׳‘׳˜׳•׳•׳— ׳”׳ ׳‘׳—׳¨'}</div>`;
    return;
  }
  const groups = {};
  tasks.forEach(t => {
    const d = (t.completed_at || '').slice(0, 10);
    (groups[d] = groups[d] || []).push(t);
  });
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const heDate = (d) => {
    try {
      return new Date(d + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return d; }
  };
  bodyEl.innerHTML = `<div class="history-summary muted-text">׳¡׳”"׳› ${tasks.length} ׳׳©׳™׳׳•׳× ׳”׳•׳©׳׳׳• ׳‘-${dates.length} ׳™׳׳™׳</div>` +
    dates.map(d => `
      <div class="history-day">
        <div class="history-day-title">${heDate(d)} <span class="history-day-count">(${groups[d].length})</span></div>
        ${groups[d].map(t => {
          const catLabels = { general: 'נ“ ׳›׳׳׳™', health: 'נ’ ׳‘׳¨׳™׳׳•׳×', marketing: 'נ“¢ ׳©׳™׳•׳•׳§', music: 'נµ ׳׳•׳–׳™׳§׳”', learning: 'נ“ ׳׳™׳׳•׳“' };
          const cat = t.category ? `<span class="history-cat">${catLabels[t.category] || t.category}</span>` : '';
          const urg = t.priority === 'urgent' ? `<span class="history-cat history-urgent">ג ן¸ ׳“׳—׳•׳£</span>` : '';
          const due = t.due_date ? `<span class="history-cat">נ“… ׳™׳¢׳“ ${t.due_date.slice(8,10)}/${t.due_date.slice(5,7)}</span>` : '';
          const hasNotes = t.notes && t.notes.trim();
          const notes = hasNotes
            ? `<div class="history-notes history-notes-collapsed" data-collapsed="1">
                 <button class="history-notes-toggle" data-id="${t.id}" title="׳”׳¦׳’/׳”׳¡׳×׳¨">ג–¸</button>
                 <span class="history-notes-label">נ“ ׳”׳¢׳¨׳”</span>
                 <div class="history-notes-content">${t.notes.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
               </div>`
            : '';
          return `<div class="history-item" data-id="${t.id}">
            <button class="history-del-btn" data-id="${t.id}" title="׳”׳¡׳¨ ׳׳”׳¨׳©׳™׳׳”">ג•</button>
            <span class="history-title">ג“ ${t.title.replace(/</g,'&lt;')}</span>
            ${urg}
            ${due}
            ${cat}
            ${notes}
          </div>`;
        }).join('')}
      </div>`).join('');

  // Bind delete buttons
  bodyEl.querySelectorAll('.history-del-btn').forEach(btn =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('׳׳”׳¡׳™׳¨ ׳׳× ׳”׳׳©׳™׳׳” ׳׳”׳”׳™׳¡׳˜׳•׳¨׳™׳”? ׳”׳₪׳¢׳•׳׳” ׳׳™׳ ׳” ׳”׳₪׳™׳›׳”.')) return;
      await api('/api/task/delete', { id: btn.dataset.id });
      toast('נ—‘ן¸ ׳”׳•׳¡׳¨ ׳׳”׳”׳™׳¡׳˜׳•׳¨׳™׳”');
      loadHistory();
      loadState();
    }));

  // Bind notes toggle (click on note box or button to expand/collapse)
  bodyEl.querySelectorAll('.history-notes').forEach(box => {
    const toggle = () => {
      const isCollapsed = box.getAttribute('data-collapsed') === '1';
      box.setAttribute('data-collapsed', isCollapsed ? '0' : '1');
      box.classList.toggle('history-notes-collapsed', !isCollapsed);
      const btn = box.querySelector('.history-notes-toggle');
      if (btn) btn.textContent = isCollapsed ? 'ג–¾' : 'ג–¸';
    };
    box.addEventListener('click', toggle);
  });
}
document.getElementById('open-history')?.addEventListener('click', openHistoryModal);
document.getElementById('history-search')?.addEventListener('input', () => applyHistorySearch());
document.getElementById('history-close')?.addEventListener('click', () =>
  document.getElementById('history-modal')?.classList.add('hidden'));
document.getElementById('history-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('history-modal'))
    document.getElementById('history-modal').classList.add('hidden');
});
document.getElementById('history-load')?.addEventListener('click', loadHistory);
['history-from','history-to'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', loadHistory);
});
document.getElementById('history-week')?.addEventListener('click', () => {
  document.getElementById('history-to').value   = ilDate();
  document.getElementById('history-from').value = ilDate(-6);
  loadHistory();
});
document.getElementById('history-month')?.addEventListener('click', () => {
  document.getElementById('history-to').value   = ilDate();
  document.getElementById('history-from').value = ilDate(-29);
  loadHistory();
});
document.getElementById('history-all')?.addEventListener('click', () => {
  document.getElementById('history-from').value = '';
  document.getElementById('history-to').value   = '';
  loadHistory();
});

// ---------- Settings Modal ----------
document.getElementById('settings-btn')?.addEventListener('click', openSettings);
document.getElementById('settings-close')?.addEventListener('click', () =>
  document.getElementById('settings-modal')?.classList.add('hidden'));
document.getElementById('settings-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('settings-modal'))
    document.getElementById('settings-modal').classList.add('hidden');
});

function _renderHabitsSettings() {
  const listEl = document.getElementById('habits-settings-list');
  if (!listEl) return;
  const habits = (lastState && lastState.habits && lastState.habits.habits) || [];

  if (!habits.length) {
    listEl.innerHTML = '<div class="muted-text" style="font-size:.85rem">׳׳™׳ ׳”׳¨׳’׳׳™׳ ׳¢׳“׳™׳™׳ ג€” ׳”׳•׳¡׳£ ׳׳׳˜׳”</div>';
  } else {
    listEl.innerHTML = habits.map(h => `
      <div class="habit-settings-row" data-id="${h.id}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <button class="hs-emoji-btn" data-id="${h.id}" title="׳©׳ ׳” ׳׳׳•׳’'׳™"
          style="font-size:1.4rem;border:none;background:transparent;cursor:pointer;min-width:32px">${h.emoji}</button>
        <input type="text" class="hs-label-inp" data-id="${h.id}" value="${h.label.replace(/"/g,'&quot;')}"
          style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
        <button class="hs-save-btn" data-id="${h.id}" style="padding:4px 10px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.8rem">׳©׳׳•׳¨</button>
        <button class="hs-del-btn" data-id="${h.id}" style="padding:4px 8px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.8rem">ג•</button>
      </div>`).join('');
  }

  // Emoji grid picks
  document.querySelectorAll('#habit-emoji-grid .habit-emoji-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('habit-new-emoji-settings').value = btn.dataset.e;
      document.querySelectorAll('.habit-emoji-pick').forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = 'var(--primary)';
    });
  });

  // Save edited habit
  listEl.querySelectorAll('.hs-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = listEl.querySelector(`.habit-settings-row[data-id="${btn.dataset.id}"]`);
      const emoji = row.querySelector('.hs-emoji-btn').textContent;
      const label = row.querySelector('.hs-label-inp').value.trim();
      if (!label) return;
      await api('/api/habit/update', { id: btn.dataset.id, emoji, label });
      toast('ג“ ׳”׳¨׳’׳ ׳¢׳•׳“׳›׳');
      loadState();
      setTimeout(_renderHabitsSettings, 500);
    });
  });

  // Edit emoji inline ג€” click emoji opens a small picker row
  listEl.querySelectorAll('.hs-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.habit-settings-row');
      // Remove any existing picker
      row.querySelector('.hs-emoji-picker')?.remove();
      const picker = document.createElement('div');
      picker.className = 'hs-emoji-picker';
      picker.style.cssText = 'position:absolute;display:flex;flex-wrap:wrap;gap:4px;padding:8px;background:var(--card);border:1px solid var(--border);border-radius:10px;z-index:200;max-width:240px;box-shadow:0 4px 20px #0004';
      ['נ’§','נƒ','נ“','נ˜´','נ§˜','נ','נ’','נ§¹','נ“','נµ','נ’×','נ…','נ₪¸','נ¶','נ§´','נ¥—','נµ','גן¸','נ¯','נ›','נ˜','ג­','נ”¥','נ¿','נ­'].forEach(e => {
        const b = document.createElement('button');
        b.textContent = e;
        b.style.cssText = 'font-size:1.3rem;padding:4px 6px;border:none;border-radius:6px;cursor:pointer;background:transparent';
        b.addEventListener('click', () => { btn.textContent = e; picker.remove(); });
        picker.appendChild(b);
      });
      row.style.position = 'relative';
      row.appendChild(picker);
      document.addEventListener('click', function closePicker(ev) {
        if (!picker.contains(ev.target) && ev.target !== btn) {
          picker.remove();
          document.removeEventListener('click', closePicker);
        }
      }, true);
    });
  });

  // Delete habit
  listEl.querySelectorAll('.hs-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('׳׳׳—׳•׳§ ׳”׳¨׳’׳ ׳–׳”?')) return;
      await api('/api/habit/delete', { id: btn.dataset.id });
      toast('ג“ ׳ ׳׳—׳§');
      loadState();
      setTimeout(_renderHabitsSettings, 500);
    });
  });

  // Add new habit
  document.getElementById('habit-add-settings-btn')?.addEventListener('click', async () => {
    const emoji = document.getElementById('habit-new-emoji-settings')?.value.trim() || 'ג…';
    const label = document.getElementById('habit-new-label-settings')?.value.trim();
    if (!label) { toast('׳›׳×׳•׳‘ ׳©׳ ׳׳”׳¨׳’׳', false); return; }
    await api('/api/habit/add', { emoji, label });
    document.getElementById('habit-new-label-settings').value = '';
    document.getElementById('habit-new-emoji-settings').value = 'ג…';
    toast('ג“ ׳”׳¨׳’׳ ׳ ׳•׳¡׳£');
    loadState();
    setTimeout(_renderHabitsSettings, 500);
  });

  document.getElementById('habit-new-label-settings')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('habit-add-settings-btn')?.click();
  });
}

async function openSettings() {
  const modal  = document.getElementById('settings-modal');
  const bodyEl = document.getElementById('settings-body');
  if (!modal || !bodyEl) return;
  modal.classList.remove('hidden');
  bodyEl.innerHTML = '<div class="muted-text">׳˜׳•׳¢׳...</div>';
  try {
    const s = await api('/api/settings');
    renderSettings(s, bodyEl);
  } catch (e) {
    bodyEl.innerHTML = '<div class="muted-text">׳©׳’׳™׳׳”: ' + e.message + '</div>';
  }
}

// ---------- Connections Panel (׳×׳•׳ ג™ן¸ ׳”׳’׳“׳¨׳•׳×) ----------
async function loadConnectionsDiagnose() {
  const body = document.getElementById('connections-body');
  if (!body) return;

  if (window._supabase) {
    // Cloud mode ג€” show Google connection status
    body.innerHTML = '<div class="muted-text">׳˜׳•׳¢׳...</div>';
    try {
      const { data } = await window._supabase.from('google_tokens')
        .select('google_email, updated_at').eq('user_id', window._userId).maybeSingle();
      if (data) {
        const updated = data.updated_at ? new Date(data.updated_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '';
        body.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
            <span style="font-size:1.4rem">ג…</span>
            <div>
              <div style="font-weight:600">Google ׳׳—׳•׳‘׳¨</div>
              <div class="muted-text" style="font-size:.82rem">${data.google_email} ֲ· ׳¢׳•׳“׳›׳: ${updated}</div>
            </div>
            <button id="conn-google-refresh" style="margin-right:auto;padding:5px 12px;background:var(--primary);color:#fff;border:none;border-radius:8px;cursor:pointer">נ”„ ׳¨׳¢׳ ׳</button>
            <button id="conn-google-disconnect" style="padding:5px 12px;background:transparent;border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--muted)">׳ ׳×׳§</button>
          </div>`;
        document.getElementById('conn-google-refresh')?.addEventListener('click', _googleRefreshData);
        document.getElementById('conn-google-disconnect')?.addEventListener('click', _googleDisconnect);
      } else {
        body.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
            <span style="font-size:1.4rem">ג­•</span>
            <div>
              <div style="font-weight:600">Google ׳׳ ׳׳—׳•׳‘׳¨</div>
              <div class="muted-text" style="font-size:.82rem">׳—׳‘׳¨ ׳›׳“׳™ ׳׳¨׳׳•׳× ׳™׳•׳׳ ׳•׳׳™׳™׳׳™׳ ׳‘׳“׳׳©׳‘׳•׳¨׳“</div>
            </div>
            <button id="conn-google-connect" style="margin-right:auto;padding:6px 14px;background:#4285f4;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">נ”— ׳—׳‘׳¨ Google</button>
          </div>`;
        document.getElementById('conn-google-connect')?.addEventListener('click', _googleConnect);
      }
    } catch(e) {
      body.innerHTML = '<div class="muted-text">׳©׳’׳™׳׳”: ' + e.message + '</div>';
    }
    return;
  }

  body.innerHTML = '<div class="conn-loading">׳˜׳•׳¢׳ ׳¡׳˜׳˜׳•׳¡ ׳—׳™׳‘׳•׳¨׳™׳...</div>';
  try {
    const r = await fetch('/api/setup/diagnose');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    renderConnectionChecks(data.checks || [], body);
    renderConnectionLogs(data.recentLog || []);
  } catch (e) {
    body.innerHTML = '<div class="conn-error">׳©׳’׳™׳׳” ׳‘׳˜׳¢׳™׳ ׳× ׳¡׳˜׳˜׳•׳¡: ' + e.message + '</div>';
  }
}

function _googleConnect() {
  const uid = window._userId;
  if (!uid) return;
  window.location.href = '/.netlify/functions/google-auth?user_id=' + uid;
}

async function _googleDisconnect() {
  if (!confirm('׳׳ ׳×׳§ ׳׳× Google? ׳™׳•׳׳ ׳•׳׳™׳™׳׳™׳ ׳׳ ׳™׳•׳¦׳’׳• ׳¢׳•׳“.')) return;
  await window._supabase.from('google_tokens').delete().eq('user_id', window._userId);
  toast('ג“ Google ׳ ׳•׳×׳§');
  loadConnectionsDiagnose();
}

async function _googleRefreshData() {
  const btn = document.getElementById('conn-google-refresh');
  if (btn) { btn.disabled = true; btn.textContent = 'ג³ ׳׳¨׳¢׳ ׳...'; }
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const r = await fetch('/.netlify/functions/google-data', {
      headers: { Authorization: 'Bearer ' + session.access_token }
    });
    const d = await r.json();
    if (d.connected) {
      toast('ג“ ׳™׳•׳׳ ׳•׳׳™׳™׳׳™׳ ׳¢׳•׳“׳›׳ ׳•');
      loadState();
    } else {
      toast('׳©׳’׳™׳׳” ׳‘׳¨׳¢׳ ׳•׳', false);
    }
  } catch(e) {
    toast('׳©׳’׳™׳׳”: ' + e.message, false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'נ”„ ׳¨׳¢׳ ׳'; }
  }
}

function renderConnectionChecks(checks, body) {
  const icon = (status) => status === 'ok' ? 'ג“' : status === 'warn' ? 'ג ' : 'ג—';
  body.innerHTML = checks.map(c => {
    const valueLine = c.value ? `<span class="conn-row-value">${c.value}</span>` : '';
    const messageLine = c.message ? `<div class="conn-row-message">${c.message}</div>` : '';
    let actionBtn = '';
    if (c.fixUrl) {
      actionBtn = `<a class="conn-row-action" href="${c.fixUrl}" target="_blank" rel="noopener">${c.fixLabel || 'נ”— ׳₪׳×׳—'}</a>`;
    } else if (c.action === 'scheduleTask') {
      actionBtn = `<button class="conn-row-action" data-action="scheduleTask">${c.actionLabel || 'ג° ׳×׳–׳׳'}</button>`;
    } else if (c.action === 'runRefresh') {
      actionBtn = `<button class="conn-row-action" data-action="runRefresh">${c.actionLabel || 'נ€ ׳”׳¨׳¥'}</button>`;
    }
    return `<div class="conn-row conn-row-${c.status}">
      <span class="conn-row-icon">${icon(c.status)}</span>
      <div class="conn-row-content">
        <div class="conn-row-label">${c.label} ${valueLine}</div>
        ${messageLine}
      </div>
      ${actionBtn}
    </div>`;
  }).join('');

  // Bind row-level action buttons
  body.querySelectorAll('.conn-row-action[data-action="scheduleTask"]').forEach(b =>
    b.addEventListener('click', scheduleDailyTask));
  body.querySelectorAll('.conn-row-action[data-action="runRefresh"]').forEach(b =>
    b.addEventListener('click', runRefreshNow));
}

function renderConnectionLogs(logs) {
  const el = document.getElementById('conn-log-content');
  if (!el) return;
  if (!logs.length) {
    el.innerHTML = '<div class="muted-text">׳׳™׳ ׳׳•׳’׳™׳ ׳¢׳“׳™׳™׳</div>';
    return;
  }
  el.innerHTML = logs.map(log => {
    const lines = log.lines.map(l => `<div class="conn-log-line">${l.replace(/</g,'&lt;')}</div>`).join('');
    return `<div class="conn-log-file"><div class="conn-log-fname">נ“„ ${log.file}</div>${lines}</div>`;
  }).join('');
}

async function runRefreshNow() {
  const runBtn = document.getElementById('conn-run-refresh');
  const log = document.getElementById('conn-run-log');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'ג³ ׳׳¨׳™׳¥...'; }
  if (log) {
    log.classList.remove('hidden');
    log.innerHTML = '<div class="conn-run-spinner">ג³ ׳׳×׳—׳™׳ ׳¨׳¢׳ ׳•׳... (׳™׳§׳— 1-2 ׳“׳§׳•׳×)</div>';
  }
  try {
    const r = await api('/api/setup/run-refresh', {});
    const pid = r.pid;
    if (!pid) throw new Error(r.error || '׳׳ ׳”׳•׳—׳–׳¨ PID');
    // Poll status every 3 seconds
    const startTime = Date.now();
    const poll = async () => {
      try {
        const sr = await fetch('/api/setup/refresh-status?pid=' + pid);
        const status = await sr.json();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (status.done) {
          const success = status.exitCode === 0;
          if (log) {
            log.innerHTML = success
              ? `<div class="conn-run-success">ג… ׳”׳¦׳׳™׳—! (${elapsed} ׳©׳ ׳™׳•׳×)</div>`
              : `<div class="conn-run-error">ג  ׳ ׳›׳©׳ (exit=${status.exitCode}). ׳ ׳¡׳” ׳©׳•׳‘.</div>`;
          }
          if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'נ€ ׳”׳¨׳¥ ׳¨׳¢׳ ׳•׳ ׳¢׳›׳©׳™׳•'; }
          loadConnectionsDiagnose();
          if (success) setTimeout(() => loadState(), 1000);
        } else {
          if (log) log.innerHTML = `<div class="conn-run-spinner">ג³ ׳¨׳¥... (${elapsed} ׳©׳ ׳™׳•׳×)</div>`;
          setTimeout(poll, 3000);
        }
      } catch (e) {
        if (log) log.innerHTML = `<div class="conn-run-error">׳©׳’׳™׳׳”: ${e.message}</div>`;
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'נ€ ׳”׳¨׳¥ ׳¨׳¢׳ ׳•׳ ׳¢׳›׳©׳™׳•'; }
      }
    };
    setTimeout(poll, 3000);
  } catch (e) {
    if (log) log.innerHTML = `<div class="conn-run-error">׳©׳’׳™׳׳”: ${e.message}</div>`;
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'נ€ ׳”׳¨׳¥ ׳¨׳¢׳ ׳•׳ ׳¢׳›׳©׳™׳•'; }
  }
}

async function scheduleDailyTask() {
  const btns = document.querySelectorAll('[data-action="scheduleTask"]');
  btns.forEach(b => { b.disabled = true; b.textContent = 'ג³ ׳׳×׳–׳׳...'; });
  try {
    const r = await api('/api/setup/schedule-task', {});
    if (r.ok) {
      toast('ג… ׳¨׳¢׳ ׳•׳ ׳™׳•׳׳™ ׳×׳•׳–׳׳ ׳-07:00');
      loadConnectionsDiagnose();
    } else {
      toast('׳©׳’׳™׳׳”: ' + (r.error || '׳׳ ׳™׳“׳•׳¢'), false);
      btns.forEach(b => { b.disabled = false; b.textContent = 'ג° ׳×׳–׳׳ ׳¢׳›׳©׳™׳•'; });
    }
  } catch (e) {
    toast('׳©׳’׳™׳׳”: ' + e.message, false);
    btns.forEach(b => { b.disabled = false; b.textContent = 'ג° ׳×׳–׳׳ ׳¢׳›׳©׳™׳•'; });
  }
}

function renderSettings(s, bodyEl) {
  const isLite = (s.edition || 'full') === 'lite';
  bodyEl.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">נ‘₪ ׳₪׳¨׳•׳₪׳™׳</div>
      <label>׳©׳<input type="text" id="settings-name" value="${(s.userName||'').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" placeholder="׳”׳©׳ ׳©׳׳"></label>
      <label>׳©׳ ׳”׳¢׳•׳–׳¨<input type="text" id="settings-asst" value="${(s.assistantName||'').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" placeholder="׳§׳¨׳׳•׳¡"></label>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">נ₪– AI (׳׳•׳₪׳¦׳™׳•׳ ׳׳™)</div>
      <label class="settings-toggle-row">
        <span>׳₪׳™׳¦'׳¨׳™ AI ׳׳׳׳™׳ <span class="settings-hint">(׳™׳•׳׳ + ׳׳™׳™׳ + ׳¦'׳׳˜ ג€” ׳“׳•׳¨׳© Claude Code)</span></span>
        <input type="checkbox" id="settings-edition" ${!isLite ? 'checked' : ''}>
      </label>
      <div class="settings-api-row">
        <label>׳׳₪׳×׳— Anthropic <span class="settings-hint">ג€” ׳׳‘׳¨׳™׳₪׳™׳ ׳’ ׳‘׳•׳§׳¨ ׳—׳›׳ ׳‘׳׳™ Claude Code</span></label>
        <input type="text" id="settings-apikey" value="" placeholder="${s.apiKeySet ? 'ג—ג—ג—ג—ג—ג—ג—ג— (׳׳•׳’׳“׳¨ ג“)' : 'sk-ant-...'}" autocomplete="off">
        <div class="settings-hint" style="margin-top:4px">
          נ”— <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">׳§׳‘׳ ׳׳₪׳×׳— ׳—׳™׳ ׳</a> ג€” ׳§׳¨׳“׳™׳˜ $5 ׳׳—׳©׳‘׳•׳ ׳—׳“׳©, ׳׳¡׳₪׳™׳§ ׳-100+ ׳‘׳¨׳™׳₪׳™׳ ׳’׳™׳
        </div>
      </div>
    </div>

    <div class="settings-section" id="habits-settings-section">
      <div class="settings-section-title">נƒ ׳”׳¨׳’׳׳™׳</div>
      <div id="habits-settings-list"></div>
      <div style="margin-top:10px">
        <div class="settings-section-title" style="font-size:.8rem;margin-bottom:6px">׳”׳•׳¡׳£ ׳”׳¨׳’׳ ׳—׳“׳©</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px" id="habit-emoji-grid">
          ${['נ’§','נƒ','נ“','נ˜´','נ§˜','נ','נ’','נ§¹','נ“','נµ','נ’×','נ…','נ₪¸','נ¶','נ§´','נ¥—','נµ','גן¸','נ¯','נ›'].map(e =>
            `<button class="habit-emoji-pick" data-e="${e}" style="font-size:1.3rem;padding:4px 6px;border:2px solid transparent;border-radius:8px;cursor:pointer;background:var(--card)">${e}</button>`
          ).join('')}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="habit-new-emoji-settings" value="ג…" maxlength="2"
            style="width:42px;text-align:center;font-size:1.3rem;padding:4px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
          <input type="text" id="habit-new-label-settings" placeholder="׳©׳ ׳”׳”׳¨׳’׳..."
            style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
          <button id="habit-add-settings-btn" style="padding:6px 14px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap">+ ׳”׳•׳¡׳£</button>
        </div>
      </div>
    </div>

    <div class="settings-section connections-section">
      <div class="settings-section-title">נ” ׳—׳™׳‘׳•׳¨׳™׳</div>
      <div id="connections-body" class="connections-body"></div>
    </div>

    <div class="settings-actions">
      <button id="settings-save">נ’¾ ׳©׳׳•׳¨</button>
      <button id="settings-cancel-btn" class="settings-cancel-btn">׳‘׳™׳˜׳•׳</button>
    </div>`;

  // ג”€ג”€ Habits section ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  _renderHabitsSettings();

  // Load diagnose immediately after rendering
  loadConnectionsDiagnose();

  document.getElementById('settings-cancel-btn').addEventListener('click', () =>
    document.getElementById('settings-modal').classList.add('hidden'));

  // Connections panel global action buttons
  document.getElementById('conn-refresh-status')?.addEventListener('click', loadConnectionsDiagnose);
  document.getElementById('conn-run-refresh')?.addEventListener('click', runRefreshNow);

  document.getElementById('settings-save').addEventListener('click', async () => {
    const btn = document.getElementById('settings-save');
    btn.disabled = true; btn.textContent = 'ג³';
    try {
      const editionChk = document.getElementById('settings-edition');
      const apiKeyEl   = document.getElementById('settings-apikey');
      const payload = {
        userName:      document.getElementById('settings-name').value.trim(),
        assistantName: document.getElementById('settings-asst').value.trim(),
        edition:       editionChk && !editionChk.checked ? 'lite' : 'full'
      };
      if (apiKeyEl && apiKeyEl.value.trim()) payload.anthropicKey = apiKeyEl.value.trim();
      await api('/api/settings/update', payload);
      toast('ג“ ׳”׳’׳“׳¨׳•׳× ׳ ׳©׳׳¨׳•');
      document.getElementById('settings-modal').classList.add('hidden');
      loadState();
    } catch (e) {
      toast('׳©׳’׳™׳׳” ׳‘׳©׳׳™׳¨׳”', false);
    } finally {
      btn.disabled = false; btn.textContent = 'נ’¾ ׳©׳׳•׳¨';
    }
  });
}

// ---------- PDF Export ----------
document.getElementById('export-pdf-btn')?.addEventListener('click', () => {
  // Expand all collapsed sections before print
  const collapsed = [];
  document.querySelectorAll('.card.collapsible .section-body').forEach(b => {
    if (b.style.display === 'none') { collapsed.push(b); b.style.display = ''; }
  });
  window.print();
  // Restore collapsed state after dialog closes
  setTimeout(() => collapsed.forEach(b => { b.style.display = 'none'; }), 500);
});

// ---------- Dark / Light Theme ----------
let _darkMode = localStorage.getItem('carlos-theme') !== 'light';
function applyTheme() {
  document.body.classList.toggle('light-mode', !_darkMode);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = _darkMode ? 'נ™' : 'ג˜€ן¸';
}
document.getElementById('theme-btn')?.addEventListener('click', () => {
  _darkMode = !_darkMode;
  localStorage.setItem('carlos-theme', _darkMode ? 'dark' : 'light');
  applyTheme();
});

// ---------- Booking ----------
function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Parse "14" ג†’ "14:00", "930" ג†’ "09:30", "14:00" ג†’ "14:00"
function _parseTime(raw) {
  const s = String(raw || '').trim().replace(/[^\d:]/g, '');
  if (!s) return '';
  if (s.includes(':')) {
    const [h, m] = s.split(':');
    return String(parseInt(h) || 0).padStart(2, '0') + ':' + String(parseInt(m) || 0).padStart(2, '0');
  }
  if (s.length <= 2) return s.padStart(2, '0') + ':00';
  if (s.length === 3) return '0' + s[0] + ':' + s.slice(1);
  return s.slice(0, 2) + ':' + s.slice(2, 4);
}

function _timeDiffMin(from, to) {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return (th * 60 + tm) - (fh * 60 + fm);
}

function _addMinutes(time, min) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + min;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function _generateSlots(date, from, to, sessionMin) {
  const result = [];
  let cur = from;
  while (_timeDiffMin(cur, to) >= sessionMin) {
    const next = _addMinutes(cur, sessionMin);
    result.push({ date, time: cur, time_to: next, duration_min: sessionMin });
    cur = next;
  }
  return result;
}

// ג”€ג”€ Build Google Calendar intent URL from appointment data ג”€ג”€
function buildGCalUrl(d) {
  if (!d || !d.date || !d.time) return null;
  const ds = d.date.replace(/-/g, '');
  const ts = d.time.replace(':', '') + '00';
  let endStr;
  if (d.time_to) {
    endStr = ds + 'T' + d.time_to.replace(':', '') + '00';
  } else {
    const [h, m] = d.time.split(':').map(Number);
    const dur = d.duration_min || 60;
    const totalMin = m + dur;
    const eH = h + Math.floor(totalMin / 60);
    const eM = totalMin % 60;
    endStr = ds + 'T' + String(eH % 24).padStart(2, '0') + String(eM).padStart(2, '0') + '00';
  }
  const details = [d.phone ? `׳˜׳׳₪׳•׳: ${d.phone}` : '', d.notes ? `׳”׳¢׳¨׳•׳×: ${d.notes}` : ''].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `׳×׳•׳¨: ${d.name} ֲ· ${d.service}`,
    dates: `${ds}T${ts}/${endStr}`,
    ctz: 'Asia/Jerusalem',
    details
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ג”€ג”€ Global booking alert banner (top of dashboard) ג”€ג”€
function renderBookingAlerts(notifications, appointments) {
  const bar = document.getElementById('booking-alert-bar');
  if (!bar) return;
  const unread = (notifications || []).filter(n => !n.read);
  if (!unread.length) { bar.innerHTML = ''; return; }
  bar.innerHTML = '<div class="booking-alert-wrap">' +
    unread.map(n => {
      let apptData = n.appt_data;
      if (apptData && apptData.appt_id && appointments) {
        const live = (appointments || []).find(a => a.id === apptData.appt_id);
        if (live) apptData = { ...apptData, notes: live.notes };
      }
      const gcUrl = buildGCalUrl(apptData);
      const calBtn = gcUrl ? `<a class="booking-alert-cal" href="${gcUrl}" target="_blank" title="׳”׳•׳¡׳£ ׳׳™׳•׳׳ Google">נ“…</a>` : '';
      return `<div class="booking-alert">
        <span>נ”” ${_esc(n.text)}</span>
        ${calBtn}
        <button class="booking-alert-dismiss" data-id="${_esc(n.id)}">ג•</button>
      </div>`;
    }).join('') + '</div>';
  bar.querySelectorAll('.booking-alert-dismiss').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/api/booking/notify/read', { id: btn.dataset.id });
      loadState();
    });
  });
}

function renderTunnelBar(el, running, tunnelUrl) {
  if (running && tunnelUrl) {
    el.innerHTML = `<div class="bk-tunnel-active">
      <span>נ¢ ׳’׳™׳©׳” ׳¦׳™׳‘׳•׳¨׳™׳× ׳₪׳¢׳™׳׳”</span>
      <span class="bk-tunnel-url">${_esc(tunnelUrl + '/book')}</span>
      <button id="bk-copy-tunnel" class="bk-tunnel-copy-btn">נ“‹ ׳”׳¢׳×׳§</button>
      <button id="bk-stop-tunnel" class="bk-tunnel-stop-btn">ג¹ ׳¢׳¦׳•׳¨</button>
    </div>`;
    document.getElementById('bk-copy-tunnel')?.addEventListener('click', () => {
      navigator.clipboard.writeText(tunnelUrl + '/book').then(() => toast('׳§׳™׳©׳•׳¨ ׳”׳•׳¢׳×׳§ ג“'));
    });
    document.getElementById('bk-stop-tunnel')?.addEventListener('click', async () => {
      await api('/api/tunnel/stop', {});
      renderTunnelBar(el, false, null);
      toast('׳’׳™׳©׳” ׳¦׳™׳‘׳•׳¨׳™׳× ׳”׳•׳₪׳¡׳§׳”');
    });
  } else {
    const cfAvail = window._cfAvailable !== false;
    el.innerHTML = cfAvail
      ? `<div class="bk-tunnel-off">
          <span>נ”´ ׳’׳™׳©׳” ׳¦׳™׳‘׳•׳¨׳™׳× ׳›׳‘׳•׳™׳” ג€” ׳׳˜׳•׳₪׳׳™׳ ׳׳ ׳™׳•׳›׳׳• ׳׳’׳©׳× ׳׳“׳£ ׳”׳–׳™׳׳•׳</span>
          <button id="bk-start-tunnel" class="bk-tunnel-start-btn">נ ׳”׳₪׳¢׳ ׳¢׳›׳©׳™׳•</button>
        </div>`
      : `<div class="bk-tunnel-off">
          <span class="muted-text">נ” ׳’׳™׳©׳” ׳¦׳™׳‘׳•׳¨׳™׳× ׳׳ ׳–׳׳™׳ ׳” ג€” <code>cloudflared.exe</code> ׳׳ ׳ ׳׳¦׳ ׳‘׳×׳™׳§׳™׳™׳× ׳§׳¨׳׳•׳¡</span>
        </div>`;
    document.getElementById('bk-start-tunnel')?.addEventListener('click', async () => {
      el.innerHTML = '<div class="bk-tunnel-loading">ג³ ׳׳×׳—׳‘׳¨ ׳׳©׳¨׳×׳™ Cloudflare... (׳‘׳“׳¨׳ ׳›׳׳ 10ג€“15 ׳©׳ ׳™׳•׳×)</div>';
      try {
        const r = await api('/api/tunnel/start', {});
        if (r && r.url) {
          navigator.clipboard.writeText(r.url + '/book').catch(() => {});
          renderTunnelBar(el, true, r.url);
          toast('נ ׳’׳™׳©׳” ׳¦׳™׳‘׳•׳¨׳™׳× ׳₪׳¢׳™׳׳” ג€” ׳§׳™׳©׳•׳¨ ׳”׳•׳¢׳×׳§ ג“');
        } else {
          renderTunnelBar(el, false, null);
          toast('׳©׳’׳™׳׳” ׳‘׳”׳₪׳¢׳׳” ג€” ׳ ׳¡׳” ׳©׳•׳‘', false);
        }
      } catch(e) {
        renderTunnelBar(el, false, null);
        toast('׳©׳’׳™׳׳” ג€” ׳ ׳¡׳” ׳©׳•׳‘', false);
      }
    });
  }
}

function renderBooking(data) {
  if (!data) return;
  const { appointments = [], slots = [] } = data;
  const upcomingEl = document.getElementById('booking-upcoming');
  const slotsMgrEl = document.getElementById('booking-slots-mgr');
  if (!upcomingEl || !slotsMgrEl) return;

  // ג”€ג”€ Tunnel control UI ג”€ג”€
  {
    let urlBar = document.getElementById('bk-url-bar');
    if (!urlBar) {
      urlBar = document.createElement('div');
      urlBar.id = 'bk-url-bar';
      upcomingEl.parentElement.insertBefore(urlBar, upcomingEl);
    }
    api('/api/tunnel/status').then(status => renderTunnelBar(urlBar, status.running, status.url));
  }

  // ג”€ג”€ Upcoming appointments ג”€ג”€
  const now = new Date();
  const upcoming = appointments
    .filter(a => a.status !== 'cancelled' && new Date(a.date + 'T' + a.time) >= now)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (upcoming.length === 0) {
    upcomingEl.innerHTML = '<div class="muted-text" style="padding:6px 0">׳׳™׳ ׳–׳™׳׳•׳ ׳™׳ ׳§׳¨׳•׳‘׳™׳</div>';
  } else {
    upcomingEl.innerHTML = upcoming.map(a => {
      const d = new Date(a.date + 'T' + a.time);
      const dateStr = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
      const durStr = a.time_to ? `ג€“${a.time_to}` : (a.duration_min ? ` ֲ· ${a.duration_min} ׳“׳§׳³` : '');
      // Build Google Calendar link
      const [ay, am, ad] = a.date.split('-');
      const [ah, amin2] = a.time.split(':');
      const gcStart = `${ay}${am}${ad}T${ah}${amin2}00`;
      let gcEnd;
      if (a.time_to) {
        const [eh, em] = a.time_to.split(':');
        gcEnd = `${ay}${am}${ad}T${eh}${em}00`;
      } else {
        const totalMin = parseInt(ah) * 60 + parseInt(amin2) + (a.duration_min || 60);
        const eH = String(Math.floor(totalMin / 60) % 24).padStart(2,'0');
        const eM = String(totalMin % 60).padStart(2,'0');
        gcEnd = `${ay}${am}${ad}T${eH}${eM}00`;
      }
      const gcTitle = encodeURIComponent(`׳×׳•׳¨: ${a.patient_name}${a.service ? ' ֲ· ' + a.service : ''}`);
      const gcDetails = encodeURIComponent(`׳˜׳׳₪׳•׳: ${a.patient_phone || 'ג€”'}${a.notes ? '\n׳”׳¢׳¨׳•׳×: ' + a.notes : ''}`);
      const gcUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gcTitle}&dates=${gcStart}/${gcEnd}&details=${gcDetails}`;
      // Format notes with line breaks
      const notesHtml = a.notes
        ? '<div class="bk-appt-notes">נ“ ' + _esc(a.notes).replace(/\n/g, '<br>') + '</div>'
        : '';
      return `<div class="bk-appt">
        <div style="flex:1">
          <div class="bk-appt-name">${_esc(a.patient_name)}</div>
          <div class="bk-appt-detail">${dateStr} ֲ· ${a.time}${durStr}</div>
          <div class="bk-appt-detail">${_esc(a.service || '')}${a.patient_phone ? ' ֲ· ' + _esc(a.patient_phone) : ''}</div>
          ${notesHtml}
          <a href="${gcUrl}" target="_blank" class="bk-gcal-link" title="׳”׳•׳¡׳£ ׳׳™׳•׳׳ Google">נ“… ׳”׳•׳¡׳£ ׳׳™׳•׳׳ Google</a>
        </div>
        <button class="bk-cancel-btn" data-id="${_esc(a.id)}">׳‘׳™׳˜׳•׳</button>
      </div>`;
    }).join('');
    upcomingEl.querySelectorAll('.bk-cancel-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('׳׳‘׳˜׳ ׳׳× ׳”׳–׳™׳׳•׳?')) return;
        await api('/api/booking/cancel', { id: btn.dataset.id });
        loadState();
        toast('׳–׳™׳׳•׳ ׳‘׳•׳˜׳');
      });
    });
  }

  // ג”€ג”€ Free slots list ג”€ג”€
  const freeSlots = slots
    .filter(s => !s.booked)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  let slotsHtml = `<div class="bk-sub-title" style="margin-top:14px">׳—׳¨׳™׳¦׳™׳ ׳₪׳ ׳•׳™׳™׳ (${freeSlots.length})</div>`;
  if (freeSlots.length === 0) {
    slotsHtml += '<div class="muted-text" style="padding:4px 0">׳׳™׳ ׳—׳¨׳™׳¦׳™׳ ג€” ׳”׳•׳¡׳£ ׳׳׳˜׳”</div>';
  } else {
    slotsHtml += freeSlots.map(sl => {
      const d = new Date(sl.date + 'T' + sl.time);
      const dateStr = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
      const rangeStr = sl.time_to ? `${sl.time}ג€“${sl.time_to}` : `${sl.time}${sl.duration_min ? ' (' + sl.duration_min + ' ׳“׳§׳³)' : ''}`;
      return `<div class="bk-slot">
        <span><b>${rangeStr}</b> ֲ· ${dateStr}</span>
        <button class="bk-del-slot" data-id="${_esc(sl.id)}" title="׳׳—׳§ ׳—׳¨׳™׳¥">ג•</button>
      </div>`;
    }).join('');
  }

  // ג”€ג”€ Add slots form ג€” range + session duration ג”€ג”€
  slotsHtml += `
  <div class="bk-add-form">
    <div class="bk-sub-title" style="margin-bottom:10px">ג• ׳”׳•׳¡׳£ ׳–׳׳ ׳₪׳ ׳•׳™</div>
    <div class="bk-add-row">
      <div class="bk-add-field">
        <label>׳×׳׳¨׳™׳</label>
        <input type="date" id="bk-new-date">
      </div>
      <div class="bk-add-field">
        <label>׳׳©׳¢׳”</label>
        <input type="text" id="bk-new-from" placeholder="14" maxlength="5">
      </div>
      <div class="bk-add-sep">׳¢׳“</div>
      <div class="bk-add-field">
        <label>׳¢׳“ ׳©׳¢׳”</label>
        <input type="text" id="bk-new-to" placeholder="16" maxlength="5">
      </div>
    </div>
    <div class="bk-dur-row">
      <span class="bk-dur-label">׳׳©׳ ׳›׳ ׳₪׳’׳™׳©׳”:</span>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="30"> 30 ׳“׳§׳³</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="45"> 45 ׳“׳§׳³</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="60" checked> 60 ׳“׳§׳³</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="90"> 90 ׳“׳§׳³</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="custom"> ׳׳—׳¨:
        <input type="number" id="bk-dur-custom" min="15" step="5" value="45" style="width:52px;margin-right:4px">׳“׳§׳³
      </label>
    </div>
    <div id="bk-slot-preview" class="bk-preview-box"></div>
    <button id="bk-add-slot" class="bk-add-btn" disabled>+ ׳”׳•׳¡׳£ ׳—׳¨׳™׳¦׳™׳</button>
  </div>`;

  slotsMgrEl.innerHTML = slotsHtml;

  // ג”€ג”€ Delete slot ג”€ג”€
  slotsMgrEl.querySelectorAll('.bk-del-slot').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/api/booking/slot/delete', { id: btn.dataset.id });
      loadState();
      toast('׳—׳¨׳™׳¥ ׳ ׳׳—׳§');
    });
  });

  // Pre-fill today
  const newDateEl = document.getElementById('bk-new-date');
  if (newDateEl) newDateEl.value = todayStr();

  // ג”€ג”€ Live preview & button update ג”€ג”€
  function getSessionMin() {
    const val = document.querySelector('input[name="bk-dur"]:checked')?.value;
    if (val === 'custom') return parseInt(document.getElementById('bk-dur-custom').value) || 60;
    return parseInt(val) || 60;
  }

  function updatePreview() {
    const from = _parseTime(document.getElementById('bk-new-from').value);
    const to   = _parseTime(document.getElementById('bk-new-to').value);
    const prev = document.getElementById('bk-slot-preview');
    const addBtn = document.getElementById('bk-add-slot');
    if (!prev || !addBtn) return;
    if (!from || !to) {
      prev.innerHTML = '';
      addBtn.disabled = true;
      addBtn.textContent = '+ ׳”׳•׳¡׳£ ׳—׳¨׳™׳¦׳™׳';
      return;
    }
    const totalMin = _timeDiffMin(from, to);
    if (totalMin <= 0) {
      prev.innerHTML = '<span style="color:var(--warning)">ג  ׳©׳¢׳× ׳”׳¡׳™׳•׳ ׳—׳™׳™׳‘׳× ׳׳”׳™׳•׳× ׳׳—׳¨׳™ ׳©׳¢׳× ׳”׳”׳×׳—׳׳”</span>';
      addBtn.disabled = true;
      return;
    }
    const chosenDate = document.getElementById('bk-new-date').value || todayStr();
    if (chosenDate < todayStr()) {
      prev.innerHTML = '<span style="color:var(--warning)">ג  ׳׳ ׳ ׳™׳×׳ ׳׳”׳•׳¡׳™׳£ ׳—׳¨׳™׳¦׳™׳ ׳‘׳×׳׳¨׳™׳ ׳©׳¢׳‘׳¨</span>';
      addBtn.disabled = true;
      return;
    }
    const sessionMin = getSessionMin();
    const generated = _generateSlots(chosenDate, from, to, sessionMin);
    if (!generated.length) {
      prev.innerHTML = '<span style="color:var(--warning)">ג  ׳”׳˜׳•׳•׳— ׳§׳¦׳¨ ׳׳“׳™ ׳׳׳©׳ ׳”׳₪׳’׳™׳©׳” ׳©׳ ׳‘׳—׳¨</span>';
      addBtn.disabled = true;
      return;
    }
    prev.innerHTML = generated.map(s => `<div class="bk-prev-slot">ג“ ${s.time}ג€“${s.time_to}</div>`).join('') +
      `<div class="bk-prev-total">${generated.length} ׳—׳¨׳™׳¦׳™׳ ֲ· ${sessionMin} ׳“׳§׳³ ׳›׳ ׳׳—׳“</div>`;
    addBtn.disabled = false;
    addBtn.textContent = `+ ׳”׳•׳¡׳£ ${generated.length} ׳—׳¨׳™׳¦${generated.length === 1 ? '' : '׳™׳'}`;
  }

  // Attach listeners
  ['bk-new-from','bk-new-to'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input', updatePreview);
    el?.addEventListener('blur', function() {
      const p = _parseTime(this.value);
      if (p) this.value = p;
      updatePreview();
    });
  });
  document.getElementById('bk-new-date')?.addEventListener('change', updatePreview);
  slotsMgrEl.querySelectorAll('input[name="bk-dur"]').forEach(r => r.addEventListener('change', updatePreview));
  document.getElementById('bk-dur-custom')?.addEventListener('input', updatePreview);

  // ג”€ג”€ Add slots ג”€ג”€
  document.getElementById('bk-add-slot')?.addEventListener('click', async () => {
    const date = document.getElementById('bk-new-date').value;
    const from = _parseTime(document.getElementById('bk-new-from').value);
    const to   = _parseTime(document.getElementById('bk-new-to').value);
    if (!date || !from || !to) { toast('׳ ׳ ׳׳׳׳ ׳×׳׳¨׳™׳, ׳©׳¢׳× ׳”׳×׳—׳׳” ׳•׳¡׳™׳•׳', false); return; }
    const sessionMin = getSessionMin();
    const generated = _generateSlots(date, from, to, sessionMin);
    if (!generated.length) { toast('׳”׳˜׳•׳•׳— ׳§׳¦׳¨ ׳׳“׳™', false); return; }
    const btn = document.getElementById('bk-add-slot');
    btn.disabled = true; btn.textContent = 'ג³ ׳©׳•׳׳¨...';
    await api('/api/booking/slot/add-batch', { slots: generated });
    loadState();
    toast(`${generated.length} ׳—׳¨׳™׳¦׳™׳ ׳ ׳•׳¡׳₪׳• ג“`);
  });

  updatePreview();
}

function openBookingProfileModal() {
  api('/api/booking/profile').then(prof => {
    const modal = document.getElementById('settings-modal');
    const body = document.getElementById('settings-body');
    if (!modal || !body) return;
    const currentPublicUrl = (prof.public_url || '').replace(/\/$/, '');
    body.innerHTML = `
      <h3 style="margin:0 0 14px;color:var(--text)">גן¸ ׳¢׳¨׳•׳ ׳“׳£ ׳¦׳™׳‘׳•׳¨׳™</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label style="color:var(--text-muted);font-size:.85rem">נ”— ׳§׳™׳©׳•׳¨ ׳¦׳™׳‘׳•׳¨׳™ (Cloudflare / ngrok)</label>
        <input id="bkp-puburl" class="settings-input" value="${_esc(currentPublicUrl)}" placeholder="https://xxx.trycloudflare.com">
        <div style="font-size:.76rem;color:var(--text-muted);margin-top:-6px;line-height:1.4">
          ׳”׳›׳ ׳¡ ׳׳× ׳”-URL ׳©׳ ׳”-Cloudflare tunnel ׳©׳׳ (׳‘׳׳™ /book ׳‘׳¡׳•׳£).<br>
          ׳›׳₪׳×׳•׳¨ נ”— ׳™׳©׳×׳׳© ׳‘׳–׳” ׳‘׳¢׳× ׳”׳¢׳×׳§׳× ׳”׳§׳™׳©׳•׳¨ ׳׳׳˜׳•׳₪׳׳™׳.
        </div>
        <label style="color:var(--text-muted);font-size:.85rem">׳©׳</label>
        <input id="bkp-name" class="settings-input" value="${_esc(prof.name || '')}">
        <label style="color:var(--text-muted);font-size:.85rem">׳×׳₪׳§׳™׳“</label>
        <input id="bkp-title" class="settings-input" value="${_esc(prof.title || '')}">
        <label style="color:var(--text-muted);font-size:.85rem">׳¢׳ ׳¢׳¦׳׳™ (׳‘׳™׳•)</label>
        <textarea id="bkp-bio" class="settings-input" rows="3" style="resize:vertical">${_esc(prof.bio || '')}</textarea>
        <label style="color:var(--text-muted);font-size:.85rem">׳©׳™׳¨׳•׳×׳™׳ (׳©׳•׳¨׳” ׳׳›׳ ׳©׳™׳¨׳•׳×)</label>
        <textarea id="bkp-services" class="settings-input" rows="4" style="resize:vertical">${(prof.services || []).join('\n')}</textarea>
        <label style="color:var(--text-muted);font-size:.85rem">׳׳™׳§׳•׳</label>
        <input id="bkp-location" class="settings-input" value="${_esc(prof.location || '')}">
        <label style="color:var(--text-muted);font-size:.85rem">׳§׳™׳©׳•׳¨ ׳׳×׳׳•׳ ׳” (URL, ׳׳•׳₪׳¦׳™׳•׳ ׳׳™)</label>
        <input id="bkp-photo" class="settings-input" value="${_esc(prof.photo_url || '')}">
        <button id="bkp-save" style="margin-top:8px;background:var(--accent);color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:.95rem">נ’¾ ׳©׳׳•׳¨</button>
      </div>`;
    modal.classList.remove('hidden');
    document.getElementById('bkp-save')?.addEventListener('click', async () => {
      const updated = {
        public_url: document.getElementById('bkp-puburl').value.trim().replace(/\/$/, ''),
        name: document.getElementById('bkp-name').value.trim(),
        title: document.getElementById('bkp-title').value.trim(),
        bio: document.getElementById('bkp-bio').value.trim(),
        services: document.getElementById('bkp-services').value.split('\n').map(s => s.trim()).filter(Boolean),
        location: document.getElementById('bkp-location').value.trim(),
        photo_url: document.getElementById('bkp-photo').value.trim()
      };
      await api('/api/booking/profile/update', updated);
      modal.classList.add('hidden');
      toast('׳₪׳¨׳•׳₪׳™׳ ׳¢׳•׳“׳›׳ ג“');
    });
  });
}

document.getElementById('copy-booking-link')?.addEventListener('click', () => {
  api('/api/tunnel/status').then(status => {
    const url = status.url ? status.url + '/book' : window.location.origin + '/book';
    navigator.clipboard.writeText(url)
      .then(() => toast(status.url ? '׳§׳™׳©׳•׳¨ ׳”׳•׳¢׳×׳§ ג“' : '׳”׳•׳¢׳×׳§ (localhost) ג€” ׳”׳₪׳¢׳ ׳’׳™׳©׳” ׳¦׳™׳‘׳•׳¨׳™׳× ׳‘׳¡׳§׳¦׳™׳™׳× ׳”׳–׳™׳׳•׳ ׳™׳'))
      .catch(() => toast(url));
  });
});

document.getElementById('booking-edit-profile-btn')?.addEventListener('click', openBookingProfileModal);

// ---------- Welcome Screen (first run) ----------
// Called from _initApp() so auth is guaranteed to be ready
function initWelcome() {
  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;

  function showWelcome() { overlay.classList.remove('hidden'); }
  function hideWelcome() { overlay.classList.add('hidden'); }

  // In SaaS mode, _userName is already set from auth. Show welcome if still empty.
  if (window._userId && !window._userName) {
    showWelcome();
  } else {
    api('/api/settings').then(s => {
      if (!s.userName || !s.userName.trim()) showWelcome();
    }).catch(() => {});
  }

  document.getElementById('welcome-start')?.addEventListener('click', async () => {
    const btn  = document.getElementById('welcome-start');
    const name = (document.getElementById('welcome-name')?.value || '').trim();
    const role = (document.getElementById('welcome-role')?.value || '').trim();
    if (!name) {
      document.getElementById('welcome-name')?.focus();
      toast('׳ ׳ ׳׳”׳›׳ ׳™׳¡ ׳©׳ נ˜', false);
      return;
    }
    btn.disabled = true; btn.textContent = 'ג³ ׳©׳•׳׳¨...';
    try {
      await api('/api/settings/update', {
        userName: name,
        assistantName: '׳§׳¨׳׳•׳¡',
        ...(role ? { userRole: role } : {})
      });
      hideWelcome();
      loadState();
      toast('׳‘׳¨׳•׳ ׳”׳‘׳, ' + name + '! נ‰');
    } catch (e) {
      btn.disabled = false; btn.textContent = 'ג… ׳‘׳•׳ ׳ ׳×׳—׳™׳';
      toast('׳©׳’׳™׳׳” ׳‘׳©׳׳™׳¨׳” ג€” ׳ ׳¡׳” ׳©׳•׳‘', false);
    }
  });

  document.getElementById('welcome-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('welcome-role')?.focus();
  });
  document.getElementById('welcome-role')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('welcome-start')?.click();
  });

  document.getElementById('welcome-skip-link')?.addEventListener('click', e => {
    e.preventDefault();
    hideWelcome();
  });
}

// ---------- Init ----------
function _initApp() {
  applyTheme();
  applyMode();
  refreshSoundLabel();
  initSectionToggles();
  const nd = $('#new-task-date');
  if (nd) nd.value = todayStr();
  initWelcome();
  // Handle Google OAuth return
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('google_connected') === '1') {
    history.replaceState({}, '', window.location.pathname);
    toast('ג… Google ׳—׳•׳‘׳¨ ׳‘׳”׳¦׳׳—׳”! ׳׳¨׳¢׳ ׳ ׳ ׳×׳•׳ ׳™׳...');
    setTimeout(_googleRefreshData, 800);
  } else if (urlParams.get('google_error')) {
    history.replaceState({}, '', window.location.pathname);
    toast('׳©׳’׳™׳׳” ׳‘׳—׳™׳‘׳•׳¨ Google: ' + decodeURIComponent(urlParams.get('google_error')), false);
  }
  loadState();
  // Auto-poll for new bookings every 30s
  setInterval(async () => {
    try {
      const d = await api('/api/booking/poll');
      if (d.hasNew) loadState();
    } catch(e) {}
  }, 30000);
}

// If running locally (no Supabase auth layer) or auth already resolved ג†’ start now.
// If running in SaaS mode ג†’ auth guard calls window._startApp() after it resolves.
if (!window._supabase || window._userId) {
  _initApp();
} else {
  window._startApp = _initApp;
}

