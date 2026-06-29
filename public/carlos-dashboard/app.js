// Carlos Dashboard — client logic
const $ = (s) => document.querySelector(s);

// Israel-local date (YYYY-MM-DD). Using UTC toISOString caused false "stale" warnings
// and wrong overdue/today detection between midnight and 03:00 Israel time.
function ilDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function toast(msg, ok = true, ms = 3400) {
  const t = document.createElement('div');
  t.className = 'toast ' + (ok ? 'ok' : 'err');
  t.textContent = msg;
  $('#toast-area').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    toast('שגיאה בחיבור לשרת: ' + e.message, false);
    throw e;
  }
}

// DOMAINS is populated dynamically from config.json via /api/state (userConfig.domains)
// Default fallback used before first state load
let DOMAINS = [{ id: 'unassigned', label: '⚪ לא משויך' }];

// Platforms — preset list, users toggle active/inactive in settings
const DEFAULT_PLATFORMS = [
  { id: 'instagram', emoji: '📸', label: 'Instagram', active: true },
  { id: 'tiktok',    emoji: '🎵', label: 'TikTok',    active: true },
  { id: 'facebook',  emoji: '👥', label: 'Facebook',  active: true },
  { id: 'youtube',   emoji: '▶️', label: 'YouTube',   active: false },
  { id: 'linkedin',  emoji: '💼', label: 'LinkedIn',  active: false },
  { id: 'pinterest', emoji: '📌', label: 'Pinterest', active: false },
  { id: 'x',         emoji: '🐦', label: 'X',         active: false },
  { id: 'podcast',   emoji: '🎙️', label: 'Podcast',   active: false },
];
let PLATFORMS = DEFAULT_PLATFORMS;
const activePlatforms = () => PLATFORMS.filter(p => p.active);

// תיקון timezone: שימוש בתאריך מקומי (לא UTC) למניעת קפיצת יום אחרי חצות
const todayStr = () => ilDate();

const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
};

// ---------- State & render ----------
let lastState = null;
let _loadingState = false;
const _reminderTimeouts = new Map(); // taskId → timeoutId
async function loadState() {
  if (_loadingState) return;
  _loadingState = true;
  let s;
  try {
    s = await api('/api/state');
  } catch (e) {
    _loadingState = false;
    return;
  }
  _loadingState = false;
  lastState = s;
  // Update DOMAINS from config
  if (s.userConfig && s.userConfig.domains && s.userConfig.domains.length) {
    DOMAINS = [
      ...s.userConfig.domains.map(d => ({ id: d.id, label: d.emoji + ' ' + d.label })),
      { id: 'unassigned', label: '⚪ לא משויך' }
    ];
  }
  // Update PLATFORMS from config
  if (s.userConfig && s.userConfig.platforms && s.userConfig.platforms.length) {
    PLATFORMS = s.userConfig.platforms;
  }
  // Lite-mode toggle: hide AI surfaces when edition=lite
  const isLite = s.userConfig && s.userConfig.edition === 'lite';
  const hasByok = s.userConfig && s.userConfig.aiBriefing;
  document.body.classList.toggle('lite-mode', isLite);
  document.body.classList.toggle('has-ai-briefing', isLite && hasByok);
  // Update page title & footer assistant name
  const aName = (s.userConfig && s.userConfig.assistantName) || 'דאשבורד';
  const titleEl = document.getElementById('page-title');
  if (titleEl) document.title = aName + ' · דאשבורד';
  const footerEl = document.getElementById('footer-asst');
  if (footerEl) footerEl.textContent = aName + ' דאשבורד';
  renderGreeting();
  renderBriefing(s.briefing);
  renderEmail(s.emailSummary);
  renderTomorrow(s.tasks, s.calendarUpcoming);
  renderContentSelects(s.userConfig && s.userConfig.contentTypes, s.userConfig && s.userConfig.domains);
  renderContactsHeader(s.userConfig && s.userConfig.contactsLabels);
  renderContent(s.content, s.weekly);
  renderJournalToday(s.journalToday);
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
  renderBooking(s.bookingData);
  renderBookingAlerts(s.bookingData && s.bookingData.notifications, s.bookingData && s.bookingData.appointments);
  renderPlaybookSidebar(s.userConfig && s.userConfig.domains, s.playbooks);
  renderRefreshStatus(s.lastRefresh, s.date);
}

function renderRefreshStatus(lastRefresh, todayDate) {
  const bar = document.getElementById('auto-refresh-bar');
  const msg = document.getElementById('auto-refresh-msg');
  if (!bar || !msg) return;

  // Lite mode: no refresh needed — hide banner completely
  if (document.body.classList.contains('lite-mode')) {
    bar.classList.add('hidden');
    return;
  }

  if (!lastRefresh) {
    // No refresh has ever run — show subtle hint
    bar.className = 'auto-refresh-bar auto-refresh-none';
    msg.innerHTML = '⚪ רענון יומי לא הוגדר — <a href="#" id="refresh-setup-link">הוראות הגדרה</a>';
    document.getElementById('refresh-setup-link')?.addEventListener('click', e => {
      e.preventDefault();
      toast('📋 פתח ⚙️ הגדרות → 🔌 חיבורים → "⏰ תזמן רענון"', true, 6000);
    });
    bar.classList.remove('hidden');
    return;
  }

  const today = ilDate();
  const daysDiff = Math.floor((new Date(today) - new Date(lastRefresh.date)) / 864e5);

  if (lastRefresh.date === today && lastRefresh.status === 'success') {
    // עודכן היום בהצלחה מלאה
    bar.className = 'auto-refresh-bar auto-refresh-ok';
    msg.innerHTML = `🟢 עודכן ב-${lastRefresh.time} היום &nbsp;<button class="refresh-now-btn" id="refresh-now-btn">🔄</button>`;
    bar.classList.remove('hidden');
    document.getElementById('refresh-now-btn')?.addEventListener('click', () => _googleRefreshData());
  } else if (lastRefresh.date === today) {
    // עודכן היום אבל לא הכל הצליח (status: partial / failed)
    bar.className = 'auto-refresh-bar auto-refresh-warn';
    msg.innerHTML = `🟡 עודכן חלקית היום ב-${lastRefresh.time} (${lastRefresh.tasks_failed||0} משימות נכשלו) — <button class="refresh-now-btn" id="refresh-now-btn">🔄 נסה שוב</button>`;
    bar.classList.remove('hidden');
    _bindManualRefresh();
  } else if (daysDiff <= 1) {
    // אתמול — הצג אזהרה קלה
    bar.className = 'auto-refresh-bar auto-refresh-warn';
    msg.innerHTML = `🟡 עדכון אחרון: אתמול ב-${lastRefresh.time} — <button class="refresh-now-btn" id="refresh-now-btn">🔄 עדכן עכשיו</button>`;
    bar.classList.remove('hidden');
    _bindManualRefresh();
  } else {
    // יותר מיום — אזהרה בולטת
    bar.className = 'auto-refresh-bar auto-refresh-error';
    msg.innerHTML = `🔴 לא עודכן ${daysDiff} ימים! (אחרון: ${lastRefresh.date}) — <button class="refresh-now-btn" id="refresh-now-btn">🔄 עדכן עכשיו</button>`;
    bar.classList.remove('hidden');
    _bindManualRefresh();
  }
}

function _bindManualRefresh() {
  document.getElementById('refresh-now-btn')?.addEventListener('click', async function () {
    const btn = this;
    btn.disabled = true; btn.textContent = '⏳ מעדכן...';
    const msg = document.getElementById('auto-refresh-msg');
    // Use the reliable script-based refresh (same as ⚙️ → 🔌 חיבורים → "הרץ רענון עכשיו").
    // The old chat-based /api/ask path was slow and didn't reliably write the files.
    try {
      const r = await api('/api/setup/run-refresh', {});
      const pid = r.pid;
      if (!pid) {
        // Cloud mode — use Netlify function directly
        await _googleRefreshData();
        btn.disabled = false; btn.textContent = '🔄 עדכן עכשיו';
        return;
      }
      const start = Date.now();
      const poll = async () => {
        try {
          const sr = await fetch('/api/setup/refresh-status?pid=' + pid);
          const st = await sr.json();
          const sec = Math.floor((Date.now() - start) / 1000);
          if (st.done) {
            if (st.exitCode === 0) { toast('✅ נתונים עודכנו!'); loadState(); }
            else { toast('⚠ הרענון נכשל חלקית — נסה שוב', false); btn.disabled = false; btn.textContent = '🔄 נסה שוב'; }
          } else {
            if (msg) msg.textContent = `⏳ מעדכן... (${sec} שניות)`;
            setTimeout(poll, 3000);
          }
        } catch (e) { if (msg) msg.textContent = 'שגיאה — נסה שוב'; btn.disabled = false; btn.textContent = '🔄 נסה שוב'; }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      toast('שגיאה בהפעלת רענון — נסה שוב', false);
      btn.disabled = false; btn.textContent = '🔄 נסה שוב';
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
  const g = h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב';
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
      const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      if (briefingDate !== todayDate) {
        staleHtml = `<div class="br-stale-warning" style="cursor:pointer" onclick="typeof _googleRefreshData==='function'?_googleRefreshData():loadState()">⚠️ בריפינג מ-${dd}.${mm} — לחץ כאן לעדכון 🔄</div>`;
      }
    }
    // Skip the 🎯 focus section — it's already shown in the sidebar
    let skipFocus = false;
    const FOCUS_RE  = /🎯/;
    const SECTION_RE = /^[📅⚠️📊🎵📋💡🌅━]/u;
    const bodyHtml = text.trim().split('\n').map(raw => {
      if (FOCUS_RE.test(raw)) { skipFocus = true; return ''; }
      if (skipFocus) {
        if (raw.trim() === '' || SECTION_RE.test(raw.trim())) skipFocus = false;
        if (skipFocus) return '';
      }
      const safe = _esc(raw);
      const line = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (/^#{1,3}\s/.test(raw)) return `<div class="br-heading">${line.replace(/^#+\s+/, '')}</div>`;
      if (/^[-*•]\s/.test(raw)) return `<div class="br-item">${line.replace(/^[-*•]\s+/, '')}</div>`;
      if (raw.trim() === '') return '<div class="br-gap"></div>';
      return `<div class="br-line">${line}</div>`;
    }).join('');
    el.innerHTML = staleHtml + bodyHtml;
  } else {
    // BYOK: if API key set → show generate button; if lite with no key → upgrade hint
    if (document.body.classList.contains('has-ai-briefing')) {
      el.innerHTML = `<div class="br-byok-prompt">
        <div class="muted-text" style="margin-bottom:8px">אין עדיין בריפינג להיום</div>
        <button id="byok-gen-btn" class="byok-gen-btn">✨ צור בריפינג עכשיו</button>
      </div>`;
      document.getElementById('byok-gen-btn')?.addEventListener('click', _generateByokBriefing);
    } else if (document.body.classList.contains('lite-mode')) {
      el.innerHTML = `<div class="muted-text">💡 הוסף מפתח Anthropic ב-⚙️ הגדרות כדי לקבל בריפינג בוקר חכם</div>`;
    } else {
      el.innerHTML = `<div class="muted-text">בריפינג בוקר יופיע כאן אחרי הרענון הבוקר (07:00)<br>
        <span class="br-hint">💡 לרענון מיידי — לחץ 🔄 בפינה</span></div>`;
    }
  }
}

async function _generateByokBriefing() {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    toast('⚠️ יצירת בריפינג לא זמינה בהרצה מקומית', false);
    return;
  }
  const btn = document.getElementById('byok-gen-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ יוצר בריפינג...'; }
  try {
    const r = await fetch('/api/briefing/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || 'שגיאה');
    toast('✓ בריפינג נוצר');
    loadState();
  } catch (e) {
    toast('שגיאה ביצירת בריפינג: ' + e.message, false);
    if (btn) { btn.disabled = false; btn.textContent = '✨ צור בריפינג עכשיו'; }
  }
}

function renderEmail(summary) {
  $('#email-body').innerHTML = (summary && summary.trim())
    ? summary.split('\n').filter(l => l.trim()).map(l => `<div>${_esc(l)}</div>`).join('')
    : '<span class="muted-text">סיכום מיילים יופיע כאן אחרי הרענון הבוקר (07:00)<br><span class="br-hint">💡 לרענון מיידי — לחץ 🔄 בפינה</span></span>';
}

// (renderFocus moved to sidebar — see renderSbFocus below)

function dueLabel(task) {
  if (!task.due_date) return '';
  const tmrw = ilDate(1);
  const d = task.due_date;
  const day = d === todayStr() ? 'היום' : d === tmrw ? 'מחר' : d.slice(8, 10) + '/' + d.slice(5, 7);
  let time = '';
  if (task.reminder_at) { const _rd = new Date(task.reminder_at); if (!isNaN(_rd)) time = ' ' + _rd.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }); }
  return '📅 ' + day + time;
}

function renderTasks(tasks, date, completedToday) {
  const tmrw = tomorrowStr();
  // משימות של מחר מוצגות בסקשן "מחר" — לא כאן
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
        const overdueMark = isOverdue(t) ? '⚠️ ' : '';
        const notesChip = (t.notes && t.notes.trim()) ? `<span class="notes-chip" title="${(t.notes||'').replace(/"/g,'&quot;').slice(0,200)}">📝 בתהליך</span>` : '';
        return `<li class="${overdueCls}" data-id="${t.id}"><input type="checkbox" data-id="${t.id}">
          <span class="${t.priority === 'urgent' ? 'urgent' : ''}">${overdueMark}${t.priority === 'urgent' ? '⚠️ ' : ''}${_esc(t.title)}</span>
          ${notesChip}
          ${cc}
          ${dl ? `<span class="due-chip">${dl}</span>` : ''}
          <button class="row-edit-btn" data-id="${t.id}" data-kind="task" title="ערוך">✏️</button></li>`;
      }).join('')
    : '<li class="muted-text">אין משימות ממתינות 🎉</li>';

  // Completed today — shown with strikethrough
  const doneHtml = (completedToday || []).length
    ? (completedToday || []).map(t =>
        `<li class="task-done-today" data-id="${t.id}">
          <input type="checkbox" checked data-id="${t.id}" class="task-undo-cb">
          <span>${_esc(t.title)}</span>
          <span class="done-chip">✓ בוצע</span>
        </li>`
      ).join('')
    : '';

  $('#task-list').innerHTML = pendingHtml +
    (doneHtml ? `<li class="done-divider">הושלמו היום</li>${doneHtml}` : '');

  document.querySelectorAll('#task-list input[type=checkbox]:not(.task-undo-cb)').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/task', { action: 'toggle', id: cb.dataset.id });
      toast('✓ משימה הושלמה');
      loadState();
    }));

  // Un-complete: uncheck a done task
  document.querySelectorAll('#task-list .task-undo-cb').forEach(cb =>
    cb.addEventListener('change', async () => {
      if (!cb.checked) {
        await api('/api/task/undo', { id: cb.dataset.id });
        toast('↩ משימה חזרה לממתינות');
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
    ? ((lastState && lastState.tasks) || []).find(x => x.id === id)
    : ((lastState && lastState.content && lastState.content.items) || []).find(x => x.id === id);
  if (!item) { rowEl.classList.remove('editing'); return; }
  const taskCategoryOpts = [
    ['general',   '📌 כללי'],
    ['health',    '💊 בריאות / טיפולים'],
    ['marketing', '📢 שיווק'],
    ['music',     '🎵 מוזיקה / DJ'],
    ['learning',  '📚 לימוד']
  ];
  const taskPriorityOpts = [
    ['normal', '🔵 רגיל'],
    ['urgent', '⚠️ דחוף'],
    ['low',    '⚪ נמוך']
  ];
  const fieldsCfg = kind === 'task'
    ? [
        ['title','כותרת','text'],
        ['category','קטגוריה','select', taskCategoryOpts],
        ['priority','עדיפות','select', taskPriorityOpts],
        ['due_date','תאריך','date'],
        ['reminder_at','שעה','time'],
        ['notes','הערות','textarea']
      ]
    : [['title','כותרת','text'],['body','תוכן הפוסט','textarea'],
       ['scheduled_for','מתוזמן ליום','date'],['docs_url','Google Docs URL','text']];
  const valueOf = (k) => {
    if (kind === 'task' && k === 'reminder_at' && item.reminder_at) { const _d = new Date(item.reminder_at); if (!isNaN(_d)) return _d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }); }
    if (kind === 'task' && k === 'category') return item.category || 'general';
    if (kind === 'task' && k === 'priority') return item.priority || 'normal';
    return item[k] != null ? item[k] : '';
  };
  const formHtml = `<div class="inline-edit-form">
    ${fieldsCfg.map(([k, l, t, opts]) => fld(k, l, valueOf(k), t, opts)).join('')}
    <div class="ef-actions">
      <button class="ef-save" type="button">שמור</button>
      ${kind === 'task' ? '<button class="ef-del" type="button">✕ מחק</button>' : ''}
      <button class="ef-cancel" type="button">סגור</button>
    </div>
  </div>`;
  rowEl.insertAdjacentHTML('afterend', formHtml);
  const form = rowEl.nextElementSibling;

  // Auto-grow textareas
  form.querySelectorAll('textarea[data-autogrow]').forEach(ta => {
    const _grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', _grow);
    _grow();
  });

  // Clear time field button
  form.addEventListener('click', e => {
    if (e.target.classList.contains('time-clear')) {
      const input = e.target.previousElementSibling;
      input.value = '';
      input.dataset.cleared = '1';
    }
  });

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
    const timeInput = form.querySelector('input[name="reminder_at"]');
    if (timeInput && timeInput.dataset.cleared) data.reminder_at = null;
    if (kind === 'task' && data.reminder_at && !data.reminder_at.includes('T')) {
      // Include local timezone offset so Supabase (UTC) stores the correct time
      const off = -new Date().getTimezoneOffset();
      const tzStr = (off >= 0 ? '+' : '-') + String(Math.floor(Math.abs(off)/60)).padStart(2,'0') + ':' + String(Math.abs(off)%60).padStart(2,'0');
      data.reminder_at = (data.due_date || ilDate()) + 'T' + data.reminder_at + tzStr;
    }
    if (kind === 'content') {
      const widget = form.querySelector('.multi-img-widget');
      if (widget) data.creative_urls = JSON.parse(widget.dataset.urls || '[]');
    }
    await api(kind === 'task' ? '/api/task/update' : '/api/content/update', { ...data, id });
    toast('✓ עודכן');
    loadState().then(() => _scheduleReminders());
  });
  const del = form.querySelector('.ef-del');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('למחוק את המשימה לצמיתות?')) return;
    await api('/api/task/delete', { id });
    toast('🗑️ המשימה נמחקה');
    loadState();
  });
  form.querySelector('.ef-cancel').addEventListener('click', () => loadState());

}

// ---------- Multi-image gallery (content edit) ----------
function renderMultiImgGallery(container, urls) {
  const list = container.querySelector('.mig-list');
  if (!list) return;
  list.innerHTML = (urls || []).map((url) => {
    const fname = decodeURIComponent(url.split('/').pop().split('?')[0]);
    const displayName = fname.replace(/^\d+-/, '');
    const isImg = /\.(jpe?g|png|gif|webp|svg)/i.test(fname);
    const isVid = /\.(mp4|mov|webm|avi)/i.test(fname);
    const badge = isImg ? `<span class="mig-badge mig-badge-img">🖼️ תמונה</span>`
                : isVid ? `<span class="mig-badge mig-badge-vid">🎬 וידאו</span>`
                : `<span class="mig-badge mig-badge-file">📎 קובץ</span>`;
    const preview = isImg
      ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" class="mig-thumb" alt="${displayName}" onerror="this.style.display='none'"></a>`
      : isVid
        ? `<a href="${url}" target="_blank" rel="noopener"><video src="${url}" class="mig-thumb" muted playsinline preload="metadata"></video></a>`
        : `<a href="${url}" target="_blank" rel="noopener" class="mig-file-icon">📎</a>`;
    return `<div class="mig-item" data-url="${url}">
      ${preview}
      ${badge}
      <span class="mig-name" title="${displayName}">${displayName.slice(0,28)}${displayName.length>28?'…':''}</span>
      <button class="mig-remove" type="button" title="הסר">✕</button>
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
  if (hint) hint.textContent = count + ' תמונות · עד 20MB לכל קובץ';
}

function buildMultiImgWidget(existingUrls) {
  const urls = existingUrls || [];
  const div = document.createElement('div');
  div.className = 'multi-img-widget';
  div.dataset.urls = JSON.stringify(urls);
  div.innerHTML = `
    <span class="mig-label">📸 תמונות / קריאטיבים</span>
    <div class="mig-list"></div>
    <div class="mig-add">
      <input type="file" class="mig-file-input" accept="image/*,video/*" multiple placeholder="בחר קבצים...">
      <div class="mig-count-hint">${urls.length} תמונות · עד 20MB לכל קובץ</div>
    </div>
  `;
  renderMultiImgGallery(div, urls);

  div.querySelector('.mig-file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) { toast('הקובץ גדול מ-20MB: ' + file.name, false); continue; }
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
              toast('✓ ' + file.name.slice(0, 30) + ' הועלה');
            }
          } catch (err) { toast('שגיאה בהעלאה: ' + file.name, false); }
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
    if (c) return `<span class="contact-chip">💆 ${c.name || '(לקוח)'}</span>`;
  }
  if (t.event_id) {
    const e = (lastState && lastState.events || []).find(x => x.id === t.event_id);
    if (e) return `<span class="contact-chip">🎵 ${[e.date, e.contact].filter(Boolean).join(' · ') || '(אירוע)'}</span>`;
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
        gcalEl.innerHTML = '<div class="tmrw-gcal-title">📆 פגישות ביומן</div>' +
          evts.map(e => {
            const timeStr = (!e.time || e.time === 'allday') ? 'כל היום' : e.time;
            return `<div class="tmrw-gcal-item">` +
              `<span class="tmrw-gcal-time">${timeStr}</span>` +
              `<span class="tmrw-gcal-title-text">${_esc(e.title)}</span>` +
              `</div>`;
          }).join('');
      } else {
        gcalEl.innerHTML = '<div class="tmrw-gcal-empty">📆 אין פגישות ביומן למחר</div>';
      }
    };
    // Use state data if available, otherwise fetch directly
    if (upcomingEvents && upcomingEvents.events && upcomingEvents.events.length) {
      renderGcal(upcomingEvents);
    } else {
      api('/api/calendar-upcoming').then(renderGcal).catch(() => {
        gcalEl.innerHTML = '<div class="tmrw-gcal-empty">📆 יומן לא זמין</div>';
      });
    }
  }

  const tmrwTasks = (tasks || []).filter(t => t.due_date === tmrw);
  const list = $('#tomorrow-list');
  if (!list) return;

  list.innerHTML = tmrwTasks.length
    ? tmrwTasks.map(t => {
        const time = t.reminder_at ? (() => { const _d = new Date(t.reminder_at); return isNaN(_d) ? '' : ' · ' + _d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }); })() : '';
        return `<li data-id="${t.id}">
          <input type="checkbox" data-id="${t.id}">
          <span>${t.title}</span>
          ${time ? `<span class="due-chip">⏰${time}</span>` : ''}
          <button class="row-edit-btn" data-id="${t.id}" data-kind="task" title="ערוך">✏️</button>
        </li>`;
      }).join('')
    : '';

  list.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/task', { action: 'toggle', id: cb.dataset.id });
      toast('✓ הושלם');
      loadState();
    }));

  bindRowEditBtns('#tomorrow-list');
}


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
          <span>${weeklyCount(h.id)}/7 שבוע</span>
          <span>${monthCount(h.id)}/${daysInMonth} חודש</span>
          <span class="habit-streak">🔥 ${streakOf(h.id)}</span>
        </span>
      </label>`).join('')
    : '<div class="muted-text" style="font-size:.85rem;padding:6px 0">אין הרגלים — הוסף דרך ⚙️ הגדרות</div>';

  $('#habit-list').innerHTML = habitHtml;

  document.querySelectorAll('#habit-list input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/habit', { id: cb.dataset.id });
      loadState();
    }));
}

function renderTimeToday(timeLog, date) {
  const sessions = ((timeLog && timeLog.entries) || []).filter(s => (s.ended_at || '').slice(0, 10) === date);
  const el = $('#time-list');
  if (!sessions.length) { el.innerHTML = '<span class="muted-text">עדיין לא נרשם זמן היום</span>'; return; }
  const total = sessions.reduce((sum, x) => sum + (x.seconds || 0), 0);
  el.innerHTML = sessions.map(s =>
    `<div class="time-row">
       <span>${s.label || s.domain}</span>
       <span class="time-meta">
         <span class="muted-text">${fmt(s.seconds)}${s.note ? ' · ' + s.note : ''}</span>
         <button class="time-del" data-id="${s.id}" title="מחק רישום">✕</button>
       </span>
     </div>`
  ).join('') + `<div class="time-total">סה"כ היום: ${fmt(total)}</div>`;
  document.querySelectorAll('.time-del').forEach(b =>
    b.addEventListener('click', async () => {
      await api('/api/timer/delete', { id: b.dataset.id });
      toast('🗑️ הזמן נמחק');
      loadState();
    }));
}

// ---------- Content ----------
const NEXT_STATUS = { idea: 'draft', draft: 'ready', ready: 'published' };
let _contentCollapsed = localStorage.getItem('contentPublishedCollapsed') !== 'false';
const STATUS_LABEL = {
  idea: '💡 רעיונות',
  draft: '✏️ טיוטות',
  ready: '✅ מוכנים לפרסום',
  published: '📤 פורסם השבוע'
};
const NEXT_LABEL = { idea: '→ טיוטה', draft: '→ מוכן', ready: '→ פורסם' };

const domainLabel = id => (DOMAINS.find(d => d.id === id) || DOMAINS[DOMAINS.length - 1]).label;

function renderContentSelects(contentTypes, domains) {
  const typeEl   = document.getElementById('new-content-type');
  const domainEl = document.getElementById('new-content-domain');
  if (typeEl && contentTypes && contentTypes.length) {
    const prev = typeEl.value;
    typeEl.innerHTML = contentTypes.map(t =>
      `<option value="${_esc(t.id)}">${_esc(t.emoji)} ${_esc(t.label)}</option>`
    ).join('');
    if (contentTypes.find(t => t.id === prev)) typeEl.value = prev;
  }
  if (domainEl && domains && domains.length) {
    const prev = domainEl.value;
    domainEl.innerHTML = domains.map(d =>
      `<option value="${_esc(d.id)}">${_esc(d.emoji)} ${_esc(d.label)}</option>`
    ).join('');
    if (domains.find(d => d.id === prev)) domainEl.value = prev;
  }
  // Render platform checkboxes for add-content form
  const platEl = document.getElementById('new-content-platforms');
  if (platEl) {
    const active = activePlatforms();
    platEl.innerHTML = active.length ? active.map(p =>
      `<label class="c-plat-check"><input type="checkbox" name="plat" value="${p.id}"> ${p.emoji} ${p.label}</label>`
    ).join('') : '';
  }
}

function _renderContentTypesSettings(contentTypes) {
  const listEl = document.getElementById('content-types-settings-list');
  if (!listEl) return;
  let types = contentTypes && contentTypes.length ? JSON.parse(JSON.stringify(contentTypes))
    : [{ id: 'reel', emoji: '🎬', label: 'רילס' }, { id: 'post', emoji: '📝', label: 'פוסט' }];

  function _redraw() {
    listEl.innerHTML = `
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:8px">סוגי התוכן שמופיעים בתפריט הוספת תוכן — ערוך, הוסף, או מחק</div>
      <div id="ct-rows" style="display:flex;flex-direction:column;gap:6px"></div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
        <button id="ct-new-emoji" title="בחר אמוג'י"
          style="font-size:1.3rem;min-width:40px;padding:4px 6px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer">📋</button>
        <input id="ct-new-label" type="text" placeholder="שם סוג תוכן חדש..."
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit;direction:rtl">
        <button id="ct-add-btn"
          style="padding:6px 12px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap">+ הוסף</button>
      </div>
      <button id="ct-save-btn"
        style="margin-top:10px;background:var(--primary);color:#fff;border:none;padding:7px 18px;border-radius:8px;cursor:pointer;font-size:.88rem">💾 שמור סוגי תוכן</button>`;

    const rows = listEl.querySelector('#ct-rows');
    types.forEach((t, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center';
      row.innerHTML = `
        <button class="ct-emoji-btn" data-ci="${i}" title="בחר אמוג'י"
          style="font-size:1.2rem;min-width:38px;padding:3px 6px;border:1px solid var(--border);border-radius:7px;background:var(--card);cursor:pointer">${_esc(t.emoji)}</button>
        <input type="text" value="${_esc(t.label)}" data-ci="${i}"
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit;direction:rtl">
        <button data-del="${i}"
          style="background:transparent;border:1px solid #ff606044;color:#ff6060;padding:4px 9px;border-radius:6px;cursor:pointer;font-size:.85rem">✕</button>`;
      rows.appendChild(row);
    });

    rows.querySelectorAll('.ct-emoji-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _openEmojiPicker(btn, em => { types[parseInt(btn.dataset.ci)].emoji = em; btn.textContent = em; });
      });
    });
    rows.querySelectorAll('input[data-ci]').forEach(inp => {
      inp.addEventListener('input', () => { types[parseInt(inp.dataset.ci)].label = inp.value; });
    });
    rows.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => { types.splice(parseInt(btn.dataset.del), 1); _redraw(); });
    });

    listEl.querySelector('#ct-new-emoji').addEventListener('click', e => {
      e.stopPropagation();
      _openEmojiPicker(listEl.querySelector('#ct-new-emoji'), em => {
        listEl.querySelector('#ct-new-emoji').textContent = em;
      });
    });
    listEl.querySelector('#ct-add-btn').addEventListener('click', () => {
      const emoji = listEl.querySelector('#ct-new-emoji').textContent.trim() || '📋';
      const label = listEl.querySelector('#ct-new-label').value.trim();
      if (!label) { toast('הזן שם לסוג תוכן', false); return; }
      const id = label.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]/g,'') + '-' + (crypto.randomUUID ? crypto.randomUUID().slice(0,8) : Date.now().toString(36));
      types.push({ id, emoji, label });
      _redraw();
    });
    listEl.querySelector('#ct-save-btn').addEventListener('click', async () => {
      const btn = listEl.querySelector('#ct-save-btn');
      btn.disabled = true; btn.textContent = '⏳';
      const r = await api('/api/settings/update', { content_types: types });
      if (r && r.ok) {
        if (lastState && lastState.userConfig) lastState.userConfig.contentTypes = types;
        renderContentSelects(types, lastState && lastState.userConfig && lastState.userConfig.domains);
        toast('סוגי תוכן נשמרו ✓');
      } else { toast('שגיאה בשמירה', false); }
      btn.disabled = false; btn.textContent = '💾 שמור סוגי תוכן';
    });
  }
  _redraw();
}

function renderContent(content, weekly) {
  const items = (content && content.items) || [];
  const buckets = { idea: [], draft: [], ready: [], published: [] };
  items.forEach(i => { (buckets[i.status] || buckets.idea).push(i); });

  const html = ['idea', 'draft', 'ready', 'published'].map(s => {
    if (!buckets[s].length) return '';
    const isPublished = s === 'published';
    const collapsedCls = isPublished && _contentCollapsed ? ' c-collapsed' : '';
    const toggleBtn = isPublished
      ? `<button class="c-bucket-toggle" data-bucket="published" title="${_contentCollapsed ? 'הרחב' : 'מזער'}">${_contentCollapsed ? '▸' : '▾'}</button>`
      : '';
    return `<div class="c-bucket c-bucket-${s}${collapsedCls}">
      <div class="c-bucket-title">${toggleBtn}${STATUS_LABEL[s]} (${buckets[s].length})</div>
      ${buckets[s].map(item => {
        const icon = item.type === 'reel' ? '🎬' : '📝';
        const next = NEXT_STATUS[item.status];
            const thumbUrls = item.creative_urls && item.creative_urls.length
          ? item.creative_urls
          : (item.creative_url ? [item.creative_url] : []);
        const firstThumb = thumbUrls[0] || '';
        const firstFname = decodeURIComponent(firstThumb.split('/').pop().split('?')[0]);
        const isImg = firstThumb && /\.(jpe?g|png|gif|webp|svg)/i.test(firstFname);
        const isVid = firstThumb && /\.(mp4|mov|webm)/i.test(firstFname);
        const thumbHtml = thumbUrls.length
          ? (isImg
              ? `<a href="${firstThumb}" target="_blank" rel="noopener"><img src="${firstThumb}" class="c-item-thumb" title="${thumbUrls.length} קבצים" onerror="this.parentElement.outerHTML='<span class=\\'c-img-badge\\'>📎 ${thumbUrls.length}</span>'"></a>`
              : isVid
                ? `<a href="${firstThumb}" target="_blank" rel="noopener"><span class="c-img-badge">🎬 ${thumbUrls.length}</span></a>`
                : `<a href="${firstThumb}" target="_blank" rel="noopener"><span class="c-img-badge">📎 ${thumbUrls.length}</span></a>`)
          : '';
        const itemPlatforms = Array.isArray(item.platforms) ? item.platforms : [];
        const platformTags = itemPlatforms.map(pid => {
          const p = PLATFORMS.find(x => x.id === pid);
          return p ? `<span class="c-platform-tag">${p.emoji} ${p.label}</span>` : '';
        }).join('');
        return `<div class="c-item" data-id="${item.id}">
          ${thumbHtml}
          <span class="c-item-title">${icon} ${item.title || '(ללא כותרת)'}</span>
          <span class="c-domain">${domainLabel(item.domain)}</span>
          ${platformTags}
          ${thumbUrls.length > 1 ? `<span class="c-img-badge">📸 ${thumbUrls.length}</span>` : ''}
          ${next ? `<button class="c-next-btn" data-id="${item.id}" data-next="${next}">${NEXT_LABEL[item.status]}</button>` : ''}
          <button class="row-edit-btn" data-id="${item.id}" data-kind="content" title="ערוך">✏️</button>
          <button class="c-del-btn" data-id="${item.id}" title="מחק">✕</button>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  $('#content-buckets').innerHTML = html || '<span class="muted-text">אין תוכן עדיין — הוסף רעיון לבנק</span>';
  const q = weekly && weekly.quotas;
  if (q) {
    $('#content-summary').textContent =
      `💆 ${(q.treatments_reels||{done:0,target:0}).done}/${(q.treatments_reels||{}).target||0}R · ${(q.treatments_posts||{done:0,target:0}).done}/${(q.treatments_posts||{}).target||0}P  ·  ` +
      `🎵 ${(q.music_reels||{done:0,target:0}).done}/${(q.music_reels||{}).target||0}R · ${(q.music_posts||{done:0,target:0}).done}/${(q.music_posts||{}).target||0}P  ·  ` +
      `🚀 ${(q.product_reels||{done:0,target:0}).done}/${(q.product_reels||{}).target||0}R · ${(q.product_posts||{done:0,target:0}).done}/${(q.product_posts||{}).target||0}P`;
  } else {
    $('#content-summary').textContent = '';
  }

  document.querySelectorAll('#content-buckets .c-next-btn').forEach(b =>
    b.addEventListener('click', async () => {
      await api('/api/content/update', { id: b.dataset.id, status: b.dataset.next });
      toast(b.dataset.next === 'published' ? '✓ פורסם! המכסה התעדכנה' : '✓ מצב התעדכן');
      loadState();
    }));
  document.querySelectorAll('#content-buckets .c-del-btn').forEach(b =>
    b.addEventListener('click', async () => {
      await api('/api/content/delete', { id: b.dataset.id });
      toast('🗑️ נמחק');
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
  if (!title) { toast('כתוב שם/רעיון', false); return; }
  const type = $('#new-content-type').value;
  const domain = $('#new-content-domain').value;
  const platforms = [...document.querySelectorAll('#new-content-platforms input[name="plat"]:checked')].map(c => c.value);
  await api('/api/content/add', { type, domain, title, platforms });
  $('#new-content-title').value = '';
  document.querySelectorAll('#new-content-platforms input[name="plat"]').forEach(c => c.checked = false);
  toast('✓ נוסף לבנק כרעיון · ' + domainLabel(domain));
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
          <button class="quota-edit" title="ערוך יעד">✏️</button></span>
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
  $('#task-stats').textContent = `✅ הושלמו: ${s.completedToday} היום · ${s.completedWeek} השבוע · ${s.total} בסה"כ`;
}

function renderConsistency(stats) {
  if (!stats || stats.totalEvents === 0) {
    $('#consistency-content').innerHTML =
      '<div class="muted-text">עדיין אין נתוני פרסום — תפרסם פוסט/רילס ונתחיל לעקוב 🎯</div>';
    return;
  }
  const streakLine = stats.streak > 0
    ? `<div class="cs-streak">🔥 רצף נוכחי: <strong>${stats.streak} ימים</strong> עם פרסום</div>`
    : `<div class="cs-streak muted-text">📉 אין רצף פעיל — תפרסם היום כדי להתחיל</div>`;
  const weeklyRows = (stats.weekly || []).map(w => `
    <div class="cs-week-row">
      <span class="cs-week-label">${w.weekLabel}</span>
      <span class="cs-week-vals">🎬 ${w.reels} · 📝 ${w.posts}</span>
    </div>`).join('');
  const avgLine = `<div class="cs-avg muted-text">ממוצע 4 שבועות: 🎬 ${stats.avgReels} · 📝 ${stats.avgPosts} בשבוע</div>`;
  $('#consistency-content').innerHTML = streakLine + '<div class="cs-weeks">' + weeklyRows + '</div>' + avgLine;
}

function renderOpenLoops(state) {
  const STALE_DAYS = 14;
  const ms = STALE_DAYS * 86400 * 1000;
  const nowMs = Date.now();
  const ageOf = iso => iso ? Math.floor((nowMs - new Date(iso).getTime()) / 86400000) : 0;
  const stale = iso => iso && (nowMs - new Date(iso).getTime() > ms);

  // Load & auto-clean dismissed items
  let dismissed = {};
  try { dismissed = JSON.parse(localStorage.getItem('carlos_ol_dismissed') || '{}'); } catch (_) {}
  Object.keys(dismissed).forEach(k => { if (dismissed[k] < nowMs) delete dismissed[k]; });
  localStorage.setItem('carlos_ol_dismissed', JSON.stringify(dismissed));

  const dismiss = id => {
    dismissed[id] = nowMs + 30 * 86400 * 1000;
    localStorage.setItem('carlos_ol_dismissed', JSON.stringify(dismissed));
    renderOpenLoops(state);
  };

  const allTasks = (state.tasks || []).filter(t => stale(t.created_at));
  const allLeads = (state.events || []).filter(e => e.status === 'lead' && stale(e.updated_at || e.created_at));
  const allIdeas = ((state.content || {}).items || []).filter(c => c.status === 'idea' && stale(c.created_at));

  const tasks = allTasks.filter(t => !dismissed[t.id]);
  const leads = allLeads.filter(e => !dismissed[e.id]);
  const ideas = allIdeas.filter(c => !dismissed[c.id || c.title]);

  const hiddenCount = (allTasks.length + allLeads.length + allIdeas.length) - (tasks.length + leads.length + ideas.length);

  const el = $('#open-loops-content');
  if (!(tasks.length + leads.length + ideas.length) && !hiddenCount) {
    el.innerHTML = '<div class="muted-text">הכל מתעדכן 🎯 אין דברים תקועים מעל 14 ימים</div>';
    return;
  }

  const olItem = (label, id, age) => `<div class="ol-item">
    <span>${_esc(label)}</span>
    <span class="ol-age">${age} ימים</span>
    <button class="ol-dismiss" data-id="${_esc(String(id))}" title="הסתר ל-30 יום">✕</button>
  </div>`;

  const group = (title, items) => items.length ? `<div class="ol-group">
    <div class="ol-title">${title} (${items.length})</div>
    ${items.join('')}
  </div>` : '';

  const footer = hiddenCount > 0
    ? `<div class="ol-archive-footer">📦 ${hiddenCount} פריט${hiddenCount > 1 ? 'ים' : ''} מוסתר${hiddenCount > 1 ? 'ים' : ''} · <button class="ol-show-all">הצג הכל</button></div>`
    : '';

  el.innerHTML =
    group('⏰ משימות ישנות', tasks.map(t => olItem(t.title, t.id, ageOf(t.created_at)))) +
    group('🟡 לידים תקועים', leads.map(e => olItem([e.date, e.contact].filter(Boolean).join(' · ') || '(אירוע)', e.id, ageOf(e.updated_at || e.created_at)))) +
    group('💡 רעיונות לא קודמו', ideas.map(c => olItem(c.title || '(ללא כותרת)', c.id || c.title, ageOf(c.created_at)))) +
    footer;

  el.addEventListener('click', e => {
    const btn = e.target.closest('.ol-dismiss');
    if (btn) { dismiss(btn.dataset.id); return; }
    if (e.target.classList.contains('ol-show-all')) {
      localStorage.removeItem('carlos_ol_dismissed');
      renderOpenLoops(state);
    }
  }, { once: true });
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
     <button class="quota-save">✓</button>
     <button class="quota-cancel">✕</button>`;
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
    if (isNaN(t) || t < 0) { toast('מספר לא תקין', false); return; }
    await api('/api/quota/update', { key, target: t, scope });
    toast('✓ היעד עודכן');
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
  const btn = $('#add-task');
  if (btn.disabled) return;
  const v = $('#new-task').value.trim();
  if (!v) { toast('כתוב משימה קודם', false); return; }
  btn.disabled = true;
  const date = $('#new-task-date').value;
  const time = $('#new-task-time').value;
  const category = $('#new-task-category').value || 'general';
  const priority = $('#new-task-priority').value || 'normal';
  const payload = { action: 'add', title: v, category, priority };
  if (date) {
    payload.due_date = date;
    if (time) {
      const off = -new Date().getTimezoneOffset();
      const tzStr = (off >= 0 ? '+' : '-') + String(Math.floor(Math.abs(off)/60)).padStart(2,'0') + ':' + String(Math.abs(off)%60).padStart(2,'0');
      payload.reminder_at = date + 'T' + time + tzStr;
    }
  }
  try {
    await api('/api/task', payload);
    $('#new-task').value = ''; $('#new-task-date').value = todayStr(); $('#new-task-time').value = '';
    $('#new-task-category').value = 'general'; $('#new-task-priority').value = 'normal';
    toast('✓ ' + (date ? 'משימה נקבעה ל-' + (date === todayStr() ? 'היום' : date) + (time ? ' ' + time : '') : 'המשימה נוספה'));
    loadState().then(() => _scheduleReminders());
  } finally {
    btn.disabled = false;
  }
});
$('#new-task').addEventListener('keydown', e => { if (e.key === 'Enter') $('#add-task').click(); });

// ---------- Journal ----------
function renderJournalToday(body) {
  const el = document.getElementById('journal-today');
  if (!el) return;
  if (!body || !body.trim()) { el.innerHTML = ''; return; }
  const lines = body.split('\n').map(l =>
    l.startsWith('[') ? `<div class="jnl-line jnl-ts">${_esc(l)}</div>` : `<div class="jnl-line">${_esc(l)}</div>`
  ).join('');
  el.innerHTML = `<div class="jnl-today-label">📝 היום</div>${lines}`;
}

$('#journal-save').addEventListener('click', async () => {
  const v = $('#journal-text').value.trim();
  if (!v) { toast('כתוב משהו קודם', false); return; }
  await api('/api/journal', { text: v });
  $('#journal-text').value = '';
  toast('✓ נשמר ליומן האישי של היום');
  loadState();
});

$('#journal-history-btn').addEventListener('click', async () => {
  const modal = document.getElementById('journal-modal');
  const bodyEl = document.getElementById('journal-modal-body');
  if (!modal || !bodyEl) return;
  bodyEl.innerHTML = '<div class="jnl-loading">טוען...</div>';
  modal.style.display = 'flex';
  const res = await api('/api/journal/history');
  const entries = (res && res.entries) || [];
  if (!entries.length) {
    bodyEl.innerHTML = '<div class="jnl-empty">אין רשומות עדיין</div>';
    return;
  }

  // Group by YYYY-MM
  const months = {};
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    if (!months[key]) months[key] = [];
    months[key].push(e);
  }
  const heMonthLabel = key => {
    const [y, m] = key.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  };
  const heDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('he-IL',
    { weekday: 'long', day: 'numeric', month: 'long' });
  const renderLines = body => body.split('\n').map(l =>
    l.startsWith('[') ? `<div class="jnl-line jnl-ts">${_esc(l)}</div>` : `<div class="jnl-line">${_esc(l)}</div>`
  ).join('');

  const keys = Object.keys(months);
  bodyEl.innerHTML = keys.map((key, i) => `
    <div class="jnl-month-group">
      <button class="jnl-month-toggle${i === 0 ? ' open' : ''}" data-key="${key}">
        <span>📅 ${heMonthLabel(key)}</span>
        <span class="jnl-month-count">${months[key].length} רשומות</span>
        <span class="jnl-month-arr">${i === 0 ? '▴' : '▾'}</span>
      </button>
      <div class="jnl-month-body" style="${i === 0 ? '' : 'display:none'}">
        ${months[key].map(e => `
          <div class="jnl-arch-entry">
            <div class="jnl-arch-date">${heDate(e.date)}</div>
            <div class="jnl-arch-body">${renderLines(e.body)}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  bodyEl.querySelectorAll('.jnl-month-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const mb = btn.nextElementSibling;
      const open = btn.classList.toggle('open');
      mb.style.display = open ? '' : 'none';
      btn.querySelector('.jnl-month-arr').textContent = open ? '▴' : '▾';
    });
  });
});

document.getElementById('journal-modal-close').addEventListener('click', () => {
  document.getElementById('journal-modal').style.display = 'none';
});
document.getElementById('journal-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  _collapseSection();
  ['journal-modal', 'pb-modal'].forEach(id => {
    const m = document.getElementById(id);
    if (m && m.style.display === 'flex') m.style.display = 'none';
  });
  document.getElementById('help-modal')?.classList.add('hidden');
  document.getElementById('settings-modal')?.classList.add('hidden');
});

// ---------- Section expand (fullscreen mode) ----------
let _expandedSection = null;

function _expandSection(id) {
  if (_expandedSection) _collapseSection();
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('section-fullscreen');
  // Ensure section body is visible
  el.querySelector('.section-body')?.classList.remove('collapsed');
  document.getElementById('section-backdrop').classList.add('active');
  document.body.style.overflow = 'hidden';
  _expandedSection = id;
  // Update button icon
  el.querySelector('.section-expand-btn').textContent = '✕';
  el.querySelector('.section-expand-btn').title = 'סגור';
}

function _collapseSection() {
  if (!_expandedSection) return;
  const el = document.getElementById(_expandedSection);
  if (el) {
    el.classList.remove('section-fullscreen');
    const btn = el.querySelector('.section-expand-btn');
    if (btn) { btn.textContent = '⤢'; btn.title = 'הרחב'; }
  }
  document.getElementById('section-backdrop').classList.remove('active');
  document.body.style.overflow = '';
  _expandedSection = null;
}

function _initExpandButtons() {
  // Remove any leftover hardcoded expand buttons
  document.querySelectorAll('.section-expand-btn').forEach(b => b.remove());
  // Inject expand button right after section-toggle in every collapsible section
  document.querySelectorAll('section.card.collapsible').forEach(sec => {
    const toggle = sec.querySelector(':scope > h2 > .section-toggle');
    if (!toggle) return;
    const btn = document.createElement('button');
    btn.className = 'section-expand-btn';
    btn.dataset.section = sec.id;
    btn.title = 'הרחב';
    btn.textContent = '⤢';
    btn.type = 'button';
    toggle.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (_expandedSection === sec.id) _collapseSection();
      else _expandSection(sec.id);
    });
  });
}

document.getElementById('section-backdrop').addEventListener('click', _collapseSection);

// ---------- Sound — Web Audio API (works on all platforms, no WAV dependency) ----------
let _audioCtx = null;

function _getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if browser suspended it (required on iOS after inactivity)
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function unlockAudio() {
  try {
    _getAudioCtx();
    if (_audioCtx && _audioCtx.state === 'running') {
      document.removeEventListener('click', unlockAudio);
    }
  } catch (e) {}
}
document.addEventListener('click', unlockAudio);

function _playOscillator(pattern) {
  // pattern = [{freq, start, dur}, ...]
  try {
    const ctx = _getAudioCtx();
    pattern.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  } catch (e) {
    toast('הדפדפן לא תמך בצליל', false);
  }
}

let _chimeInterval = null;
function silenceChime() {
  clearInterval(_chimeInterval); _chimeInterval = null;
  // also stop WAV fallback if playing
  const el = document.getElementById('snd-chime');
  if (el) { el.loop = false; el.pause(); try { el.currentTime = 0; } catch (e) {} }
  $('#attrib-silence').classList.add('hidden');
}

function playSound(loop = false) {
  silenceChime();
  const type = localStorage.getItem('carlos-sound') || 'chime';

  if (type === 'beep') {
    // Short double-beep
    const pat = [{ freq: 1046, start: 0, dur: 0.12 }, { freq: 1046, start: 0.18, dur: 0.12 }];
    _playOscillator(pat);
    if (loop) _chimeInterval = setInterval(() => _playOscillator(pat), 2500);
  } else {
    // Chime: 3 descending tones
    const pat = [
      { freq: 1047, start: 0,    dur: 0.35 },
      { freq:  880, start: 0.38, dur: 0.35 },
      { freq:  659, start: 0.76, dur: 0.55 },
    ];
    _playOscillator(pat);
    if (loop) _chimeInterval = setInterval(() => _playOscillator(pat), 3500);
  }
}
function refreshSoundLabel() {
  const type = localStorage.getItem('carlos-sound') || 'chime';
  $('#tw-sound').textContent = '🔔 ' + (type === 'beep' ? 'ציפצוף' : 'צלצול');
}
$('#tw-sound').addEventListener('click', (e) => {
  e.preventDefault();
  silenceChime();                                 // עוצר צלצול קודם אם נשאר חי
  const type = localStorage.getItem('carlos-sound') || 'chime';
  localStorage.setItem('carlos-sound', type === 'beep' ? 'chime' : 'beep');
  refreshSoundLabel();
  playSound();                                    // תצוגה מקדימה — פעם אחת בלבד
});

// ---------- Timer (timestamp-based — ממשיך נכון גם ברקע) ----------
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

function _clearTimerState() {
  resetTimer();
  localStorage.removeItem('carlos-timer');
}

function tick() {
  if (!interval) return;
  if (timerMode === 'stopwatch') {
    const elapsedSec = Math.floor((Date.now() - startTs) / 1000);
    $('#tw-display').textContent = fmt(elapsedSec);
  } else {
    const remainingSec = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
    $('#tw-display').textContent = fmt(remainingSec);
    if (remainingSec <= 0) triggerFinish();          // גיבוי אם setTimeout פיגר
  }
}

function triggerFinish() {
  if (!interval) return;                              // מוגן מקריאה כפולה
  playSound(true);
  toast('⏰ הטיימר הסתיים!');
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('⏰ הטיימר הסתיים', { body: 'קרלוס דאשבורד' }); } catch (e) {}
  }
  finishTimer();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && interval) tick();           // סנכרון מיידי בחזרה לטאב
});

$('#tw-start').addEventListener('click', () => {
  unlockAudio(); // prime AudioContext during user gesture — required for iOS
  if (timerMode === 'timer') {
    plannedTotal = configuredSeconds();
    if (plannedTotal <= 0) { toast('קבע דקות או שניות', false); return; }
  } else {
    plannedTotal = 0;
  }
  startTs = Date.now();
  endTs = (timerMode === 'timer') ? startTs + plannedTotal * 1000 : 0;
  startedAt = new Date(startTs).toISOString();
  localStorage.setItem('carlos-timer', JSON.stringify({ mode: timerMode, startTs, endTs, plannedTotal }));
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
  localStorage.removeItem('carlos-timer');
  $('#tw-stop').classList.add('hidden');
  if (!startTs) { resetTimer(); return; }
  const totalSec = (timerMode === 'timer')
    ? plannedTotal
    : Math.floor((Date.now() - startTs) / 1000);
  startTs = 0; endTs = 0; plannedTotal = 0;
  if (totalSec > 0) openAttrib(totalSec); else resetTimer();
}

// ---------- Attribution dialog (event delegation, bound once) ----------
function openAttrib(seconds) {
  pendingSeconds = seconds;
  $('#attrib-dur').textContent = 'משך: ' + fmt(seconds);
  $('#attrib-note').value = '';
  $('#attrib-domains').innerHTML = `
    <div class="attrib-domains-label">בחר נושא:</div>
    <div class="attrib-radios">
      ${DOMAINS.map((d, i) => `<label class="attrib-radio">
        <input type="radio" name="attrib-domain" value="${d.id}" data-label="${d.label}" ${i === 4 ? 'checked' : ''}>
        <span>${d.label}</span>
      </label>`).join('')}
    </div>
    <button id="attrib-save" type="button" class="attrib-save">💾 שמור זמן</button>
  `;
  const chimeLooping = (localStorage.getItem('carlos-sound') || 'chime') === 'chime' && timerMode === 'timer';
  $('#attrib-silence').classList.toggle('hidden', !chimeLooping);
  $('#attrib-overlay').classList.remove('hidden');
  setTimeout(() => $('#attrib-note').focus(), 50);

  $('#attrib-save').addEventListener('click', async () => {
    silenceChime();
    const sel = document.querySelector('input[name="attrib-domain"]:checked');
    if (!sel) { toast('בחר נושא', false); return; }
    const note = $('#attrib-note').value.trim();
    await api('/api/timer', {
      domain: sel.value, label: sel.dataset.label, mode: timerMode,
      seconds: pendingSeconds, note: note, started_at: startedAt
    });
    closeAttrib();
    toast('✓ נרשם: ' + fmt(pendingSeconds) + ' · ' + sel.dataset.label + (note ? ' · "' + note + '"' : ''));
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
  toast('✓ נרשם: ' + fmt(pendingSeconds) + ' · ' + b.dataset.label + (note ? ' · "' + note + '"' : ''));
  loadState();
});
$('#attrib-close').addEventListener('click', () => {
  closeAttrib();
  toast('החלון נסגר — הזמן לא נרשם');
});
$('#attrib-silence').addEventListener('click', () => {
  silenceChime();
  toast('🔕 הצלצול הושתק');
});

// ---------- Manual time entry ----------
$('#tw-manual').addEventListener('click', (e) => {
  e.preventDefault();
  const box = $('#tw-manual-box');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  box.innerHTML =
    `<select id="m-domain">${DOMAINS.map(d => `<option value="${d.id}">${d.label}</option>`).join('')}</select>
     <input type="number" id="m-min" min="1" placeholder="דקות">
     <input type="text" id="m-note" placeholder="הערה (אופציונלי)">
     <button id="m-save">שמור זמן</button>`;
  box.classList.remove('hidden');
  $('#m-save').addEventListener('click', async () => {
    const min = parseInt($('#m-min').value);
    if (!min) { toast('כתוב כמה דקות', false); return; }
    const d = DOMAINS.find(x => x.id === $('#m-domain').value);
    const note = $('#m-note').value.trim();
    await api('/api/timer', {
      domain: d.id, label: d.label, mode: 'manual',
      seconds: min * 60, note: note, started_at: new Date().toISOString()
    });
    box.classList.add('hidden');
    toast('✓ ' + min + ' דקות נרשמו · ' + d.label);
    loadState();
  });
});

// ---------- Contacts (clients + events) ----------
let activeTab = 'clients';
let showArchive = false;

const DEFAULT_CONTACTS_LABELS = { sectionTitle: 'אנשי קשר ואירועים', tab1Emoji: '👤', tab1Label: 'אנשי קשר', tab2Emoji: '📅', tab2Label: 'אירועים' };

function renderContactsHeader(labels) {
  const L = Object.assign({}, DEFAULT_CONTACTS_LABELS, labels || {});
  const titleEl = document.querySelector('#contacts h2 span');
  if (titleEl) {
    const calLink = titleEl.querySelector('#cal-link');
    titleEl.textContent = `👥 ${L.sectionTitle} `;
    if (calLink) titleEl.appendChild(calLink);
  }
  const tabs = document.querySelectorAll('.ct-tab');
  if (tabs[0]) tabs[0].textContent = `${L.tab1Emoji} ${L.tab1Label}`;
  if (tabs[1]) tabs[1].textContent = `${L.tab2Emoji} ${L.tab2Label}`;
}

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
    : '<div class="muted-text" style="padding:8px 0">אין עדיין — לחץ "+ הוסף"</div>';

  // Archive section
  if (archived.length > 0) {
    if (showArchive) {
      html += `<div class="ct-archive-divider">
        <span class="ct-archive-label">📦 ארכיון (${archived.length})</span>
        <button class="ct-archive-toggle" id="ct-hide-archive">✕ הסתר ארכיון</button>
      </div>`;
      html += '<div class="ct-archive-list">' + archived.map(renderItem).join('') + '</div>';
    } else {
      html += `<div class="ct-archive-divider">
        <button class="ct-archive-toggle" id="ct-show-archive">📦 הצג ארכיון (${archived.length})</button>
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
  const sub = [c.city, c.phone].filter(Boolean).join(' · ');
  const photo = c.photo_url
    ? `<img src="${c.photo_url}" class="ct-avatar" alt="">`
    : `<span class="ct-avatar ct-avatar-empty">👤</span>`;
  const archCls = c.archived ? ' ct-card-archived' : '';
  return `<div class="ct-card${archCls}" data-id="${c.id}" data-type="client">
    <div class="ct-summary">
      ${photo}
      <div><strong>${c.name || '(ללא שם)'}</strong>
      <span class="muted-text">${sub || ' '}</span></div>
    </div>
  </div>`;
}

function eventCard(e) {
  const statusLabel = { lead: '🟡 ליד', booked: '🟢 סגור', done: '⚪ בוצע' }[e.status] || '';
  const archCls = e.archived ? ' ct-card-archived' : '';
  return `<div class="ct-card${archCls}" data-id="${e.id}" data-type="event">
    <div class="ct-summary">
      <strong>${e.date || '(ללא תאריך)'} · ${e.contact || ''}</strong>
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
    const ph = name === 'notes' ? 'כתוב בחופשיות על השיחה — קרלוס ישאב את הפרטים' : '';
    return `<label>${label}<textarea name="${name}" data-autogrow placeholder="${ph}">${v}</textarea></label>`;
  }
  if (type === 'select' && options) {
    const opts = options.map(([val, txt]) => `<option value="${val}"${val === value ? ' selected' : ''}>${txt}</option>`).join('');
    return `<label>${label}<select name="${name}">${opts}</select></label>`;
  }
  if (type === 'number') return `<label>${label}<input type="number" name="${name}" value="${v}"></label>`;
  if (type === 'date') return `<label>${label}<input type="date" name="${name}" value="${v}"></label>`;
  if (type === 'time') return `<label>${label}<div class="time-field-wrap"><input type="time" name="${name}" value="${v}"><button type="button" class="time-clear" title="נקה שעה">✕</button></div></label>`;
  if (type === 'file_upload') return `<label>${label}<input type="file" data-upload-target="${name}" accept="image/*,video/*"><div class="hint muted-text">קובץ עד 20MB יישמר אצלך מקומית</div></label>`;
  return `<label>${label}<input type="text" name="${name}" value="${v}"></label>`;
}

function clientForm(c) {
  const photoHtml = c.photo_url
    ? `<div class="client-photo-wrap"><img src="${c.photo_url}" class="client-photo-thumb" alt="תמונה">
        <button type="button" class="client-photo-remove" title="הסר תמונה">✕</button></div>`
    : `<div class="client-photo-wrap client-photo-empty">👤</div>`;
  return `<div class="ct-form">
    <div class="client-photo-row">
      <div class="client-photo-area" data-url="${c.photo_url || ''}">
        ${photoHtml}
      </div>
      <label class="client-photo-label">
        <span class="client-photo-btn">📷 העלה תמונה</span>
        <input type="file" class="client-photo-input" accept="image/*" style="display:none">
      </label>
    </div>
    ${fld('name', 'שם', c.name)}
    ${fld('contact', 'איש קשר', c.contact)}
    ${fld('city', 'עיר', c.city)}
    ${fld('phone', 'טלפון', c.phone)}
    ${fld('email', 'מייל', c.email)}
    ${fld('source', 'מקור הפניה', c.source)}
    ${fld('treatment_type', 'סוג טיפול / כאב', c.treatment_type)}
    ${fld('notes', 'הערות', c.notes, 'textarea')}
    ${c.id ? contactTasksSection(c.id, 'client') : ''}
    <div class="ct-actions">
      <button class="ct-save">שמור</button>
      ${c.id && !c.archived ? '<button class="ct-archive">📦 העבר לארכיון</button>' : ''}
      ${c.id && c.archived ? '<button class="ct-unarchive">↩ החזר לפעילים</button>' : ''}
      ${c.id ? '<button class="ct-del">✕ מחק</button>' : ''}
      <button class="ct-cancel">סגור</button>
    </div>
  </div>`;
}

function eventForm(e) {
  const s = e.status || 'lead';
  return `<div class="ct-form">
    ${fld('date', 'תאריך', e.date, 'date')}
    ${fld('contact', 'איש קשר', e.contact)}
    ${fld('phone', 'טלפון', e.phone)}
    ${fld('source', 'מקור הפניה', e.source)}
    ${fld('location', 'מיקום', e.location)}
    ${fld('attendees', 'כמות אנשים', e.attendees, 'number')}
    ${fld('style', 'סגנון מוזיקלי', e.style)}
    ${fld('hours', 'שעות', e.hours)}
    ${fld('payment', 'תשלום (₪)', e.payment, 'number')}
    <label>סטטוס
      <select name="status">
        <option value="lead" ${s==='lead'?'selected':''}>🟡 ליד</option>
        <option value="booked" ${s==='booked'?'selected':''}>🟢 סגור</option>
        <option value="done" ${s==='done'?'selected':''}>⚪ בוצע</option>
      </select>
    </label>
    ${fld('notes', 'הערות', e.notes, 'textarea')}
    ${e.id ? contactTasksSection(e.id, 'event') : ''}
    <div class="ct-actions">
      <button class="ct-save">שמור</button>
      ${e.id && !e.archived ? '<button class="ct-archive">📦 העבר לארכיון</button>' : ''}
      ${e.id && e.archived ? '<button class="ct-unarchive">↩ החזר לפעילים</button>' : ''}
      ${e.id ? '<button class="ct-del">✕ מחק</button>' : ''}
      <button class="ct-cancel">סגור</button>
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
    : '<div class="muted-text" style="font-size:.85rem">אין משימות פתוחות</div>';
  return `<div class="ct-tasks">
    <div class="ct-tasks-title">📋 משימות (${tasks.length})</div>
    <div class="ct-tasks-list">${rows}</div>
    <div class="ct-tasks-add">
      <input type="text" class="ct-task-new" placeholder="+ משימה חדשה">
      <input type="date" class="ct-task-date" title="תאריך (אופציונלי)">
      <button type="button" class="ct-task-add">הוסף</button>
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

  // תמונת פרופיל ללקוח
  if (type === 'client') {
    const photoInput = card.querySelector('.client-photo-input');
    const photoArea  = card.querySelector('.client-photo-area');
    if (photoInput && photoArea) {
      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { toast('הקובץ גדול מ-20MB', false); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const dataBase64 = String(reader.result).split(',')[1];
          try {
            const r = await api('/api/upload', { filename: file.name, dataBase64 });
            if (r && r.url) {
              photoArea.dataset.url = r.url;
              photoArea.innerHTML = `<img src="${r.url}" class="client-photo-thumb" alt="תמונה">
                <button type="button" class="client-photo-remove" title="הסר תמונה">✕</button>`;
              bindPhotoRemove(photoArea);
              toast('✓ תמונה הועלתה');
            }
          } catch (err) { toast('שגיאה בהעלאת תמונה', false); }
        };
        reader.readAsDataURL(file);
      });
      bindPhotoRemove(photoArea);
    }
  }

  card.querySelector('.ct-save').addEventListener('click', async () => {
    const data = collectForm(card);
    // הוסף photo_url מה-data attribute
    const photoArea = card.querySelector('.client-photo-area');
    if (photoArea) {
      const url = photoArea.dataset.url;
      if (url) data.photo_url = url; else delete data.photo_url;
    }
    if (id && id !== 'new') {
      await api(apiBase + '/update', { ...data, id });
      toast('✓ עודכן');
    } else {
      if (!Object.keys(data).length) { toast('מלא לפחות שדה אחד', false); return; }
      await api(apiBase + '/add', data);
      toast('✓ נוסף');
    }
    loadState();
  });
  const delBtn = card.querySelector('.ct-del');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const label = type === 'event' ? 'האירוע' : 'המטופל';
      if (!confirm(`האם אתה בטוח שברצונך למחוק את ${label} לצמיתות?\n\nפעולה זו לא ניתנת לביטול.\nאם רק רוצה להסתיר — לחץ "📦 העבר לארכיון" במקום.`)) return;
      await api(apiBase + '/delete', { id });
      toast('🗑️ נמחק לצמיתות');
      loadState();
    });
  }
  const archBtn = card.querySelector('.ct-archive');
  if (archBtn) {
    archBtn.addEventListener('click', async () => {
      await api(apiBase + '/update', { id, archived: true });
      toast('📦 הועבר לארכיון');
      loadState();
    });
  }
  const unarchBtn = card.querySelector('.ct-unarchive');
  if (unarchBtn) {
    unarchBtn.addEventListener('click', async () => {
      await api(apiBase + '/update', { id, archived: false });
      toast('↩ הוחזר לפעילים');
      loadState();
    });
  }
  card.querySelector('.ct-cancel').addEventListener('click', () => loadState());

  // Per-contact task checkboxes + add row
  card.querySelectorAll('.ct-task-check').forEach(cb =>
    cb.addEventListener('change', async () => {
      await api('/api/task', { action: 'toggle', id: cb.dataset.taskId });
      toast('✓ משימה הושלמה');
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
      toast('✓ משימה נוספה');
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

// ---------- Capture (שיחה חופשית) ----------
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
  if (!text) { toast('כתוב את השיחה קודם', false); return; }
  const type = document.querySelector('input[name="capture-type"]:checked')?.value || 'client';

  // Parse the text into structured fields using simple regex/heuristics
  const parsed = parseCaptureText(text, type);

  const res = await api('/api/capture/save', { text, type, parsed });
  const resultEl = document.getElementById('capture-result');
  resultEl.classList.remove('hidden');

  if (res.created) {
    resultEl.innerHTML = `<div class="capture-ok">✅ ${type === 'client' ? 'לקוח' : 'אירוע'} נוצר!
      <div class="capture-fields">${formatParsed(parsed)}</div>
      <div class="capture-note muted-text">בדוק בכרטיס הלקוח ועדכן אם צריך ✏️</div>
    </div>`;
    toast(type === 'client' ? '✓ לקוח נוסף מהשיחה' : '✓ אירוע נוסף מהשיחה');
    loadState();
  } else {
    resultEl.innerHTML = `<div class="capture-ok">💾 השיחה נשמרה (carlos/captures/)
      <div class="capture-note muted-text">הפרטים שנמצאו: ${formatParsed(parsed) || 'לא נמצאו פרטים מובנים — הוסף ידנית'}</div>
    </div>`;
    toast('✓ שיחה נשמרה');
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
  const cities = ['תל אביב','ירושלים','חיפה','ראשון לציון','פתח תקווה','אשדוד','באר שבע','נתניה','בני ברק','רמת גן','גבעתיים','הרצליה','חולון','רעננה','כפר סבא','מודיעין','אשקלון','רחובות','בת ים','לוד'];
  const cityMatch = cities.find(c => text.includes(c));
  if (cityMatch) p.city = cityMatch;
  // Date patterns: DD/MM, יום X
  const hebrewDate = text.match(/יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
  if (hebrewDate && type === 'event') p.date = hebrewDate[0];
  // Name: first Hebrew word-pair that follows common intros
  const nameMatch = text.match(/(?:עם|של|לקוח(?:ה)?|ל-?)\s+([א-ת]{2,}\s+[א-ת]{2,})/);
  if (nameMatch) {
    if (type === 'client') p.name = nameMatch[1];
    else p.contact = nameMatch[1];
  } else {
    // Single Hebrew name after common words
    const singleName = text.match(/(?:עם|לקוח(?:ה)?|ל-?)\s+([א-ת]{2,8})/);
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
  const labels = { name:'שם', contact:'איש קשר', phone:'טלפון', email:'מייל', city:'עיר', date:'תאריך', notes:'' };
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
    photoArea.innerHTML = `<div class="client-photo-empty">👤</div>`;
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
  window.open('https://calendar.google.com/calendar/r/agenda', '_blank');
});

// ---------- Habits history — last 7 days grid ----------
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
    <th class="hh-sum">סה"כ</th>
  </tr>`;

  const bodyRows = habits.habits.map(h => {
    const cells = days.map(d => {
      const done = (completions[d.key] || []).includes(h.id);
      const cls = d.isToday ? 'hh-dot-today' : (done ? 'hh-dot-done' : 'hh-dot-miss');
      return `<td class="hh-dot ${cls}"><span>${done ? '✓' : '·'}</span></td>`;
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

// ---------- Sidebar — Focus (editable) ----------
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
          <span class="sbf-emoji">${it.emoji || '•'}</span>
          <span class="sbf-text">${it.text || ''}</span>
          <button class="sbf-edit-btn" data-idx="${i}" title="ערוך">✏️</button>
          <button class="sbf-del-btn"  data-idx="${i}" title="הסר">✕</button>
        </div>`).join('')
    : '<div class="muted-text" style="font-size:.88rem;padding:6px 0">לא הוגדר פוקוס להיום</div>';

  body.innerHTML = itemsHtml + `<button class="sbf-add-btn">+ הוסף פוקוס</button>`;

  body.querySelectorAll('.sbf-edit-btn').forEach(btn =>
    btn.addEventListener('click', () => openSbFocusForm(items, parseInt(btn.dataset.idx))));
  body.querySelectorAll('.sbf-del-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const updated = items.filter((_, i) => i !== idx);
      await api('/api/focus/update', { focus_today: updated });
      toast('✓ הוסר');
      loadState();
    }));
  body.querySelector('.sbf-add-btn').addEventListener('click', () => openSbFocusForm(items, -1));
}

function openSbFocusForm(items, idx) {
  const body = document.getElementById('sb-focus-body');
  if (!body) return;
  const it = idx >= 0 ? items[idx] : { emoji: '🎯', text: '' };

  // Remove existing form if open
  body.querySelector('.sbf-form')?.remove();

  const form = document.createElement('div');
  form.className = 'sbf-form';
  form.innerHTML = `
    <input type="text" id="sbf-text" value="${(it.text || '').replace(/"/g,'&quot;')}" placeholder="פוקוס להיום..." style="width:100%;box-sizing:border-box;direction:rtl;text-align:right">
    <div class="sbf-form-btns">
      <button id="sbf-save">💾 שמור</button>
      <button id="sbf-cancel" class="sbf-cancel">ביטול</button>
    </div>`;
  body.appendChild(form);
  form.querySelector('#sbf-text').focus();

  form.querySelector('#sbf-cancel').addEventListener('click', () => loadState());
  const doSave = async () => {
    const emoji = (idx >= 0 && items[idx] ? items[idx].emoji : null) || '🎯';
    const text  = form.querySelector('#sbf-text').value.trim();
    if (!text) { toast('כתוב טקסט', false); return; }
    const updated = [...items];
    if (idx >= 0) updated[idx] = { emoji, text };
    else updated.push({ emoji, text });
    await api('/api/focus/update', { focus_today: updated });
    toast('✓ פוקוס עודכן');
    loadState();
  };
  form.querySelector('#sbf-save').addEventListener('click', doSave);
  form.querySelector('#sbf-text').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') loadState();
  });
}

// ---------- Sidebar — Calendar ----------
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
          title: `📅 ${a.patient_name}${a.service ? ' · ' + a.service : ''}`,
          location: '',
          _isBooking: true
        }))
    : [];

  const allEvents = [...effectiveCalEvents, ...bookingAppts]
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  if (!allEvents.length) {
    el.innerHTML = `<div class="cal-empty">אין אירועים או היומן לא עודכן עדיין</div>
      <div class="cal-stale">💡 שאל את קרלוס "מה יש לי ביומן היום" כדי לעדכן</div>`;
    return;
  }

  const isStale = cal && cal.date !== todayKey && effectiveCalEvents.length === calEvents.length;
  const eventsHtml = allEvents.map(ev => `
    <div class="cal-event${ev._isBooking ? ' cal-event-booking' : ''}">
      <span class="cal-time">${ev.time || ''}${ev.end_time ? '–' + ev.end_time : ''}</span>
      <div>
        <div class="cal-title">${ev.title || ''}</div>
        ${ev.location ? `<div class="cal-loc">📍 ${ev.location}</div>` : ''}
      </div>
    </div>`).join('');

  el.innerHTML = eventsHtml + (isStale
    ? `<div class="cal-stale">⚠️ יומן Google מ-${cal.date || 'תאריך לא ידוע'}</div>` : '');
}

// ---------- Section collapse (all collapsible sections) ----------
function initSectionToggles() {
  document.querySelectorAll('.card.collapsible').forEach(section => {
    const tgl = section.querySelector('.section-toggle');
    const body = section.querySelector('.section-body');
    if (!tgl || !body) return;
    const id = section.id || '';
    const stored = id ? localStorage.getItem('carlos-sec-' + id) : null;
    if (stored === '1') { body.style.display = 'none'; tgl.textContent = '▸'; }
    tgl.addEventListener('click', () => {
      const isCollapsed = body.style.display === 'none';
      body.style.display = isCollapsed ? '' : 'none';
      tgl.textContent = isCollapsed ? '▾' : '▸';
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
    collapseAllBtn.textContent = anyExpanded ? '⊟' : '⊞';
    collapseAllBtn.title = anyExpanded ? 'כווץ את כל החלונות' : 'הרחב את כל החלונות';
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
      tgl.textContent    = anyExpanded ? '▸' : '▾';
      if (section.id) localStorage.setItem('carlos-sec-' + section.id, anyExpanded ? '1' : '0');
    });
    updateIcon();
  });
  updateIcon(); // set correct icon on load
})();

// ---------- Booking section: open Google Calendar ----------
document.getElementById('booking-cal-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.open('https://calendar.google.com/calendar/r/agenda', '_blank');
});

// ---------- Ask Carlos (sidebar chat) ----------
(function () {
  const input = document.getElementById('ask-input');
  const btn   = document.getElementById('ask-btn');
  const resp  = document.getElementById('ask-response');
  if (!input || !btn || !resp) return;

  async function doAsk() {
    const text = input.value.trim();
    if (!text) { toast('כתוב שאלה קודם', false); return; }
    input.disabled = true;
    btn.disabled   = true;
    btn.textContent = '⏳ קרלוס חושב...';
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
      resp.textContent = 'שגיאה בחיבור לקרלוס';
      resp.classList.remove('hidden');
    } finally {
      input.disabled = false;
      btn.disabled   = false;
      btn.textContent = '▶ שלח';
      input.value = '';
    }
  }

  btn.addEventListener('click', doAsk);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); }
  });
})();

// ---------- Playbook viewer ----------
const PB_DEFAULTS = {
  'treatments': `# 💆 מדריך תחום הטיפולים

## אסטרטגיית שיווק
- פרסם עדות של מטופל (עם אישורו) פעם בשבוע
- צור תוכן חינוכי: "5 סימנים שכדאי לפנות לעזרה"
- הצע שיחת היכרות חינם של 20 דקות

## צ'קליסט שבועי
- פוסט אחד ברשתות חברתיות
- מענה לכל הפניות תוך 24 שעות
- עדכון לוח זמנים לשבוע הבא

## רעיונות לתוכן
- "מה קורה בפגישה הראשונה?"
- "איך בוחרים מטפל מתאים?"
- שאלות נפוצות שמטופלים שואלים`,

  'music': `# 🎵 מדריך תחום המוזיקה

## אסטרטגיית שיווק
- שתף קטעי מוזיקה מאירועים (Reels / Stories)
- בנה נוכחות ב-SoundCloud / Mixcloud
- קשר עם מארגני אירועים ואולמות

## צ'קליסט שבועי
- הוסף לפחות Mix אחד חדש לפרופיל
- תגיב על פוסטים של DJים אחרים
- בדוק הזדמנויות אירועים

## רעיונות לתוכן
- Behind the scenes מהכנות לאירוע
- "הטכניקה שאני משתמש בה ל..."
- Playlist המלצות לסגנונות שונים`,

  'product': `# 🚀 מדריך תחום הכלים / המוצר

## אסטרטגיית שיווק
- הצג Use Cases אמיתיים מלקוחות
- בנה רשימת המתנה לפני השקה
- הצע גרסת ניסיון / Demo

## צ'קליסט שבועי
- עדכון Feature אחד קטן
- מענה לפידבקים מלקוחות
- פוסט עם Tip שימוש במוצר

## רעיונות לתוכן
- "מה פתרנו ב-Version זה"
- השוואה לפני/אחרי השימוש
- שאלות נפוצות על המוצר`,

  'default': `# 📖 מדריך לתחום זה

## אסטרטגיה
- הגדר את קהל היעד שלך
- בנה נוכחות עקבית ברשת
- שים דגש על ערך אמיתי ללקוח

## צ'קליסט שבועי
- פוסט אחד לפחות ברשתות
- מעקב אחרי הזדמנויות חדשות
- עדכון מטרות ויעדים

## הערות אישיות
ערוך מדריך זה לפי הצרכים שלך.`
};

function _pbDefault(domainId) {
  return PB_DEFAULTS[domainId] || PB_DEFAULTS['default'];
}

function renderPlaybookSidebar(domains, playbooks) {
  const container = document.getElementById('sb-pb-btns');
  if (!container) return;
  const domList = domains && domains.length ? domains : [
    { id: 'treatments', emoji: '💆', label: 'טיפולים' },
    { id: 'music',      emoji: '🎵', label: 'מוזיקה' },
    { id: 'product',    emoji: '🚀', label: 'כלי' },
    { id: 'unassigned', emoji: '📌', label: 'כללי' }
  ];
  container.innerHTML = domList.map(d =>
    `<button class="pb-btn" data-domain="${_esc(d.id)}">${_esc(d.emoji)} ${_esc(d.label)}</button>`
  ).join('');
  container.querySelectorAll('.pb-btn').forEach(btn =>
    btn.addEventListener('click', () => openPlaybook(btn.dataset.domain, domList, playbooks))
  );
}

function openPlaybook(domainId, domains, playbooks) {
  const modal = document.getElementById('playbook-modal');
  const titleEl = document.getElementById('pb-modal-title');
  const bodyEl = document.getElementById('pb-modal-body');
  if (!modal) return;

  const domain = (domains || []).find(d => d.id === domainId) || { id: domainId, emoji: '📖', label: domainId };
  const saved = (playbooks || []).find(p => p.domain_id === domainId);
  const content = (saved && saved.content) ? saved.content : _pbDefault(domainId);

  titleEl.textContent = `${domain.emoji} ${domain.label}`;
  _renderPbView(bodyEl, content);
  modal.classList.remove('hidden');
}

function _renderPbView(bodyEl, content) {
  bodyEl.innerHTML = `
    <div id="pb-view-content">${mdToHtml(content)}</div>
    <div style="margin-top:14px;text-align:left">
      <span class="muted-text" style="font-size:.78rem">לעריכה — פתח ⚙️ הגדרות ← פלייבוקים</span>
    </div>`;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let listTag = '';
  const closeList = () => { if (listTag) { html += `</${listTag}>`; listTag = ''; } };
  for (const raw of lines) {
    const safe = _esc(raw);
    const line = safe
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^# /.test(raw))       { closeList(); html += `<h3 class="pb-h1">${line.slice(2)}</h3>`; }
    else if (/^## /.test(raw)) { closeList(); html += `<h4 class="pb-h2">${line.slice(3)}</h4>`; }
    else if (/^### /.test(raw)){ closeList(); html += `<h5 class="pb-h3">${line.slice(4)}</h5>`; }
    else if (/^> /.test(raw))  { closeList(); html += `<blockquote class="pb-quote">${line.slice(2)}</blockquote>`; }
    else if (/^[-*] /.test(raw)){ if (listTag !== 'ul') { closeList(); html += '<ul class="pb-list">'; listTag = 'ul'; } html += `<li>${line.slice(2)}</li>`; }
    else if (/^\d+\. /.test(raw)){ if (listTag !== 'ol') { closeList(); html += '<ol class="pb-list">'; listTag = 'ol'; } html += `<li>${line.replace(/^\d+\. /, '')}</li>`; }
    else if (raw.trim() === '')  { closeList(); html += '<div class="pb-gap"></div>'; }
    else                         { closeList(); html += `<div class="pb-line">${line}</div>`; }
  }
  closeList();
  return html;
}

document.getElementById('pb-modal-close')?.addEventListener('click', () =>
  document.getElementById('playbook-modal').classList.add('hidden'));

document.getElementById('playbook-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('playbook-modal'))
    document.getElementById('playbook-modal').classList.add('hidden');
});

// Floating chat bubble removed — use sidebar "שאל קרלוס" panel instead

// ---------- Help Modal ----------
const _hStep = (n, txt) => `<span class="hs-step"><span class="hs-step-n">${n}</span>${txt}</span>`;
const _hTip  = txt => `<div class="hs-tip">💡 ${txt}</div>`;
const _hWarn = txt => `<div class="hs-warn">⚠️ ${txt}</div>`;
const _hInfo = txt => `<div class="hs-info">ℹ️ ${txt}</div>`;
const _hFlow = steps => `<div class="hs-flow">${steps.map(s=>`<span class="hs-flow-step">${s}</span>`).join('<span class="hs-flow-arr">←</span>')}</div>`;
const _hZone = (icon, label, color) => `<div class="hs-zone" style="border-color:${color}"><span>${icon}</span><strong>${label}</strong></div>`;

const HELP_SECTIONS = [
  { icon: '🗺️', title: 'מפת הדאשבורד — איפה כל דבר?', body: `
<div class="hs-map">
  <div class="hs-map-row">
    <div class="hs-map-cell hs-map-top" style="flex:1">🌅 בריפינג בוקר</div>
    <div class="hs-map-cell hs-map-top" style="flex:1">📌 משימות היום</div>
    <div class="hs-map-cell hs-map-top" style="flex:1">⏳ פתוחים מהעבר</div>
  </div>
  <div class="hs-map-row" style="margin-top:6px">
    <div style="flex:2;display:flex;flex-direction:column;gap:6px">
      <div class="hs-map-cell hs-map-mid">📊 זמן שנרשם היום</div>
      <div class="hs-map-cell hs-map-mid">📲 תוכן שבועי</div>
      <div class="hs-map-cell hs-map-mid">👥 לקוחות ואירועים</div>
      <div class="hs-map-cell hs-map-mid">🌱 הרגלים</div>
    </div>
    <div style="flex:1;margin-right:6px;display:flex;flex-direction:column;gap:6px">
      <div class="hs-map-cell hs-map-side">🎯 פוקוס היום</div>
      <div class="hs-map-cell hs-map-side">📅 יומן היום</div>
      <div class="hs-map-cell hs-map-side">📖 פלייבוקים</div>
      <div class="hs-map-cell hs-map-side">💬 שאל קרלוס</div>
    </div>
  </div>
  <div class="hs-map-note">⏱️ טיימר — פינה שמאלית למטה &nbsp;|&nbsp; ⚙️ הגדרות — פינה ימנית למעלה</div>
</div>
<br>
<div class="hs-cards-3">
  ${_hZone('🔝','קטעים עליונים','#6c8cff')}
  ${_hZone('◀️','סיידבר שמאלי','#44cc88')}
  ${_hZone('🔽','קטעים תחתונים','#ff9944')}
</div>
${_hTip('כל כותרת של קטע ניתנת ללחיצה — לחץ עליה כדי לכווץ או להרחיב אותו')}` },

  { icon: '⤢', title: 'תצוגה מורחבת — פתח קטע כמסך מלא', body: `
<div class="hs-cards-2" style="margin-bottom:14px">
  <div class="hs-card2">
    <div class="hs-c2-title">🖥️ למה להשתמש?</div>
    <div class="hs-c2-body">כשיש הרבה תוכן בקטע אחד — הרחב אותו כדי לראות ולנהל הכל בנוחות, בלי לגלול את שאר הדף</div>
  </div>
  <div class="hs-card2">
    <div class="hs-c2-title">📱 בנייד</div>
    <div class="hs-c2-body">המסך המורחב תופס את כל המסך — חווית שימוש נוחה בדיוק כמו אפליקציה</div>
  </div>
</div>
<div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:.88rem">
  <div style="display:flex;align-items:center;gap:10px;color:var(--text2)">
    <span style="font-size:1.3rem;background:var(--sep2);border-radius:7px;padding:3px 9px">⤢</span>
    <span>הכפתור הזה מופיע בפינת כותרת של <strong>4 קטעים</strong>: משימות, תוכן שבועי, לקוחות ויומן אישי</span>
  </div>
</div>
${_hStep('1','לחץ על <strong>⤢</strong> בפינת הכותרת של הקטע — הוא ייפתח כמסך מלא')}
${_hStep('2','כל הפעולות עובדות בדיוק אותו הדבר — הוספה, עריכה, מחיקה, סימון')}
${_hStep('3','לסגירה: לחץ <strong>✕</strong> בפינת הכותרת, לחץ <strong>ESC</strong> במקלדת, או לחץ על הרקע האפור')}
${_hTip('השינויים נשמרים מיד — אין צורך "לשמור לפני סגירה"')}` },

  { icon: '🔐', title: 'פרטיות ואבטחה — חשוב!', body: `
<div class="hs-privacy-hero">
  <div class="hs-privacy-title">🛡️ המידע שלך שייך לך בלבד</div>
  <div class="hs-privacy-sub">לא מועבר שום מידע לאף גורם שלישי, בשום שלב</div>
</div>
<div class="hs-privacy-grid">
  <div class="hs-privacy-card">
    <div class="hs-pc-icon">📧</div>
    <div class="hs-pc-title">חיבור Gmail</div>
    <div class="hs-pc-body">תכני המיילים נשארים אצל Google. הדאשבורד מציג <strong>סיכום בלבד</strong> — ללא שמירה בשרת</div>
  </div>
  <div class="hs-privacy-card">
    <div class="hs-pc-icon">📅</div>
    <div class="hs-pc-title">Google Calendar</div>
    <div class="hs-pc-body">האירועים נשארים ביומן שלך. הדאשבורד קורא אותם לתצוגה בלבד</div>
  </div>
  <div class="hs-privacy-card">
    <div class="hs-pc-icon">🗄️</div>
    <div class="hs-pc-title">נתוני הדאשבורד</div>
    <div class="hs-pc-body">משימות, לקוחות, הרגלים — נשמרים <strong>בחשבון Supabase האישי שלך</strong> בלבד</div>
  </div>
  <div class="hs-privacy-card">
    <div class="hs-pc-icon">🔑</div>
    <div class="hs-pc-title">סיסמאות</div>
    <div class="hs-pc-body">אנחנו לא רואים ולא שומרים סיסמאות. הכניסה מאובטחת דרך OAuth של Google</div>
  </div>
</div>
${_hInfo('כל גישה לנתונים מחייבת את הכניסה האישית שלך לחשבון — ללא יוצא מן הכלל')}` },

  { icon: '📌', title: 'משימות — ניהול היום שלך', body: `
<div class="hs-task-demo">
  <div class="hs-task-row"><span class="hs-task-dot open">○</span><span>שליחת הצעת מחיר ללקוח</span><span class="hs-task-edit">✏️</span></div>
  <div class="hs-task-row hs-task-overdue"><span class="hs-task-dot open">○</span><span>⚠️ שיחת טלפון — עבר תאריך</span><span class="hs-task-edit">✏️</span></div>
  <div class="hs-task-row hs-task-done"><span class="hs-task-dot done">✓</span><span style="text-decoration:line-through;opacity:.5">קניית ציוד</span></div>
</div>
<br>
${_hStep('1','כתוב את שם המשימה בשדה למעלה')}
${_hStep('2','בחר <strong>תאריך</strong> יעד (אופציונלי)')}
${_hStep('3','בחר <strong>שעה</strong> — תקבל צלצול + popup בדיוק בשעה זו (ראה: ⏰ תזכורות)')}
${_hStep('4','לחץ "הוסף" — המשימה מופיעה ברשימה')}
<br>
<div class="hs-legend">
  <span><span class="hs-badge" style="background:#6c8cff22;color:#6c8cff">○ ממתינה</span></span>
  <span><span class="hs-badge" style="background:#ff444422;color:#ff6666">⚠️ פג תאריך</span></span>
  <span><span class="hs-badge" style="background:#44cc8822;color:#44cc88">✓ הושלמה</span></span>
</div>
${_hTip('לחץ ○ כדי להשלים משימה. לחץ ✏️ לעריכה, שינוי תאריך, הוספת הערות, או מחיקה')}
${_hWarn('משימות עם תאריך שעבר מסומנות באדום — לטפל בהן בהקדם!')}` },

  { icon: '⏰', title: 'תזכורות — התראה בשעה שקבעת', body: `
<div class="hs-task-demo" style="margin-bottom:12px">
  <div class="hs-task-row"><span class="hs-task-dot open">○</span><span>שיחת לקוח</span><span class="hs-badge" style="background:#6c8cff22;color:#6c8cff;font-size:.75rem">📅 היום 14:30</span></div>
</div>
${_hFlow(['🔔 popup + צלצול','14:30 מגיע','שמור','בחר שעה 14:30','הוסף משימה'])}
<br>
<strong>איך מגדירים תזכורת:</strong>
${_hStep('1','הוסף משימה → מלא <strong>תאריך</strong> + <strong>שעה</strong> (שני השדות)')}
${_hStep('2','לחץ "הוסף" — toast קצר "🔔 תזכורת נקבעה ל-XX:XX" מאשר שנקבעה')}
${_hStep('3','בשעה שקבעת: צלצול + popup "⏰ שם המשימה" קופץ על המסך')}
<br>
<div class="hs-cards-2">
  <div class="hs-card2"><div class="hs-c2-title">✅ הבנתי</div><div class="hs-c2-body">סוגר את הpopup — התזכורת נחשבת כטופלה</div></div>
  <div class="hs-card2"><div class="hs-c2-title">😴 10 דקות</div><div class="hs-c2-body">Snooze — popup יחזור שוב בעוד 10 דקות</div></div>
</div>
${_hTip('הצלצול נשמע גם כשאתה על טאב אחר בדפדפן — לא תפספס!')}
${_hInfo('הדף חייב להישאר פתוח בדפדפן (גם ממוזער) כדי שהתזכורת תפעל')}` },

  { icon: '👥', title: 'לקוחות ואירועים', body: `
<div class="hs-tabs-demo">
  <span class="hs-tab active">💆 לקוחות</span>
  <span class="hs-tab">🎵 אירועים</span>
</div>
<div class="hs-client-cards">
  <div class="hs-client-card"><div>👤</div><strong>ישראל י.</strong><div class="hs-cc-sub">תל אביב · 050-xxx</div></div>
  <div class="hs-client-card"><div>👤</div><strong>שרה כ.</strong><div class="hs-cc-sub">חיפה · 052-xxx</div></div>
  <div class="hs-client-card hs-client-add">＋<div style="font-size:.75rem;margin-top:4px">הוסף</div></div>
</div>
<br>
${_hStep('1','לחץ "+ הוסף ידנית" ← מלא שם, עיר, טלפון, מייל')}
${_hStep('2','לחץ 📷 בכרטיס הלקוח כדי להעלות תמונת פרופיל')}
${_hStep('3','לחץ "🗣️ לכידת שיחה" ← כתוב בחופשיות מה דיברתם — הפרטים ייחלצו אוטומטית')}
${_hStep('4','בכל כרטיס: "📋 משימות" ← רשימת משימות ספציפית ללקוח זה')}
${_hTip('חיפוש 🔍 מסנן לפי שם, טלפון, או עיר בזמן אמת')}
<div class="hs-editable-note">
  <span class="hs-editable-badge">✏️ ניתן לעריכה</span>
  שם הסקשן ושמות הטאבים ניתנים לשינוי מלא לפי המקצוע שלך<br>
  <span style="font-size:.78rem">⚙️ הגדרות ← "👥 כותרות אנשי קשר"</span>
</div>` },

  { icon: '🌱', title: 'הרגלים — מעקב יומי', body: `
<div class="hs-habits-table">
  <div class="hs-ht-head"><span>הרגל</span><span>היום</span><span>שבוע</span><span>🔥 רצף</span></div>
  <div class="hs-ht-row"><span>💊 תרופות</span><span class="hs-ht-done">✓</span><span>6/7</span><span>12 ימים</span></div>
  <div class="hs-ht-row"><span>🏃 ספורט</span><span class="hs-ht-open">○</span><span>4/7</span><span>3 ימים</span></div>
  <div class="hs-ht-row"><span>📚 קריאה</span><span class="hs-ht-done">✓</span><span>7/7 🌟</span><span>28 ימים</span></div>
</div>
<br>
<div class="hs-info-box">לחץ <strong>○</strong> כדי לסמן הרגל כהושלם היום · לחץ שוב לביטול</div>
<br>
<strong>הוספת הרגל חדש:</strong>
${_hStep('1','פתח ⚙️ הגדרות')}
${_hStep('2','גלול לקטע "הרגלים"')}
${_hStep('3','בחר אמוג\'י ← כתוב שם ← לחץ "+ הוסף"')}
${_hTip('🌟 = שבוע מושלם! 🔥 = מספר הימים ברצף ללא הפסקה')}` },

  { icon: '⏱️', title: 'טיימר — מדידת זמן עבודה', body: `
<div class="hs-timer-demo">
  <div class="hs-timer-display">00:23:47</div>
  <div class="hs-timer-btns">
    <span class="hs-tbtn red">■ עצור</span>
    <span class="hs-tbtn">💾 שמור</span>
    <span class="hs-tbtn">➕ ידני</span>
  </div>
  <div style="font-size:.75rem;color:var(--text-muted);margin-top:6px">📍 פינה שמאלית תחתונה · לחץ ∨ למיזעור</div>
</div>
<br>
${_hFlow(['💾 שמור','בחר תחום','■ עצור','עבוד','▶ התחל'])}
<br>
<div class="hs-cards-2">
  <div class="hs-card2"><div class="hs-c2-title">⏱ סטופר</div><div class="hs-c2-body">מודד זמן שהפעלת — מתחיל ועוצר לפי הצורך</div></div>
  <div class="hs-card2"><div class="hs-c2-title">⏲ טיימר</div><div class="hs-c2-body">ספירה לאחור — צלצול כשנגמר הזמן</div></div>
</div>
${_hTip('➕ ידני — הכנס דקות שעבדת בלי שהטיימר רץ, והן יתווספו לסיכום היומי')}` },

  { icon: '📲', title: 'תוכן שבועי — פוסטים ורילסים', body: `
${_hFlow(['✅ פורסם','🟢 מוכן','✏️ טיוטה','💡 רעיון'])}
<div style="font-size:.8rem;color:var(--text-muted);margin:-6px 0 10px;text-align:center">לחץ על הסטטוס כדי להתקדם שלב</div>
<br>
${_hStep('1','לחץ "+ הוסף תוכן" ← תן כותרת + בחר סוג + בחר תחום')}
${_hStep('2','סמן <strong>פלטפורמות</strong> — לאיזו רשת זה מיועד? (📸 Instagram / 🎵 TikTok / 👥 Facebook...)')}
${_hStep('3','לחץ ✏️ לעריכה: תוכן, קישור Docs, קובץ מדיה, תאריך')}
${_hStep('4','כשהפוסט עלה — לחץ עד שמגיע ל"פורסם" ← המכסה מתעדכנת אוטומטית')}
<div class="hs-editable-note">
  <span class="hs-editable-badge">📱 פלטפורמות</span>
  כל פריט תוכן מציג תגיות צבעוניות לפי הרשתות שנבחרו — כך ניתן לראות בבת אחת מה מיועד לאיפה.<br>
  <span style="font-size:.78rem">⚙️ הגדרות ← "📱 פלטפורמות פרסום" — הפעל / כבה כל פלטפורמה לפי מה שרלוונטי אליך</span>
</div>
<div class="hs-editable-note">
  <span class="hs-editable-badge">✏️ ניתן לעריכה</span>
  <strong>סוגי התוכן</strong> (רילס / פוסט / וכו') <strong>והתחומים</strong> — ניתנים לשינוי מלא בהגדרות.<br>
  <span style="font-size:.78rem">⚙️ הגדרות ← "📲 סוגי תוכן" — הוסף סוג חדש, שנה שם ואמוג'י, מחק</span>
</div>
${_hTip('הסטטיסטיקות מתעדכנות בזמן אמת לפי מה שסימנת כ"פורסם"')}` },

  { icon: '📊', title: 'מכסות — יעדים שבועיים ויומיים', body: `
<div class="hs-quota-demo">
  <div class="hs-quota-row"><span>🎬 רילסים</span><div class="hs-qbar"><div class="hs-qfill" style="width:60%"></div></div><span class="hs-qlabel">3/5</span></div>
  <div class="hs-quota-row"><span>📝 פוסטים</span><div class="hs-qbar"><div class="hs-qfill" style="width:100%;background:#44cc88"></div></div><span class="hs-qlabel">3/3 ✓</span></div>
  <div class="hs-quota-row"><span>⏱️ שעות</span><div class="hs-qbar"><div class="hs-qfill" style="width:30%;background:#ff9944"></div></div><span class="hs-qlabel">6/20</span></div>
</div>
<br>
<div class="hs-cards-2">
  <div class="hs-card2"><div class="hs-c2-title">📈 שבועי</div><div class="hs-c2-body">יעדים לשבוע כולו · מתאפסים כל יום ראשון</div></div>
  <div class="hs-card2"><div class="hs-c2-title">📊 יומי</div><div class="hs-c2-body">יעדים ליום הנוכחי · מתאפסים כל בוקר</div></div>
</div>
${_hTip('לחץ ✏️ ליד כל שורה כדי לשנות את מספר היעד')}` },

  { icon: '📖', title: 'פלייבוקים — מדריכי תחום אישיים', body: `
<div class="hs-cards-2">
  <div class="hs-card2">
    <div class="hs-c2-title">📋 מה זה?</div>
    <div class="hs-c2-body">מדריך אסטרטגי שאתה כותב לעצמך לכל תחום עסקי — שיווק, צ'קליסטים, רעיונות</div>
  </div>
  <div class="hs-card2">
    <div class="hs-c2-title">🔒 פרטי לך</div>
    <div class="hs-c2-body">כל משתמש רואה ועורך רק את הפלייבוקים שלו — ללא שיתוף בין משתמשים</div>
  </div>
</div>
<br>
${_hStep('1','לחץ על כפתור תחום בסיידבר השמאלי (💆 / 🎵 / 🚀) לקריאת המדריך')}
${_hStep('2','לעריכת תוכן: ⚙️ הגדרות ← "פלייבוקים" ← ערוך textarea ← 💾 שמור מדריך')}
${_hStep('3','לשינוי שמות התחומים: ⚙️ הגדרות ← לחץ על האמוג\'י לבחירה ← ערוך שם ← 💾 שמור תחומים')}
${_hTip('ניתן להוסיף תחומים חדשים לגמרי בהתאם לעסק שלך')}` },

  { icon: '🌅', title: 'בריפינג בוקר', body: `
<div class="hs-briefing-demo">
  <div class="hs-bd-header">🌅 בריפינג — ראשון, 21 יוני</div>
  <div class="hs-bd-section"><span class="hs-bd-label">📅 יומן</span><span>10:00 פגישת לקוח · 14:00 שיחת מכירה</span></div>
  <div class="hs-bd-section hs-bd-urgent"><span class="hs-bd-label">⚠️ דחוף</span><span>שלח הצעת מחיר (14 ימים!)</span></div>
  <div class="hs-bd-section"><span class="hs-bd-label">🎯 פוקוס</span><span>סגור עסקת האירוע של שבת</span></div>
</div>
<br>
הבריפינג מסכם את כל מה שחשוב ליום שלך — מה יש ביומן, מה דחוף, ומה כדאי להתמקד בו.
<br><br>
${_hTip('לחץ "🔄 עדכן" בכותרת הקטע כדי לרענן את הבריפינג')}` },

  { icon: '📧', title: 'מייל ויומן Google', body: `
<div class="hs-connect-flow">
  <div class="hs-cf-box hs-cf-google">📧 Gmail שלך<br><small>נשאר אצל Google</small></div>
  <div class="hs-cf-arrow">🔒 OAuth<br>מאובטח</div>
  <div class="hs-cf-box hs-cf-dash">📋 סיכום בלבד<br><small>בדאשבורד שלך</small></div>
</div>
<br>
<div class="hs-privacy-notice">
  ✅ <strong>תכני המיילים לא נשמרים בשום שרת</strong><br>
  ✅ <strong>אירועי היומן נשארים בחשבון Google שלך בלבד</strong><br>
  ✅ <strong>לא מועבר מידע לאף גורם שלישי</strong>
</div>
<br>
${_hStep('1','פתח ⚙️ הגדרות ← לחץ על "חיבורים"')}
${_hStep('2','לחץ "חבר Gmail" או "חבר Google Calendar"')}
${_hStep('3','היכנס לחשבון Google שלך — ואנחנו לא רואים את הסיסמה')}
${_hTip('אפשר לנתק את החיבור בכל עת מאותו מסך הגדרות')}` },

  { icon: '📅', title: 'יומן — אירועי היום', body: `
<div class="hs-calendar-demo">
  <div class="hs-cal-row hs-cal-past"><span class="hs-cal-time">09:00</span><span>פגישת לקוח — ישראל י.</span></div>
  <div class="hs-cal-row hs-cal-now"><span class="hs-cal-time">עכשיו ▶</span><span></span></div>
  <div class="hs-cal-row"><span class="hs-cal-time">15:00</span><span>שיחת ייעוץ</span></div>
  <div class="hs-cal-row"><span class="hs-cal-time">19:00</span><span>אירוע DJ — תל אביב</span></div>
</div>
<br>
${_hInfo('הסיידבר השמאלי מציג את אירועי היום — לחץ 🔄 לרענון מ-Google Calendar')}
${_hTip('אם Google Calendar לא מחובר — אפשר להזין אירועים ידנית דרך קרלוס')}` },

  { icon: '📝', title: 'יומן אישי — מחשבות ורעיונות', body: `
<div class="hs-journal-demo">
  <div class="hs-jd-prev">
    <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:4px;font-weight:600">📝 היום</div>
    <div class="hs-jd-prev-line hs-jd-ts">[09:14] פגישה טובה עם דני — פוטנציאל גבוה</div>
    <div class="hs-jd-prev-line hs-jd-ts">[15:30] צריך לזכור לשלוח הצעת מחיר</div>
  </div>
  <textarea class="hs-jd-textarea" disabled placeholder="הוסף רשומה..."></textarea>
  <div class="hs-jd-actions">
    <span class="hs-jd-btn">💾 שמור ליומן</span>
    <span class="hs-jd-hist">📖 ראה יומן</span>
  </div>
</div>
<br>
${_hStep('1','מה שכתבת <strong>היום</strong> מופיע אוטומטית מעל שדה הטקסט עם שעה מדויקת')}
${_hStep('2','כתוב בשדה הטקסט — בחופשיות, בלי פורמט')}
${_hStep('3','לחץ "💾 שמור ליומן" — הרשומה מצטרפת לרשומות היום עם חותמת שעה')}
${_hStep('4','ניתן לשמור <strong>כמה פעמים ביום</strong> — כל שמירה נוספת לאותו היום')}
${_hStep('5','לחץ "📖 ראה יומן" לצפייה בכל הרשומות מאז ומעולם — מסודרות לפי חודשים')}
<br>
<div class="hs-cards-2">
  <div class="hs-card2"><div class="hs-c2-title">📅 ארגון חודשי</div><div class="hs-c2-body">הארכיון מסודר לפי חודשים — לחץ על חודש כדי לפתוח את כל הרשומות שלו</div></div>
  <div class="hs-card2"><div class="hs-c2-title">♾️ ללא הגבלה</div><div class="hs-c2-body">כל הרשומות נשמרות לעד — אפשר לחזור לרשומה מלפני שנה בקלות</div></div>
</div>
${_hTip('מה שכתבת היום מוצג אוטומטית מעל תיבת הטקסט — כדי שתמיד תדע מה כבר רשמת')}` },

  { icon: '💬', title: 'שאל קרלוס — העוזר האישי', body: `
<div class="hs-chat-demo">
  <div class="hs-chat-bubble hs-chat-user">מה הדחוף שלי היום?</div>
  <div class="hs-chat-bubble hs-chat-bot">⚠️ יש 2 משימות שפג תאריכן:<br>• שליחת חשבונית ללקוח A<br>• חידוש רישיון עסק</div>
</div>
<br>
<div class="hs-example-queries">
  <span class="hs-eq">"מה יש לי היום?"</span>
  <span class="hs-eq">"מה הדחוף?"</span>
  <span class="hs-eq">"כמה השלמתי השבוע?"</span>
  <span class="hs-eq">"בדוק מיילים"</span>
  <span class="hs-eq">"תן לי בריפינג"</span>
</div>
${_hInfo('הצ\'אט פועל דרך Claude Code כשהוא מחובר — שאלות בשפה חופשית בעברית')}` },

  { icon: '🔔', title: 'זימונים — קבלת תורים אונליין', body: `
<div class="hs-booking-flow">
  <div class="hs-bf-step"><div class="hs-bf-icon">⚙️</div><div>הגדר זמנים פנויים</div></div>
  <div class="hs-bf-arr">←</div>
  <div class="hs-bf-step"><div class="hs-bf-icon">🔗</div><div>שתף קישור ציבורי</div></div>
  <div class="hs-bf-arr">←</div>
  <div class="hs-bf-step"><div class="hs-bf-icon">👤</div><div>הלקוח בוחר שעה</div></div>
  <div class="hs-bf-arr">←</div>
  <div class="hs-bf-step"><div class="hs-bf-icon">🔔</div><div>קבלת התראה</div></div>
</div>
<br>
${_hStep('1','⚙️ הגדרות ← "פרופיל זימון" ← הגדר שם, כותרת, שירותים')}
${_hStep('2','קטע "📅 זימונים" ← לחץ "+ הוסף זמן" לכל חלון פנוי')}
${_hStep('3','העתק את הקישור הציבורי ושתף עם לקוחות')}
${_hTip('כשמגיע תור חדש — מופיע 🔔 בכותרת הדאשבורד')}
${_hInfo('אחרי הקביעה, הלקוח רואה שני כפתורים: <strong>📅 הוסף ל-Google Calendar</strong> (פותח ישר את האפליקציה) ו-<strong>🍎 Apple / Outlook (.ics)</strong>')}` },

  { icon: '⚙️', title: 'הגדרות — התאמה אישית', body: `
<div class="hs-settings-list">
  <div class="hs-sl-row"><span class="hs-sl-icon">👤</span><div><strong>פרופיל</strong><div class="hs-sl-sub">שנה את שמך ואת שם העוזר</div></div></div>
  <div class="hs-sl-row"><span class="hs-sl-icon">🏃</span><div><strong>הרגלים</strong><div class="hs-sl-sub">הוסף / מחק / שנה הרגלים יומיים</div></div></div>
  <div class="hs-sl-row"><span class="hs-sl-icon">👥</span><div><strong>כותרות אנשי קשר</strong><div class="hs-sl-sub">שנה את שם הסקשן ושמות הטאבים לפי המקצוע שלך — מטפל, מאמן, מוזיקאי, יועץ</div></div></div>
  <div class="hs-sl-row"><span class="hs-sl-icon">📂</span><div><strong>תחומי עבודה</strong><div class="hs-sl-sub">שנה שם, אמוג'י, הוסף או מחק תחומים — מופיעים בתפריט התוכן ובפלייבוקים</div></div></div>
  <div class="hs-sl-row"><span class="hs-sl-icon">📲</span><div><strong>סוגי תוכן</strong><div class="hs-sl-sub">הוסף / מחק / שנה שם של סוגי תוכן (רילס, פוסט, סטורי...)</div></div></div>
  <div class="hs-sl-row"><span class="hs-sl-icon">🔌</span><div><strong>חיבורים</strong><div class="hs-sl-sub">חבר Gmail ו-Google Calendar</div></div></div>
  <div class="hs-sl-row"><span class="hs-sl-icon">📖</span><div><strong>פלייבוקים</strong><div class="hs-sl-sub">מדריך תוכן לכל תחום עבודה — מה לפרסם, איך לתקשר, רעיונות</div></div></div>
  <div class="hs-sl-row"><span class="hs-sl-icon">✏️</span><div><strong>פרופיל זימון</strong><div class="hs-sl-sub">הגדר את דף הזימון הציבורי שלך</div></div></div>
</div>
${_hTip('לחץ ⚙️ בפינה הימנית העליונה כדי לפתוח את ההגדרות')}` },

  { icon: '📄', title: 'ייצוא PDF', body: `
${_hStep('1','לחץ 📄 בכותרת הדאשבורד')}
${_hStep('2','הדפדפן פותח חלון הדפסה — כל הקטעים נפתחים אוטומטית')}
${_hStep('3','בחר "שמור כ-PDF" ← מייצר קובץ מסודר')}
<br>
${_hInfo('סיידבר, טיימר, וכפתורי פעולה לא מופיעים ב-PDF — רק התוכן החשוב')}` },

  { icon: '👑', title: 'ניהול גישה — הכנסת משתמשים לדשבורד', body: `
<div class="hs-flow-diagram">
  <div class="hs-flow-row">
    <div class="hs-flow-box hs-flow-a">🔗 שלח קישור<br><small>invite</small></div>
    <div class="hs-flow-arrow">→</div>
    <div class="hs-flow-box hs-flow-b">📧 מקבל מייל<br><small>מגדיר סיסמה</small></div>
    <div class="hs-flow-arrow">→</div>
    <div class="hs-flow-box hs-flow-c">✅ גישה מיידית<br><small>premium אוטומטי</small></div>
  </div>
  <div class="hs-flow-divider">── או ──</div>
  <div class="hs-flow-row">
    <div class="hs-flow-box hs-flow-d">👤 נרשם לבד<br><small>מהאתר</small></div>
    <div class="hs-flow-arrow">→</div>
    <div class="hs-flow-box hs-flow-e">⏳ ממתין<br><small>free tier</small></div>
    <div class="hs-flow-arrow">→</div>
    <div class="hs-flow-box hs-flow-c">✅ אחרי אישור<br><small>לוחצים "אשר גישה"</small></div>
  </div>
</div>
${_hStep('1','לחץ ⚙️ (פינה ימנית למעלה) ← בחר <strong>ניהול משתמשים</strong>')}
${_hStep('2','<strong>להזמנה:</strong> הזן אימייל ושם ← לחץ "שלח מייל" או "וואטסאפ"')}
${_hStep('3','<strong>לאישור</strong> (נרשם לבד): לחץ ✅ אשר גישה — הופך premium מיד')}
${_hStep('4','<strong>לביטול גישה:</strong> לחץ 🚫 בטל גישה — חוזר לממתין')}
${_hInfo('מוזמנים דרך הפאנל מקבלים גישה אוטומטית — אין צורך לאשר ידנית')}
${_hTip('הפאנל מוצג רק לך (david1.frank@gmail.com) — משתמשים רגילים לא רואים אותו')}` }
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

  const collapsed = new Set();
  let quickMode = false; // true = filter by title only (quick buttons), false = full text search

  function _toggleSection(hid) {
    const section = bodyEl.querySelector(`#${hid}`);
    if (!section) return;
    const bodyDiv = section.querySelector('.help-section-body');
    const toggle  = section.querySelector('.help-toggle');
    if (!bodyDiv) return;
    if (bodyDiv.style.display === 'none') {
      bodyDiv.style.display = 'block';
      toggle.textContent = '▲';
      collapsed.delete(hid);
    } else {
      bodyDiv.style.display = 'none';
      toggle.textContent = '▼';
      collapsed.add(hid);
    }
  }

  function _setAllSections(open) {
    bodyEl.querySelectorAll('.help-section').forEach(sec => {
      const bodyDiv = sec.querySelector('.help-section-body');
      const toggle  = sec.querySelector('.help-toggle');
      if (!bodyDiv) return;
      bodyDiv.style.display = open ? 'block' : 'none';
      toggle.textContent = open ? '▲' : '▼';
      if (open) collapsed.delete(sec.id);
      else       collapsed.add(sec.id);
    });
  }

  function _renderHelp(filter, titleOnly) {
    const q = (filter || '').trim().toLowerCase();
    const sections = q
      ? HELP_SECTIONS.filter(s =>
          titleOnly
            ? s.title.toLowerCase().includes(q)
            : s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
        )
      : HELP_SECTIONS;
    // When filter is active — auto-expand all results
    if (q) sections.forEach((_, i) => collapsed.delete('hs-' + i));

    const wrap = bodyEl.querySelector('#help-sections-wrap');
    wrap.innerHTML = sections.length
      ? sections.map((s, i) => {
          const id = 'hs-' + i;
          const isOpen = !collapsed.has(id);
          const highlight = (q && !titleOnly)
            ? t => t.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>')
            : t => t;
          return `<div class="help-section" id="${id}">
            <button class="help-section-title" data-hid="${id}">
              <span>${s.icon} ${highlight(s.title)}</span>
              <span class="help-toggle" data-hid="${id}">${isOpen ? '▲' : '▼'}</span>
            </button>
            <div class="help-section-body" style="display:${isOpen ? 'block' : 'none'}">${s.body}</div>
          </div>`;
        }).join('')
      : '<div class="muted-text" style="padding:20px;text-align:center">לא נמצאו תוצאות</div>';

    wrap.querySelectorAll('.help-section-title[data-hid]').forEach(btn => {
      btn.addEventListener('click', e => {
        if (e.target.classList.contains('help-toggle')) return; // handled below
        _toggleSection(btn.dataset.hid);
      });
    });
    wrap.querySelectorAll('.help-toggle[data-hid]').forEach(tog => {
      tog.style.cssText += ';cursor:pointer;padding:4px 8px;';
      tog.addEventListener('click', e => { e.stopPropagation(); _toggleSection(tog.dataset.hid); });
    });
  }

  bodyEl.innerHTML = `
    <div style="padding:0 2px 10px">
      <div style="position:relative">
        <input id="help-search" type="text" placeholder="🔍  חפש במדריך..." autocomplete="off"
          style="width:100%;padding:9px 14px 9px 36px;border:1.5px solid #6c8cff55;border-radius:10px;
                 background:var(--input-bg);color:var(--text);font-size:.92rem;box-sizing:border-box;direction:rtl">
        <button id="help-search-clear" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;padding:4px">✕</button>
      </div>
      <div class="help-qb-row">
        <button class="help-quick-btn help-qb-active" data-q="" data-title-only="0">✦ הכל</button>
        <button class="help-quick-btn" data-q="מפת" data-title-only="1">🗺️ מפת הדאשבורד</button>
        <button class="help-quick-btn" data-q="בריפינג" data-title-only="1">🌅 בריפינג</button>
        <button class="help-quick-btn" data-q="משימות" data-title-only="1">📌 משימות</button>
        <button class="help-quick-btn" data-q="לקוחות" data-title-only="1">👥 לקוחות</button>
        <button class="help-quick-btn" data-q="הרגלים" data-title-only="1">🌱 הרגלים</button>
        <button class="help-quick-btn" data-q="טיימר" data-title-only="1">⏱️ טיימר</button>
        <button class="help-quick-btn" data-q="תוכן שבועי" data-title-only="1">📲 תוכן</button>
        <button class="help-quick-btn" data-q="מכסות" data-title-only="1">📊 מכסות</button>
        <button class="help-quick-btn" data-q="פלייבוקים" data-title-only="1">📖 פלייבוקים</button>
        <button class="help-quick-btn" data-q="מייל" data-title-only="1">📧 מייל ויומן</button>
        <button class="help-quick-btn" data-q="אירועי" data-title-only="1">📅 יומן יומי</button>
        <button class="help-quick-btn" data-q="יומן אישי" data-title-only="1">📝 יומן אישי</button>
        <button class="help-quick-btn" data-q="שאל" data-title-only="1">💬 שאל קרלוס</button>
        <button class="help-quick-btn" data-q="זימונים" data-title-only="1">🔔 זימונים</button>
        <button class="help-quick-btn" data-q="פרטיות" data-title-only="1">🔐 פרטיות</button>
        <button class="help-quick-btn" data-q="הגדרות" data-title-only="1">⚙️ הגדרות</button>
      </div>
      <div class="help-ctrl-row">
        <button id="help-expand-all" class="help-ctrl-btn">פתח הכל ▼</button>
        <button id="help-collapse-all" class="help-ctrl-btn">כווץ הכל ▲</button>
      </div>
    </div>
    <div id="help-sections-wrap"></div>`;

  const searchEl = bodyEl.querySelector('#help-search');
  bodyEl.querySelector('#help-search-clear').addEventListener('click', () => {
    searchEl.value = '';
    bodyEl.querySelectorAll('.help-quick-btn').forEach(b => b.classList.remove('help-qb-active'));
    bodyEl.querySelector('[data-q=""]').classList.add('help-qb-active');
    _renderHelp('', false);
  });
  searchEl.addEventListener('input', () => {
    bodyEl.querySelectorAll('.help-quick-btn').forEach(b => b.classList.remove('help-qb-active'));
    _renderHelp(searchEl.value, false);
  });
  bodyEl.querySelectorAll('.help-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bodyEl.querySelectorAll('.help-quick-btn').forEach(b => b.classList.remove('help-qb-active'));
      btn.classList.add('help-qb-active');
      searchEl.value = '';
      _renderHelp(btn.dataset.q, btn.dataset.titleOnly === '1');
    });
  });
  bodyEl.querySelector('#help-expand-all').addEventListener('click',  () => _setAllSections(true));
  bodyEl.querySelector('#help-collapse-all').addEventListener('click', () => _setAllSections(false));

  _renderHelp('', false);
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
  bodyEl.innerHTML = '<div class="muted-text">טוען...</div>';
  try {
    let q = window._supabase
      .from('tasks')
      .select('id, title, category, priority, status, completed_at, due_date, notes')
      .eq('user_id', window._userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });
    if (from) q = q.gte('completed_at', from + 'T00:00:00');
    if (to)   q = q.lte('completed_at', to + 'T23:59:59');
    q = q.limit(500);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    renderHistory(data || []);
  } catch (e) {
    bodyEl.innerHTML = '<div class="muted-text">שגיאה: ' + e.message + '</div>';
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
    bodyEl.innerHTML = `<div class="muted-text" style="padding:20px;text-align:center">${q ? 'לא נמצאו תוצאות לחיפוש' : 'אין משימות שהושלמו בטווח הנבחר'}</div>`;
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
  bodyEl.innerHTML = `<div class="history-summary muted-text">סה"כ ${tasks.length} משימות הושלמו ב-${dates.length} ימים</div>` +
    dates.map(d => `
      <div class="history-day">
        <div class="history-day-title">${heDate(d)} <span class="history-day-count">(${groups[d].length})</span></div>
        ${groups[d].map(t => {
          const catLabels = { general: '📌 כללי', health: '💊 בריאות', marketing: '📢 שיווק', music: '🎵 מוזיקה', learning: '📚 לימוד' };
          const cat = t.category ? `<span class="history-cat">${catLabels[t.category] || t.category}</span>` : '';
          const urg = t.priority === 'urgent' ? `<span class="history-cat history-urgent">⚠️ דחוף</span>` : '';
          const due = t.due_date ? `<span class="history-cat">📅 יעד ${t.due_date.slice(8,10)}/${t.due_date.slice(5,7)}</span>` : '';
          const hasNotes = t.notes && t.notes.trim();
          const notes = hasNotes
            ? `<div class="history-notes history-notes-collapsed" data-collapsed="1">
                 <button class="history-notes-toggle" data-id="${t.id}" title="הצג/הסתר">▸</button>
                 <span class="history-notes-label">📝 הערה</span>
                 <div class="history-notes-content">${t.notes.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
               </div>`
            : '';
          return `<div class="history-item" data-id="${t.id}">
            <button class="history-del-btn" data-id="${t.id}" title="הסר מהרשימה">✕</button>
            <span class="history-title">✓ ${t.title.replace(/</g,'&lt;')}</span>
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
      if (!confirm('להסיר את המשימה מההיסטוריה? הפעולה אינה הפיכה.')) return;
      await api('/api/task/delete', { id: btn.dataset.id });
      toast('🗑️ הוסר מההיסטוריה');
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
      if (btn) btn.textContent = isCollapsed ? '▾' : '▸';
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

// ---------- Logout ----------
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await window._supabase.auth.signOut();
  window.location.href = '/auth';
});

// ---------- Settings Modal ----------
document.getElementById('settings-btn')?.addEventListener('click', openSettings);
document.getElementById('settings-close')?.addEventListener('click', () =>
  document.getElementById('settings-modal')?.classList.add('hidden'));
document.getElementById('settings-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('settings-modal'))
    document.getElementById('settings-modal').classList.add('hidden');
});

const PB_EMOJI_LIST = [
  '💆','🧘','🏃','💊','🩺','🫀','🧠','🌿',
  '🎵','🎧','🎹','🎸','🎤','🎼','🎷','🥁',
  '🚀','💡','🛠','⚙️','📱','💻','🔧','🧰',
  '📚','✍️','📝','🎯','📊','📈','💼','🗂',
  '🌟','❤️','🤝','🌱','🏆','🎓','💬','🔑',
  '📌','🏠','🌍','⭐','🎨','🧩','📸','🎬'
];

function _openEmojiPicker(anchorEl, onSelect) {
  document.getElementById('pb-emoji-picker')?.remove();
  const picker = document.createElement('div');
  picker.id = 'pb-emoji-picker';
  picker.style.cssText = `
    position:absolute;z-index:9999;background:var(--card2);border:1px solid var(--border);
    border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(8,1fr);
    gap:4px;box-shadow:0 8px 32px #00000060;max-width:260px;`;
  PB_EMOJI_LIST.forEach(em => {
    const btn = document.createElement('button');
    btn.textContent = em;
    btn.title = em;
    btn.style.cssText = 'font-size:1.25rem;padding:5px;border:none;background:transparent;border-radius:7px;cursor:pointer;transition:background .1s';
    btn.onmouseenter = () => btn.style.background = 'var(--hover)';
    btn.onmouseleave = () => btn.style.background = 'transparent';
    btn.addEventListener('click', e => { e.stopPropagation(); onSelect(em); picker.remove(); });
    picker.appendChild(btn);
  });
  const rect = anchorEl.getBoundingClientRect();
  picker.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  picker.style.left = Math.max(4, rect.left + window.scrollX - 100) + 'px';
  document.body.appendChild(picker);
  const close = e => { if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function _renderContactsLabelSettings(labels) {
  const el = document.getElementById('contacts-labels-settings');
  if (!el) return;
  const L = Object.assign({}, DEFAULT_CONTACTS_LABELS, labels || {});

  el.innerHTML = `
    <div class="domains-edit-hint">שנה את כותרות הסקשן לפי המקצוע שלך — מטפל, מאמן, מוזיקאי, יועץ...</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:.78rem;color:var(--text-muted);min-width:72px;text-align:right">כותרת סקשן</span>
        <input id="cl-section-title" type="text" value="${_esc(L.sectionTitle)}"
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit;direction:rtl;min-width:0">
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:.78rem;color:var(--text-muted);min-width:72px;text-align:right">טאב 1 אמוג'י</span>
        <input id="cl-tab1-emoji" type="text" value="${_esc(L.tab1Emoji)}" maxlength="2"
          style="width:44px;text-align:center;font-size:1.2rem;padding:4px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
        <input id="cl-tab1-label" type="text" value="${_esc(L.tab1Label)}"
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit;direction:rtl;min-width:0">
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:.78rem;color:var(--text-muted);min-width:72px;text-align:right">טאב 2 אמוג'י</span>
        <input id="cl-tab2-emoji" type="text" value="${_esc(L.tab2Emoji)}" maxlength="2"
          style="width:44px;text-align:center;font-size:1.2rem;padding:4px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
        <input id="cl-tab2-label" type="text" value="${_esc(L.tab2Label)}"
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit;direction:rtl;min-width:0">
      </div>
    </div>
    <button id="cl-save-btn" class="domains-save-btn" style="margin-top:10px">💾 שמור כותרות</button>`;

  el.querySelector('#cl-save-btn').addEventListener('click', async () => {
    const btn = el.querySelector('#cl-save-btn');
    btn.disabled = true; btn.textContent = '⏳';
    const newLabels = {
      sectionTitle: el.querySelector('#cl-section-title').value.trim() || L.sectionTitle,
      tab1Emoji:    el.querySelector('#cl-tab1-emoji').value.trim() || L.tab1Emoji,
      tab1Label:    el.querySelector('#cl-tab1-label').value.trim() || L.tab1Label,
      tab2Emoji:    el.querySelector('#cl-tab2-emoji').value.trim() || L.tab2Emoji,
      tab2Label:    el.querySelector('#cl-tab2-label').value.trim() || L.tab2Label,
    };
    const r = await api('/api/settings/update', { contacts_labels: newLabels });
    if (r && r.ok) {
      if (lastState && lastState.userConfig) lastState.userConfig.contactsLabels = newLabels;
      renderContactsHeader(newLabels);
      toast('כותרות נשמרו ✓');
    } else { toast('שגיאה בשמירה', false); }
    btn.disabled = false; btn.textContent = '💾 שמור כותרות';
  });
}

function _renderDomainsSettings(domains, playbooks) {
  const listEl = document.getElementById('domains-settings-list');
  if (!listEl) return;
  let domList = (domains && domains.length) ? JSON.parse(JSON.stringify(domains)) : [
    { id: 'treatments', emoji: '💆', label: 'טיפולים' },
    { id: 'music',      emoji: '🎵', label: 'מוזיקה' },
    { id: 'product',    emoji: '🚀', label: 'כלי' },
    { id: 'unassigned', emoji: '📌', label: 'כללי' }
  ];

  async function _saveDomains() {
    const btn = document.getElementById('domains-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    const r = await api('/api/settings/update', { domains: domList });
    if (r && r.ok) {
      if (lastState && lastState.userConfig) lastState.userConfig.domains = domList;
      renderPlaybookSidebar(domList, lastState && lastState.playbooks);
      renderContentSelects(lastState && lastState.userConfig && lastState.userConfig.contentTypes, domList);
      _renderPlaybooksSettings(domList, playbooks);
      toast('תחומים נשמרו ✓');
    } else { toast('שגיאה בשמירה', false); }
    if (btn) { btn.disabled = false; btn.textContent = '💾 שמור תחומים'; }
  }

  function _redraw() {
    listEl.innerHTML = `
      <div class="domains-edit-hint">✏️ ניתן לשנות שם, אמוג'י, להוסיף ולמחוק תחומים — הם יופיעו בכל הרשימות והפלייבוקים</div>
      <div id="dm-rows" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px"></div>
      <div class="domains-add-row">
        <button id="dm-new-emoji-btn" class="dm-emoji-btn" title="בחר אמוג'י">📌</button>
        <input id="dm-new-label" type="text" placeholder="שם תחום חדש..."
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit;direction:rtl;min-width:0">
        <button id="dm-add-btn" class="dm-add-btn">+ הוסף</button>
      </div>
      <button id="domains-save-btn" class="domains-save-btn">💾 שמור תחומים</button>`;

    const rows = listEl.querySelector('#dm-rows');
    domList.forEach((d, i) => {
      const row = document.createElement('div');
      row.className = 'dm-row';
      row.innerHTML = `
        <button class="dm-emoji-btn dm-row-emoji" data-di="${i}" title="בחר אמוג'י">${_esc(d.emoji)}</button>
        <input class="dm-row-input" type="text" value="${_esc(d.label)}" data-di="${i}"
          style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit;direction:rtl;min-width:0">
        <button class="dm-del-btn" data-del="${i}" title="מחק תחום">✕</button>`;
      rows.appendChild(row);
    });

    rows.querySelectorAll('.dm-row-emoji').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _openEmojiPicker(btn, em => { domList[parseInt(btn.dataset.di)].emoji = em; btn.textContent = em; });
      });
    });
    rows.querySelectorAll('.dm-row-input').forEach(inp => {
      inp.addEventListener('input', () => { domList[parseInt(inp.dataset.di)].label = inp.value; });
    });
    rows.querySelectorAll('.dm-del-btn').forEach(btn => {
      btn.addEventListener('click', () => { domList.splice(parseInt(btn.dataset.del), 1); _redraw(); });
    });

    listEl.querySelector('#dm-new-emoji-btn').addEventListener('click', e => {
      e.stopPropagation();
      _openEmojiPicker(listEl.querySelector('#dm-new-emoji-btn'), em => {
        listEl.querySelector('#dm-new-emoji-btn').textContent = em;
      });
    });
    listEl.querySelector('#dm-add-btn').addEventListener('click', () => {
      const emoji = listEl.querySelector('#dm-new-emoji-btn').textContent.trim() || '📌';
      const label = listEl.querySelector('#dm-new-label').value.trim();
      if (!label) { toast('הזן שם לתחום', false); return; }
      const id = label.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]/g,'') + '-' + (crypto.randomUUID ? crypto.randomUUID().slice(0,8) : Date.now().toString(36));
      domList.push({ id, emoji, label });
      _redraw();
    });
    listEl.querySelector('#domains-save-btn').addEventListener('click', _saveDomains);
  }
  _redraw();
}

function _renderPlatformsSettings(platforms) {
  const el = document.getElementById('platforms-settings-list');
  if (!el) return;
  const list = platforms && platforms.length ? platforms : DEFAULT_PLATFORMS;
  el.innerHTML = list.map(p => `
    <div class="plat-row" data-id="${p.id}">
      <label class="plat-toggle">
        <input type="checkbox" ${p.active ? 'checked' : ''} data-plat="${p.id}">
        <span>${p.emoji} ${p.label}</span>
      </label>
    </div>`).join('');
  el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const updated = list.map(p => ({
        ...p,
        active: el.querySelector(`input[data-plat="${p.id}"]`)?.checked ?? p.active
      }));
      await api('/api/settings/update', { platform_options: updated });
      PLATFORMS = updated;
      toast('✓ פלטפורמות עודכנו');
      loadState();
    });
  });
}

function _renderPlaybooksSettings(domains, playbooks) {
  const listEl = document.getElementById('playbooks-settings-list');
  if (!listEl) return;
  const domList = (domains && domains.length) ? domains : [
    { id: 'treatments', emoji: '💆', label: 'טיפולים' },
    { id: 'music',      emoji: '🎵', label: 'מוזיקה' },
    { id: 'product',    emoji: '🚀', label: 'כלי' },
    { id: 'unassigned', emoji: '📌', label: 'כללי' }
  ];

  listEl.innerHTML = `
    <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px">מדריך תוכן לכל תחום — מה לפרסם, איך לתקשר, רעיונות</div>
    <div id="pb-contents-list" style="display:flex;flex-direction:column;gap:16px"></div>`;

  const contList = document.getElementById('pb-contents-list');
  domList.forEach(d => {
    const saved = (playbooks || []).find(p => p.domain_id === d.id);
    const content = (saved && saved.content) ? saved.content : _pbDefault(d.id);
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="font-size:.85rem;font-weight:600;color:var(--text2);margin-bottom:5px">${_esc(d.emoji)} ${_esc(d.label)}</div>
      <textarea data-domain="${_esc(d.id)}" rows="6"
        style="width:100%;background:var(--input-bg);color:var(--text);border:1.5px solid #6c8cff33;border-radius:8px;padding:10px;font-size:.84rem;direction:rtl;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.6"
      >${_esc(content)}</textarea>
      <button data-save-domain="${_esc(d.id)}"
        style="margin-top:5px;background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:7px;cursor:pointer;font-size:.82rem">
        💾 שמור מדריך
      </button>`;
    contList.appendChild(wrap);
  });

  listEl.querySelectorAll('[data-save-domain]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domainId = btn.dataset.saveDomain;
      const ta = listEl.querySelector(`textarea[data-domain="${domainId}"]`);
      if (!ta) return;
      btn.disabled = true; btn.textContent = '⏳';
      const r = await api('/api/playbook/save', { domain_id: domainId, content: ta.value });
      if (r && r.ok) {
        if (lastState && lastState.playbooks) {
          const idx = lastState.playbooks.findIndex(p => p.domain_id === domainId);
          if (idx >= 0) lastState.playbooks[idx].content = ta.value;
          else lastState.playbooks.push({ domain_id: domainId, content: ta.value });
        }
        toast('מדריך נשמר ✓');
      } else { toast('שגיאה בשמירה', false); }
      btn.disabled = false; btn.textContent = '💾 שמור מדריך';
    });
  });
}

function _renderHabitsSettings() {
  const listEl = document.getElementById('habits-settings-list');
  if (!listEl) return;
  const habits = (lastState && lastState.habits && lastState.habits.habits) || [];

  if (!habits.length) {
    listEl.innerHTML = '<div class="muted-text" style="font-size:.85rem">אין הרגלים עדיין — הוסף למטה</div>';
  } else {
    listEl.innerHTML = habits.map(h => `
      <div class="habit-settings-row" data-id="${h.id}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <button class="hs-emoji-btn" data-id="${h.id}" title="שנה אמוג'י"
          style="font-size:1.4rem;border:none;background:transparent;cursor:pointer;min-width:32px">${h.emoji}</button>
        <input type="text" class="hs-label-inp" data-id="${h.id}" value="${h.label.replace(/"/g,'&quot;')}"
          style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
        <button class="hs-save-btn" data-id="${h.id}" style="padding:4px 10px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.8rem">שמור</button>
        <button class="hs-del-btn" data-id="${h.id}" style="padding:4px 8px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.8rem">✕</button>
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
      toast('✓ הרגל עודכן');
      loadState();
      setTimeout(_renderHabitsSettings, 500);
    });
  });

  // Edit emoji inline — click emoji opens a small picker row
  listEl.querySelectorAll('.hs-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.habit-settings-row');
      // Remove any existing picker
      row.querySelector('.hs-emoji-picker')?.remove();
      const picker = document.createElement('div');
      picker.className = 'hs-emoji-picker';
      picker.style.cssText = 'position:absolute;display:flex;flex-wrap:wrap;gap:4px;padding:8px;background:var(--card);border:1px solid var(--border);border-radius:10px;z-index:200;max-width:240px;box-shadow:0 4px 20px #0004';
      ['💧','🏃','📚','😴','🧘','🍎','💊','🧹','📝','🎵','💪','🌅','🤸','🚶','🧴','🥗','🍵','✍️','🎯','🛁','😊','⭐','🔥','🌿','🎭'].forEach(e => {
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
      if (!confirm('למחוק הרגל זה?')) return;
      await api('/api/habit/delete', { id: btn.dataset.id });
      toast('✓ נמחק');
      loadState();
      setTimeout(_renderHabitsSettings, 500);
    });
  });

  // Add new habit
  document.getElementById('habit-add-settings-btn')?.addEventListener('click', async () => {
    const emoji = document.getElementById('habit-new-emoji-settings')?.value.trim() || '✅';
    const label = document.getElementById('habit-new-label-settings')?.value.trim();
    if (!label) { toast('כתוב שם להרגל', false); return; }
    await api('/api/habit/add', { emoji, label });
    document.getElementById('habit-new-label-settings').value = '';
    document.getElementById('habit-new-emoji-settings').value = '✅';
    toast('✓ הרגל נוסף');
    loadState();
    setTimeout(_renderHabitsSettings, 500);
  });

  document.getElementById('habit-new-label-settings')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('habit-add-settings-btn')?.click();
  });
}

async function openSettings(scrollTo) {
  const modal  = document.getElementById('settings-modal');
  const bodyEl = document.getElementById('settings-body');
  if (!modal || !bodyEl) return;
  modal.classList.remove('hidden');
  bodyEl.innerHTML = '<div class="muted-text">טוען...</div>';
  try {
    const s = await api('/api/settings');
    s._playbooks        = (lastState && lastState.playbooks) || [];
    s._domains          = (lastState && lastState.userConfig && lastState.userConfig.domains) || [];
    s._contentTypes     = (lastState && lastState.userConfig && lastState.userConfig.contentTypes) || [];
    s._contactsLabels   = (lastState && lastState.userConfig && lastState.userConfig.contactsLabels) || {};
    s._platforms        = (lastState && lastState.userConfig && lastState.userConfig.platforms) || DEFAULT_PLATFORMS;
    renderSettings(s, bodyEl);
  } catch (e) {
    bodyEl.innerHTML = '<div class="muted-text">שגיאה: ' + e.message + '</div>';
  }
}

// ---------- Connections Panel (תוך ⚙️ הגדרות) ----------
async function loadConnectionsDiagnose() {
  const body = document.getElementById('connections-body');
  if (!body) return;

  if (window._supabase) {
    // Cloud mode — show Google connection status
    body.innerHTML = '<div class="muted-text">טוען...</div>';
    try {
      const { data } = await window._supabase.from('google_tokens')
        .select('google_email, updated_at').eq('user_id', window._userId).maybeSingle();
      if (data) {
        const updated = data.updated_at ? new Date(data.updated_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '';
        body.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
            <span style="font-size:1.4rem">✅</span>
            <div>
              <div style="font-weight:600">Google מחובר</div>
              <div class="muted-text" style="font-size:.82rem">${data.google_email} · עודכן: ${updated}</div>
            </div>
            <button id="conn-google-refresh" style="margin-right:auto;padding:5px 12px;background:var(--primary);color:#fff;border:none;border-radius:8px;cursor:pointer">🔄 רענן</button>
            <button id="conn-google-disconnect" style="padding:5px 12px;background:transparent;border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--muted)">נתק</button>
          </div>`;
        document.getElementById('conn-google-refresh')?.addEventListener('click', _googleRefreshData);
        document.getElementById('conn-google-disconnect')?.addEventListener('click', _googleDisconnect);
      } else {
        body.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
            <span style="font-size:1.4rem">⭕</span>
            <div>
              <div style="font-weight:600">Google לא מחובר</div>
              <div class="muted-text" style="font-size:.82rem">חבר כדי לראות יומן ומיילים בדאשבורד</div>
            </div>
            <button id="conn-google-connect" style="margin-right:auto;padding:6px 14px;background:#4285f4;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">🔗 חבר Google</button>
          </div>`;
        document.getElementById('conn-google-connect')?.addEventListener('click', _googleConnect);
      }
    } catch(e) {
      body.innerHTML = '<div class="muted-text">שגיאה: ' + e.message + '</div>';
    }
    return;
  }

  body.innerHTML = '<div class="conn-loading">טוען סטטוס חיבורים...</div>';
  try {
    const r = await fetch('/api/setup/diagnose');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    renderConnectionChecks(data.checks || [], body);
    renderConnectionLogs(data.recentLog || []);
  } catch (e) {
    body.innerHTML = '<div class="conn-error">שגיאה בטעינת סטטוס: ' + e.message + '</div>';
  }
}

function _googleConnect() {
  const uid = window._userId;
  if (!uid) return;
  window.location.href = '/.netlify/functions/google-auth?user_id=' + uid;
}

async function _googleDisconnect() {
  if (!confirm('לנתק את Google? יומן ומיילים לא יוצגו עוד.')) return;
  await window._supabase.from('google_tokens').delete().eq('user_id', window._userId);
  toast('✓ Google נותק');
  loadConnectionsDiagnose();
}

async function _googleRefreshData() {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    toast('⚠️ רענון Google לא זמין בהרצה מקומית', false);
    return;
  }
  const btn = document.getElementById('conn-google-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ מרענן...'; }
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    if (!session) { toast('נדרשת כניסה מחדש', false); return; }
    const r = await fetch('/.netlify/functions/google-data', {
      headers: { Authorization: 'Bearer ' + session.access_token }
    });
    const d = await r.json();
    if (d.connected) {
      toast('✓ יומן ומיילים עודכנו');
      loadState().then(() => _scheduleReminders());
    } else {
      toast('שגיאה ברענון', false);
    }
  } catch(e) {
    toast('שגיאה: ' + e.message, false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 רענן'; }
  }
}

function renderConnectionChecks(checks, body) {
  const icon = (status) => status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
  body.innerHTML = checks.map(c => {
    const valueLine = c.value ? `<span class="conn-row-value">${c.value}</span>` : '';
    const messageLine = c.message ? `<div class="conn-row-message">${c.message}</div>` : '';
    let actionBtn = '';
    if (c.fixUrl) {
      actionBtn = `<a class="conn-row-action" href="${c.fixUrl}" target="_blank" rel="noopener">${c.fixLabel || '🔗 פתח'}</a>`;
    } else if (c.action === 'scheduleTask') {
      actionBtn = `<button class="conn-row-action" data-action="scheduleTask">${c.actionLabel || '⏰ תזמן'}</button>`;
    } else if (c.action === 'runRefresh') {
      actionBtn = `<button class="conn-row-action" data-action="runRefresh">${c.actionLabel || '🚀 הרץ'}</button>`;
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
    el.innerHTML = '<div class="muted-text">אין לוגים עדיין</div>';
    return;
  }
  el.innerHTML = logs.map(log => {
    const lines = log.lines.map(l => `<div class="conn-log-line">${l.replace(/</g,'&lt;')}</div>`).join('');
    return `<div class="conn-log-file"><div class="conn-log-fname">📄 ${log.file}</div>${lines}</div>`;
  }).join('');
}

async function runRefreshNow() {
  const runBtn = document.getElementById('conn-run-refresh');
  const log = document.getElementById('conn-run-log');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ מריץ...'; }
  if (log) {
    log.classList.remove('hidden');
    log.innerHTML = '<div class="conn-run-spinner">⏳ מתחיל רענון... (יקח 1-2 דקות)</div>';
  }
  try {
    const r = await api('/api/setup/run-refresh', {});
    const pid = r.pid;
    if (!pid) throw new Error(r.error || 'לא הוחזר PID');
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
              ? `<div class="conn-run-success">✅ הצליח! (${elapsed} שניות)</div>`
              : `<div class="conn-run-error">⚠ נכשל (exit=${status.exitCode}). נסה שוב.</div>`;
          }
          if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 הרץ רענון עכשיו'; }
          loadConnectionsDiagnose();
          if (success) setTimeout(() => loadState(), 1000);
        } else {
          if (log) log.innerHTML = `<div class="conn-run-spinner">⏳ רץ... (${elapsed} שניות)</div>`;
          setTimeout(poll, 3000);
        }
      } catch (e) {
        if (log) log.innerHTML = `<div class="conn-run-error">שגיאה: ${e.message}</div>`;
        if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 הרץ רענון עכשיו'; }
      }
    };
    setTimeout(poll, 3000);
  } catch (e) {
    if (log) log.innerHTML = `<div class="conn-run-error">שגיאה: ${e.message}</div>`;
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 הרץ רענון עכשיו'; }
  }
}

async function scheduleDailyTask() {
  const btns = document.querySelectorAll('[data-action="scheduleTask"]');
  btns.forEach(b => { b.disabled = true; b.textContent = '⏳ מתזמן...'; });
  try {
    const r = await api('/api/setup/schedule-task', {});
    if (r.ok) {
      toast('✅ רענון יומי תוזמן ל-07:00');
      loadConnectionsDiagnose();
    } else {
      toast('שגיאה: ' + (r.error || 'לא ידוע'), false);
      btns.forEach(b => { b.disabled = false; b.textContent = '⏰ תזמן עכשיו'; });
    }
  } catch (e) {
    toast('שגיאה: ' + e.message, false);
    btns.forEach(b => { b.disabled = false; b.textContent = '⏰ תזמן עכשיו'; });
  }
}

// ---------- Admin Panel ----------
const TIER_LABELS = { free: '⏳ ממתין לאישור', basic: 'בסיסי', premium: '⭐ פרימיום', vip: '👑 VIP' };
const TIER_COLORS = { free: '#e07a00', basic: '#6ca', premium: '#4a6aee', vip: '#e59a00' };

async function _adminGetSession() {
  let { data: { session } } = await window._supabase.auth.getSession();
  if (session && session.expires_at * 1000 < Date.now() + 60000) {
    const { data } = await window._supabase.auth.refreshSession();
    session = data?.session || session;
  }
  return session;
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _renderAdminUserRow(u) {
  const isAdmin = u.email === 'david1.frank@gmail.com';
  const hasAccess = u.tier === 'premium' || u.tier === 'vip';
  return `
    <div class="admin-user-row" data-id="${_esc(u.id)}">
      <div class="admin-user-info">
        <div class="admin-user-name">${_esc(u.name || '—')}</div>
        <div class="admin-user-email">${_esc(u.email)}</div>
      </div>
      <div class="admin-user-actions">
        <span class="admin-tier-badge" style="color:${TIER_COLORS[u.tier]||'#999'}">${TIER_LABELS[u.tier]||u.tier}</span>
        ${isAdmin
          ? '<span class="muted-text" style="font-size:.75rem">מנהל</span>'
          : hasAccess
            ? `<button class="admin-revoke-btn" data-uid="${_esc(u.id)}" data-tier="free">🚫 בטל גישה</button>`
            : `<button class="admin-approve-btn" data-uid="${_esc(u.id)}" data-tier="premium">✅ אשר גישה</button>`
        }
        ${isAdmin ? '' : `<button class="admin-delete-btn" data-delete-uid="${_esc(u.id)}" data-email="${_esc(u.email)}" title="מחק משתמש">🗑️</button>`}
      </div>
    </div>`;
}

async function _loadAdminPanel() {
  const el = document.getElementById('admin-users-list');
  if (!el) return;

  const signupUrl = 'https://stupendous-lily-f8cd84.netlify.app/auth';
  // Invite section at top
  el.innerHTML = `
    <div class="admin-invite-form">
      <div class="admin-invite-title">➕ הזמן משתמש חדש</div>
      <div style="font-size:.82rem;color:var(--text2);margin-bottom:10px;line-height:1.6">
        שלח לו/לה את קישור ההרשמה. אחרי שנרשמ/ה — יופיע/תופיע ברשימה עם סטטוס "ממתין לאישור" ותוכל לאשר גישה.
      </div>
      <div style="display:flex;gap:8px">
        <a href="mailto:?subject=${encodeURIComponent('הזמנה לדאשבורד קרלוס')}&body=${encodeURIComponent('שלום,\n\nהוזמנת להצטרף לדאשבורד קרלוס!\n\nלחץ על הקישור כדי להירשם:\n' + signupUrl + '\n\nלאחר ההרשמה תקבל/י גישה מלאה.')}" style="flex:1;padding:8px 4px;border-radius:8px;background:#e8f0fe;color:#1a56db;font-size:.82rem;font-weight:700;text-align:center;text-decoration:none">📧 שלח במייל</a>
        <a href="https://wa.me/?text=${encodeURIComponent('שלום! הוזמנת לדאשבורד קרלוס 🎉\nלחץ על הקישור כדי להירשם:\n' + signupUrl)}" target="_blank" rel="noopener" style="flex:1;padding:8px 4px;border-radius:8px;background:#e8fef0;color:#16a34a;font-size:.82rem;font-weight:700;text-align:center;text-decoration:none">💬 וואטסאפ</a>
        <button id="admin-copy-signup-btn" style="flex:1;padding:8px 4px;border-radius:8px;background:var(--primary);color:#fff;font-size:.82rem;font-weight:700;border:none;cursor:pointer">📋 העתק</button>
      </div>
      <div id="admin-copy-signup-confirm" style="text-align:center;font-size:.78rem;color:var(--success);margin-top:4px;display:none">✅ הקישור הועתק!</div>
    </div>
    <div class="admin-users-divider"></div>
    <div id="admin-users-rows"><div class="muted-text">טוען...</div></div>`;

  // Copy signup link button
  document.getElementById('admin-copy-signup-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('admin-copy-signup-btn');
    const confirm = document.getElementById('admin-copy-signup-confirm');
    navigator.clipboard.writeText(signupUrl)
      .then(() => { btn.textContent = '✅ הועתק!'; confirm.style.display = 'block'; setTimeout(() => { btn.textContent = '📋 העתק'; confirm.style.display = 'none'; }, 2000); })
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = signupUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        btn.textContent = '✅ הועתק!'; setTimeout(() => { btn.textContent = '📋 העתק'; }, 2000);
      });
  });

  if (false) { // legacy invite API — kept for reference, no longer used in UI
    try {
      msgEl.style.color = 'var(--danger)';
      msgEl.textContent = 'שגיאה: ' + e.message;
    } catch (_legacyErr) { /* legacy path unused */ }
  } // end if(false)

  // Load user list
  await _reloadAdminUsers();
}

async function _reloadAdminUsers() {
  const rowsEl = document.getElementById('admin-users-rows');
  if (!rowsEl) return;
  try {
    const s = await _adminGetSession();
    if (!s) return;
    const r = await fetch('/.netlify/functions/admin-users', {
      headers: { Authorization: 'Bearer ' + s.access_token }
    });
    if (!r.ok) { const eBody = await r.json().catch(() => ({})); rowsEl.innerHTML = '<div class="muted-text">שגיאה ' + r.status + ': ' + (eBody.error || 'טעינה נכשלה') + '</div>'; return; }
    const { users } = await r.json();
    if (!users || !users.length) { rowsEl.innerHTML = '<div class="muted-text">אין משתמשים רשומים עדיין</div>'; return; }
    rowsEl.innerHTML = users.map(_renderAdminUserRow).join('');
    _bindAdminRowEvents(rowsEl);
  } catch (e) {
    rowsEl.innerHTML = '<div class="muted-text">שגיאה: ' + e.message + '</div>';
  }
}

function _bindAdminRowEvents(container) {
  container.querySelectorAll('[data-uid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid  = btn.dataset.uid;
      const tier = btn.dataset.tier;
      const row  = btn.closest('.admin-user-row');
      btn.disabled = true; btn.textContent = '⏳';
      try {
        const s = await _adminGetSession();
        const res = await fetch('/.netlify/functions/admin-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
          body: JSON.stringify({ action: 'set_tier', userId: uid, tier })
        });
        const resBody = await res.json().catch(() => ({}));
        console.log('[admin set_tier]', res.status, resBody);
        if (!res.ok) throw new Error(resBody.error || 'שגיאת שרת ' + res.status);
        const badge = row.querySelector('.admin-tier-badge');
        badge.textContent = TIER_LABELS[tier] || tier;
        badge.style.color = TIER_COLORS[tier] || '#999';
        if (tier === 'free') {
          btn.className = 'admin-approve-btn'; btn.dataset.tier = 'premium';
          btn.textContent = '✅ אשר גישה'; btn.disabled = false;
        } else {
          btn.className = 'admin-revoke-btn'; btn.dataset.tier = 'free';
          btn.textContent = '🚫 בטל גישה'; btn.disabled = false;
        }
        toast(tier === 'free' ? '🚫 גישה בוטלה' : '✅ גישה אושרה');
      } catch (e) {
        toast('שגיאה: ' + e.message, false);
        btn.disabled = false;
        btn.textContent = tier === 'free' ? '🚫 בטל גישה' : '✅ אשר גישה';
      }
    });
  });

  container.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid   = btn.dataset.deleteUid;
      const email = btn.dataset.email;
      const row   = btn.closest('.admin-user-row');
      if (!confirm(`למחוק את ${email} לצמיתות?\n\nהפעולה אינה הפיכה.`)) return;
      btn.disabled = true; btn.textContent = '⏳';
      try {
        const s = await _adminGetSession();
        const res = await fetch('/.netlify/functions/admin-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
          body: JSON.stringify({ action: 'delete_user', userId: uid })
        });
        if (!res.ok) throw new Error('שגיאת שרת');
        row.style.transition = 'opacity .3s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 300);
        toast('🗑️ המשתמש נמחק');
      } catch (e) {
        toast('שגיאה: ' + e.message, false);
        btn.disabled = false; btn.textContent = '🗑️';
      }
    });
  });
}

function renderSettings(s, bodyEl) {
  const isLite = (s.edition || 'full') === 'lite';
  bodyEl.innerHTML = `
    <div class="settings-section">
      <div class="settings-section-title">👤 פרופיל</div>
      <label>שם<input type="text" id="settings-name" value="${(s.userName||'').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" placeholder="השם שלך"></label>
      <label>שם העוזר<input type="text" id="settings-asst" value="${(s.assistantName||'').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" placeholder="קרלוס"></label>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🤖 AI (אופציונלי)</div>
      <label class="settings-toggle-row">
        <span>פיצ'רי AI מלאים <span class="settings-hint">(יומן + מייל + צ'אט — דורש Claude Code)</span></span>
        <input type="checkbox" id="settings-edition" ${!isLite ? 'checked' : ''}>
      </label>
      <div class="settings-api-row">
        <label>מפתח Anthropic <span class="settings-hint">— לבריפינג בוקר חכם בלי Claude Code</span></label>
        <input type="text" id="settings-apikey" value="" placeholder="${s.apiKeySet ? '●●●●●●●● (מוגדר ✓)' : 'sk-ant-...'}" autocomplete="off">
        <div class="settings-hint" style="margin-top:4px">
          🔗 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">קבל מפתח חינם</a> — קרדיט $5 לחשבון חדש, מספיק ל-100+ בריפינגים
        </div>
      </div>
    </div>

    <div class="settings-section" id="habits-settings-section">
      <div class="settings-section-title">🏃 הרגלים</div>
      <div id="habits-settings-list"></div>
      <div style="margin-top:10px">
        <div class="settings-section-title" style="font-size:.8rem;margin-bottom:6px">הוסף הרגל חדש</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px" id="habit-emoji-grid">
          ${['💧','🏃','📚','😴','🧘','🍎','💊','🧹','📝','🎵','💪','🌅','🤸','🚶','🧴','🥗','🍵','✍️','🎯','🛁'].map(e =>
            `<button class="habit-emoji-pick" data-e="${e}" style="font-size:1.3rem;padding:4px 6px;border:2px solid transparent;border-radius:8px;cursor:pointer;background:var(--card)">${e}</button>`
          ).join('')}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="habit-new-emoji-settings" value="✅" maxlength="2"
            style="width:42px;text-align:center;font-size:1.3rem;padding:4px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
          <input type="text" id="habit-new-label-settings" placeholder="שם ההרגל..."
            style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:inherit">
          <button id="habit-add-settings-btn" style="padding:6px 14px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap">+ הוסף</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">👥 כותרות אנשי קשר</div>
      <div id="contacts-labels-settings"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">📂 תחומי עבודה</div>
      <div id="domains-settings-list"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">📲 סוגי תוכן</div>
      <div id="content-types-settings-list"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">📱 פלטפורמות פרסום</div>
      <div class="settings-hint" style="margin-bottom:10px">סמן אילו פלטפורמות פעילות — רק הן יופיעו כאפשרות בתוכן</div>
      <div id="platforms-settings-list"></div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🔔 תזכורות</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span id="notif-status" style="font-size:.88rem;color:var(--muted)">טוען...</span>
        <button id="notif-req-btn" style="display:none;padding:5px 12px;background:var(--primary);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.88rem">אפשר התראות</button>
        <button id="notif-test-btn" style="padding:5px 12px;background:var(--card);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:.88rem">🔔 בדיקה עכשיו</button>
      </div>
    </div>

    <div class="settings-section connections-section">
      <div class="settings-section-title">🔌 חיבורים</div>
      <div id="connections-body" class="connections-body"></div>
    </div>

    <div class="settings-section" id="playbooks-settings-section">
      <div class="settings-section-title">📖 פלייבוקים — מדריכי תחום</div>
      <div id="playbooks-settings-list"></div>
    </div>

    ${window._userEmail === 'david1.frank@gmail.com' ? `
    <div class="settings-section" id="admin-panel-section">
      <div class="settings-section-title">👑 ניהול משתמשים</div>
      <div id="admin-users-list" class="admin-users-list">
        <div class="muted-text">טוען...</div>
      </div>
    </div>` : ''}

    <div class="settings-actions">
      <button id="settings-save">💾 שמור</button>
      <button id="settings-cancel-btn" class="settings-cancel-btn">ביטול</button>
    </div>`;

  // ── Habits section ────────────────────────────────────────
  _renderHabitsSettings();

  // ── Contacts labels section ───────────────────────────────
  _renderContactsLabelSettings(s._contactsLabels);

  // ── Domains section ───────────────────────────────────────
  _renderDomainsSettings(s._domains, s._playbooks);

  // ── Content types section ─────────────────────────────────
  _renderContentTypesSettings(s._contentTypes);

  // ── Platforms section ─────────────────────────────────────
  _renderPlatformsSettings(s._platforms);

  // ── Playbooks section ─────────────────────────────────────
  _renderPlaybooksSettings(s._domains, s._playbooks);

  // Load diagnose immediately after rendering
  loadConnectionsDiagnose();

  // Notification status in settings
  const notifStatus = document.getElementById('notif-status');
  const notifReqBtn = document.getElementById('notif-req-btn');
  if (notifStatus) {
    if (!('Notification' in window)) {
      notifStatus.textContent = 'הדפדפן אינו תומך בהתראות';
    } else if (Notification.permission === 'granted') {
      notifStatus.textContent = '✅ התראות מאושרות';
    } else if (Notification.permission === 'denied') {
      notifStatus.textContent = '❌ התראות חסומות — פתח הגדרות דפדפן כדי לאפשר';
    } else {
      notifStatus.textContent = '⚠️ התראות לא אושרו עדיין';
      if (notifReqBtn) { notifReqBtn.style.display = ''; notifReqBtn.onclick = () => Notification.requestPermission().then(p => { notifStatus.textContent = p === 'granted' ? '✅ התראות מאושרות' : '❌ חסומות'; notifReqBtn.style.display = 'none'; }); }
    }
  }
  document.getElementById('notif-test-btn')?.addEventListener('click', () => {
    window.testReminder();
    toast('🔔 בדיקת תזכורת הושקה');
  });

  // Load admin panel if admin
  if (window._userEmail === 'david1.frank@gmail.com') {
    _loadAdminPanel();
  }

  // Scroll to requested section
  if (scrollTo) {
    const sectionMap = {
      domains:       'domains-settings-list',
      'content-types': 'content-types-settings-list',
      playbooks:     'playbooks-settings-section'
    };
    const targetId = sectionMap[scrollTo] || scrollTo;
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  document.getElementById('settings-cancel-btn').addEventListener('click', () =>
    document.getElementById('settings-modal').classList.add('hidden'));

  // Connections panel global action buttons
  document.getElementById('conn-refresh-status')?.addEventListener('click', loadConnectionsDiagnose);
  document.getElementById('conn-run-refresh')?.addEventListener('click', runRefreshNow);

  document.getElementById('settings-save').addEventListener('click', async () => {
    const btn = document.getElementById('settings-save');
    btn.disabled = true; btn.textContent = '⏳';
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
      toast('✓ הגדרות נשמרו');
      document.getElementById('settings-modal').classList.add('hidden');
      loadState();
    } catch (e) {
      toast('שגיאה בשמירה', false);
    } finally {
      btn.disabled = false; btn.textContent = '💾 שמור';
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

// ---------- Timer collapse ----------
(function() {
  const stored = localStorage.getItem('tw-collapsed');
  // Default: always open (user can collapse manually)
  let collapsed = stored !== null ? stored === '1' : false;

  function applyCollapse() {
    const body = document.getElementById('tw-body');
    const btn  = document.getElementById('tw-collapse-btn');
    if (!body || !btn) return;
    body.style.display = collapsed ? 'none' : '';
    btn.textContent = collapsed ? '▴' : '▾';
    btn.title = collapsed ? 'הרחב סטופר' : 'מזער סטופר';
  }

  document.getElementById('tw-collapse-btn')?.addEventListener('click', () => {
    collapsed = !collapsed;
    localStorage.setItem('tw-collapsed', collapsed ? '1' : '0');
    applyCollapse();
  });

  applyCollapse();
})();

// ---------- Dark / Light Theme ----------
let _darkMode = localStorage.getItem('carlos-theme') !== 'light';
function applyTheme() {
  document.body.classList.toggle('light-mode', !_darkMode);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = _darkMode ? '🌙' : '☀️';
}
document.getElementById('theme-btn')?.addEventListener('click', () => {
  _darkMode = !_darkMode;
  localStorage.setItem('carlos-theme', _darkMode ? 'dark' : 'light');
  applyTheme();
});

// ---------- Booking ----------
// Parse "14" → "14:00", "930" → "09:30", "14:00" → "14:00"
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

// ── Build Google Calendar intent URL from appointment data ──
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
  const details = [d.phone ? `טלפון: ${d.phone}` : '', d.notes ? `הערות: ${d.notes}` : ''].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `תור: ${d.name} · ${d.service}`,
    dates: `${ds}T${ts}/${endStr}`,
    ctz: 'Asia/Jerusalem',
    details
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ── Global booking alert banner (top of dashboard) ──
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
      const calBtn = gcUrl ? `<a class="booking-alert-cal" href="${gcUrl}" target="_blank" title="הוסף ליומן Google">📅</a>` : '';
      return `<div class="booking-alert">
        <span>🔔 ${_esc(n.text)}</span>
        ${calBtn}
        <button class="booking-alert-dismiss" data-id="${_esc(n.id)}">✕</button>
      </div>`;
    }).join('') + '</div>';
  bar.querySelectorAll('.booking-alert-dismiss').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/api/booking/notify/read', { id: btn.dataset.id });
      loadState();
    });
  });
}

function renderPublicBookingBar(el, slug) {
  const origin = 'https://stupendous-lily-f8cd84.netlify.app';
  if (slug) {
    const url = `${origin}/book/${slug}`;
    el.innerHTML = `<div class="bk-tunnel-active">
      <span>🟢 דף זימון ציבורי פעיל</span>
      <span class="bk-tunnel-url">${_esc(url)}</span>
      <button id="bk-copy-tunnel" class="bk-tunnel-copy-btn">📋 העתק</button>
    </div>`;
    document.getElementById('bk-copy-tunnel')?.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => toast('קישור הועתק ✓'));
    });
  } else {
    el.innerHTML = `<div class="bk-tunnel-off">
      <span class="muted-text">⚙️ הגדר slug בפרופיל הזימון כדי לקבל קישור ציבורי</span>
    </div>`;
  }
}

function renderBooking(data) {
  if (!data) return;
  const { appointments = [], slots = [] } = data;
  const upcomingEl = document.getElementById('booking-upcoming');
  const slotsMgrEl = document.getElementById('booking-slots-mgr');
  if (!upcomingEl || !slotsMgrEl) return;

  // ── Public booking bar ──
  {
    let urlBar = document.getElementById('bk-url-bar');
    if (!urlBar) {
      urlBar = document.createElement('div');
      urlBar.id = 'bk-url-bar';
      upcomingEl.parentElement.insertBefore(urlBar, upcomingEl);
    }
    renderPublicBookingBar(urlBar, data.publicSlug);
  }

  // ── Upcoming appointments ──
  const now = new Date();
  const upcoming = appointments
    .filter(a => a.status !== 'cancelled' && new Date(a.date + 'T' + a.time) >= now)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (upcoming.length === 0) {
    upcomingEl.innerHTML = '<div class="muted-text" style="padding:6px 0">אין זימונים קרובים</div>';
  } else {
    upcomingEl.innerHTML = upcoming.map(a => {
      const d = new Date(a.date + 'T' + a.time);
      const dateStr = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
      const durStr = a.time_to ? `–${a.time_to}` : (a.duration_min ? ` · ${a.duration_min} דק׳` : '');
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
      const gcTitle = encodeURIComponent(`תור: ${a.patient_name}${a.service ? ' · ' + a.service : ''}`);
      const gcDetails = encodeURIComponent(`טלפון: ${a.patient_phone || '—'}${a.notes ? '\nהערות: ' + a.notes : ''}`);
      const gcUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gcTitle}&dates=${gcStart}/${gcEnd}&details=${gcDetails}`;
      // Format notes with line breaks
      const notesHtml = a.notes
        ? '<div class="bk-appt-notes">📝 ' + _esc(a.notes).replace(/\n/g, '<br>') + '</div>'
        : '';
      return `<div class="bk-appt">
        <div style="flex:1">
          <div class="bk-appt-name">${_esc(a.patient_name)}</div>
          <div class="bk-appt-detail">${dateStr} · ${a.time}${durStr}</div>
          <div class="bk-appt-detail">${_esc(a.service || '')}${a.patient_phone ? ' · ' + _esc(a.patient_phone) : ''}</div>
          ${notesHtml}
          <a href="${gcUrl}" target="_blank" class="bk-gcal-link" title="הוסף ליומן Google">📅 הוסף ליומן Google</a>
        </div>
        <button class="bk-cancel-btn" data-id="${_esc(a.id)}">ביטול</button>
      </div>`;
    }).join('');
    upcomingEl.querySelectorAll('.bk-cancel-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('לבטל את הזימון?')) return;
        await api('/api/booking/cancel', { id: btn.dataset.id });
        loadState();
        toast('זימון בוטל');
      });
    });
  }

  // ── Free slots list ──
  const freeSlots = slots
    .filter(s => !s.booked)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  let slotsHtml = `<div class="bk-sub-title" style="margin-top:14px">חריצים פנויים (${freeSlots.length})</div>`;
  if (freeSlots.length === 0) {
    slotsHtml += '<div class="muted-text" style="padding:4px 0">אין חריצים — הוסף למטה</div>';
  } else {
    slotsHtml += freeSlots.map(sl => {
      const d = new Date(sl.date + 'T' + sl.time);
      const dateStr = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
      const rangeStr = sl.time_to ? `${sl.time}–${sl.time_to}` : `${sl.time}${sl.duration_min ? ' (' + sl.duration_min + ' דק׳)' : ''}`;
      return `<div class="bk-slot">
        <span><b>${rangeStr}</b> · ${dateStr}</span>
        <button class="bk-del-slot" data-id="${_esc(sl.id)}" title="מחק חריץ">✕</button>
      </div>`;
    }).join('');
  }

  // ── Add slots form — range + session duration ──
  slotsHtml += `
  <div class="bk-add-form">
    <div class="bk-sub-title" style="margin-bottom:10px">➕ הוסף זמן פנוי</div>
    <div class="bk-add-row">
      <div class="bk-add-field">
        <label>תאריך</label>
        <input type="date" id="bk-new-date">
      </div>
      <div class="bk-add-field">
        <label>משעה</label>
        <input type="text" id="bk-new-from" placeholder="14" maxlength="5">
      </div>
      <div class="bk-add-sep">עד</div>
      <div class="bk-add-field">
        <label>עד שעה</label>
        <input type="text" id="bk-new-to" placeholder="16" maxlength="5">
      </div>
    </div>
    <div class="bk-dur-row">
      <span class="bk-dur-label">משך כל פגישה:</span>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="30"> 30 דק׳</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="45"> 45 דק׳</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="60" checked> 60 דק׳</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="90"> 90 דק׳</label>
      <label class="bk-dur-opt"><input type="radio" name="bk-dur" value="custom"> אחר:
        <input type="number" id="bk-dur-custom" min="15" step="5" value="45" style="width:52px;margin-right:4px">דק׳
      </label>
    </div>
    <div id="bk-slot-preview" class="bk-preview-box"></div>
    <button id="bk-add-slot" class="bk-add-btn" disabled>+ הוסף חריצים</button>
  </div>`;

  slotsMgrEl.innerHTML = slotsHtml;

  // ── Delete slot ──
  slotsMgrEl.querySelectorAll('.bk-del-slot').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/api/booking/slot/delete', { id: btn.dataset.id });
      loadState();
      toast('חריץ נמחק');
    });
  });

  // Pre-fill today
  const newDateEl = document.getElementById('bk-new-date');
  if (newDateEl) newDateEl.value = todayStr();

  // ── Live preview & button update ──
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
      addBtn.textContent = '+ הוסף חריצים';
      return;
    }
    const totalMin = _timeDiffMin(from, to);
    if (totalMin <= 0) {
      prev.innerHTML = '<span style="color:var(--warning)">⚠ שעת הסיום חייבת להיות אחרי שעת ההתחלה</span>';
      addBtn.disabled = true;
      return;
    }
    const chosenDate = document.getElementById('bk-new-date').value || todayStr();
    if (chosenDate < todayStr()) {
      prev.innerHTML = '<span style="color:var(--warning)">⚠ לא ניתן להוסיף חריצים בתאריך שעבר</span>';
      addBtn.disabled = true;
      return;
    }
    const sessionMin = getSessionMin();
    const generated = _generateSlots(chosenDate, from, to, sessionMin);
    if (!generated.length) {
      prev.innerHTML = '<span style="color:var(--warning)">⚠ הטווח קצר מדי למשך הפגישה שנבחר</span>';
      addBtn.disabled = true;
      return;
    }
    prev.innerHTML = generated.map(s => `<div class="bk-prev-slot">✓ ${s.time}–${s.time_to}</div>`).join('') +
      `<div class="bk-prev-total">${generated.length} חריצים · ${sessionMin} דק׳ כל אחד</div>`;
    addBtn.disabled = false;
    addBtn.textContent = `+ הוסף ${generated.length} חריצ${generated.length === 1 ? '' : 'ים'}`;
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

  // ── Add slots ──
  document.getElementById('bk-add-slot')?.addEventListener('click', async () => {
    const date = document.getElementById('bk-new-date').value;
    const from = _parseTime(document.getElementById('bk-new-from').value);
    const to   = _parseTime(document.getElementById('bk-new-to').value);
    if (!date || !from || !to) { toast('נא למלא תאריך, שעת התחלה וסיום', false); return; }
    const sessionMin = getSessionMin();
    const generated = _generateSlots(date, from, to, sessionMin);
    if (!generated.length) { toast('הטווח קצר מדי', false); return; }
    const btn = document.getElementById('bk-add-slot');
    btn.disabled = true; btn.textContent = '⏳ שומר...';
    await api('/api/booking/slot/add-batch', { slots: generated });
    loadState();
    toast(`${generated.length} חריצים נוספו ✓`);
  });

  updatePreview();
}

function openBookingProfileModal() {
  api('/api/booking/profile').then(prof => {
    const modal = document.getElementById('settings-modal');
    const body = document.getElementById('settings-body');
    if (!modal || !body) return;
    body.innerHTML = `
      <h3 style="margin:0 0 14px;color:var(--text)">✏️ ערוך דף ציבורי</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label style="color:var(--text-muted);font-size:.85rem">שם</label>
        <input id="bkp-name" class="settings-input" value="${_esc(prof.name || '')}">
        <label style="color:var(--text-muted);font-size:.85rem">תפקיד</label>
        <input id="bkp-title" class="settings-input" value="${_esc(prof.title || '')}">
        <label style="color:var(--text-muted);font-size:.85rem">על עצמי (ביו)</label>
        <textarea id="bkp-bio" class="settings-input" rows="3" style="resize:vertical">${_esc(prof.bio || '')}</textarea>
        <label style="color:var(--text-muted);font-size:.85rem">שירותים (שורה לכל שירות)</label>
        <textarea id="bkp-services" class="settings-input" rows="4" style="resize:vertical">${(prof.services || []).join('\n')}</textarea>
        <label style="color:var(--text-muted);font-size:.85rem">מיקום</label>
        <input id="bkp-location" class="settings-input" value="${_esc(prof.location || '')}">
        <label style="color:var(--text-muted);font-size:.85rem">תמונת פרופיל</label>
        <div style="display:flex;align-items:center;gap:12px">
          ${prof.photo_url ? `<img id="bkp-photo-preview" src="${_esc(prof.photo_url)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--border)">` : `<div id="bkp-photo-preview" style="width:64px;height:64px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:28px">👤</div>`}
          <div style="display:flex;flex-direction:column;gap:6px">
            <label style="cursor:pointer;background:var(--accent);color:#fff;padding:6px 14px;border-radius:8px;font-size:.85rem;display:inline-block" for="bkp-photo-file">📷 העלה תמונה</label>
            <input type="file" id="bkp-photo-file" accept="image/*" style="display:none">
            <span id="bkp-photo-status" style="font-size:.75rem;color:var(--text-muted)"></span>
          </div>
        </div>
        <input type="hidden" id="bkp-photo" value="${_esc(prof.photo_url || '')}">
        <button id="bkp-save" style="margin-top:8px;background:var(--accent);color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:.95rem">💾 שמור</button>
      </div>`;
    modal.classList.remove('hidden');

    document.getElementById('bkp-photo-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = document.getElementById('bkp-photo-status');
      status.textContent = '⏳ מעלה...';
      try {
        const ext = file.name.split('.').pop();
        const path = `profile-${Date.now()}.${ext}`;
        const { data, error } = await window._supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        const { data: { publicUrl } } = window._supabase.storage.from('avatars').getPublicUrl(path);
        document.getElementById('bkp-photo').value = publicUrl;
        const preview = document.getElementById('bkp-photo-preview');
        preview.outerHTML = `<img id="bkp-photo-preview" src="${publicUrl}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--border)">`;
        status.textContent = '✓ הועלה בהצלחה';
      } catch(err) {
        status.textContent = '❌ שגיאה בהעלאה';
        console.error(err);
      }
    });

    document.getElementById('bkp-save')?.addEventListener('click', async () => {
      const updated = {
        name: document.getElementById('bkp-name').value.trim(),
        title: document.getElementById('bkp-title').value.trim(),
        bio: document.getElementById('bkp-bio').value.trim(),
        services: document.getElementById('bkp-services').value.split('\n').map(s => s.trim()).filter(Boolean),
        location: document.getElementById('bkp-location').value.trim(),
        photo_url: document.getElementById('bkp-photo').value.trim()
      };
      await api('/api/booking/profile/update', updated);
      modal.classList.add('hidden');
      toast('פרופיל עודכן ✓');
    });
  });
}

document.getElementById('copy-booking-link')?.addEventListener('click', () => {
  const slug = lastState && lastState.bookingData && lastState.bookingData.publicSlug;
  const url = slug
    ? `https://stupendous-lily-f8cd84.netlify.app/book/${slug}`
    : window.location.origin + '/book';
  navigator.clipboard.writeText(url)
    .then(() => toast(slug ? 'קישור הועתק ✓' : 'הגדר slug בפרופיל הזימון קודם'))
    .catch(() => toast(url));
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
      toast('נא להכניס שם 😊', false);
      return;
    }
    btn.disabled = true; btn.textContent = '⏳ שומר...';
    try {
      await api('/api/settings/update', {
        userName: name,
        assistantName: 'קרלוס',
        ...(role ? { userRole: role } : {})
      });
      hideWelcome();
      loadState();
      toast('ברוך הבא, ' + name + '! 🎉');
    } catch (e) {
      btn.disabled = false; btn.textContent = '✅ בוא נתחיל';
      toast('שגיאה בשמירה — נסה שוב', false);
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
function _restoreTimer() {
  try {
    const saved = localStorage.getItem('carlos-timer');
    if (!saved) return;
    const st = JSON.parse(saved);
    if (!st.startTs) return;
    const now = Date.now();
    if (st.mode === 'timer' && st.endTs && now >= st.endTs) {
      localStorage.removeItem('carlos-timer');
      return;
    }
    timerMode = st.mode;
    startTs = st.startTs;
    endTs = st.endTs || 0;
    plannedTotal = st.plannedTotal || 0;
    $('#tw-mode').value = timerMode;
    $('#tw-minutes-row').classList.toggle('hidden', timerMode !== 'timer');
    $('#tw-start').classList.add('hidden');
    $('#tw-stop').classList.remove('hidden');
    interval = setInterval(tick, 1000);
    if (timerMode === 'timer') {
      const remaining = Math.max(0, endTs - now);
      endTimeout = setTimeout(triggerFinish, remaining);
    }
    tick();
  } catch (e) {
    localStorage.removeItem('carlos-timer');
  }
}

function _initApp() {
  applyTheme();
  applyMode();
  refreshSoundLabel();
  initSectionToggles();
  _initExpandButtons();
  _restoreTimer();
  const nd = $('#new-task-date');
  if (nd) nd.value = todayStr();
  initWelcome();
  // Handle Google OAuth return
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('google_connected') === '1') {
    history.replaceState({}, '', window.location.pathname);
    toast('✅ Google חובר בהצלחה! מרענן נתונים...');
    setTimeout(_googleRefreshData, 800);
  } else if (urlParams.get('google_error')) {
    history.replaceState({}, '', window.location.pathname);
    toast('שגיאה בחיבור Google: ' + decodeURIComponent(urlParams.get('google_error')), false);
  }
  loadState().then(() => {
    // Auto-refresh Google data on every open (cloud only)
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setTimeout(_googleRefreshData, 2000);
    }
    // Schedule reminders with exact setTimeout for each task
    _scheduleReminders();
  });
  // Auto-poll for new bookings every 30s
  setInterval(async () => {
    try {
      const d = await api('/api/booking/poll');
      if (d.hasNew) loadState().then(() => _scheduleReminders());
    } catch(e) {}
  }, 30000);
  // Reminder safety net: recheck every 60s in case setTimeout was lost
  setInterval(_scheduleReminders, 60_000);
  // Recheck immediately when user returns to this tab
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _scheduleReminders(); });
  // Request notification permission after 3s (non-blocking)
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3000);
  }
}

// ---------- Task Reminders ----------
function _scheduleReminders() {
  const tasks = (lastState && lastState.tasks) || [];
  const now = Date.now();
  let shown = {};
  try { shown = JSON.parse(localStorage.getItem('carlos_reminders_shown') || '{}'); } catch (_) {}

  tasks.forEach(task => {
    if (!task.reminder_at || task.status === 'completed') return;
    const due = new Date(task.reminder_at).getTime();
    if (isNaN(due)) return;
    const shownKey = task.id + '_' + due;
    if (shown[shownKey]) return;

    const delay = due - now;

    // Past-due within 10 minutes: fire immediately
    if (delay <= 0) {
      if (delay > -600_000) {
        shown[shownKey] = true;
        localStorage.setItem('carlos_reminders_shown', JSON.stringify(shown));
        _fireReminder(task);
      }
      return;
    }

    // Future: schedule exact timeout (cancel old one if task was re-saved)
    if (_reminderTimeouts.has(task.id)) clearTimeout(_reminderTimeouts.get(task.id));
    const tid = setTimeout(() => {
      _reminderTimeouts.delete(task.id);
      const s = JSON.parse(localStorage.getItem('carlos_reminders_shown') || '{}');
      const sk = task.id + '_' + due;
      if (!s[sk]) {
        s[sk] = true;
        localStorage.setItem('carlos_reminders_shown', JSON.stringify(s));
        const current = (lastState && lastState.tasks || []).find(t => t.id === task.id) || task;
        _fireReminder(current);
      }
    }, delay);
    _reminderTimeouts.set(task.id, tid);
    const minStr = new Date(due).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
    toast('🔔 תזכורת נקבעה ל-' + minStr);
  });
}

window.reminders = () => {
  const ids = [..._reminderTimeouts.keys()];
  const tasks = (lastState && lastState.tasks || []).filter(t => ids.includes(t.id));
  toast(ids.length
    ? '🔔 ' + tasks.map(t => t.title.slice(0, 20) + ' (' + new Date(t.reminder_at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) + ')').join(' | ')
    : 'אין תזכורות מוגדרות כרגע');
};

// Keep _checkReminders as alias for cr() helper
function _checkReminders() { _scheduleReminders(); }

function _fireReminder(task) {
  try { playSound(false); } catch (_) {}
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('⏰ ' + task.title, {
        body: task.notes || 'משימה לביצוע עכשיו',
        tag: task.id
      });
    } catch (_) {}
  }
  _showReminderPopup(task);
}

window.testReminder = () => _fireReminder({ id: 'test', title: 'בדיקת תזכורת', notes: 'אם אתה רואה את זה — זה עובד!' });
// cr() = clear reminders cache and recheck
window.cr = () => {
  const tasks = (lastState && lastState.tasks) || [];
  const withR = tasks.filter(t => t.reminder_at);
  localStorage.removeItem('carlos_reminders_shown');
  _checkReminders();
  toast('🔔 אופס (' + withR.length + ' תזכורות)');
};

function _showReminderPopup(task) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed','bottom:24px','right:24px','z-index:99999',
    'background:#1e1d38','border:2px solid #4a6aee','border-radius:14px',
    'padding:18px 20px','box-shadow:0 8px 32px rgba(0,0,0,.4)',
    'max-width:300px','min-width:240px','direction:rtl','font-family:inherit',
    'color:#e8e8f0','animation:none'
  ].join(';');
  el.innerHTML = `
    <div style="font-size:1.6rem;margin-bottom:6px">⏰</div>
    <div style="font-weight:700;font-size:1rem;margin-bottom:4px">${_esc(task.title)}</div>
    <div style="font-size:.82rem;color:#aaa;margin-bottom:14px;line-height:1.5">${_esc(task.notes || 'הגיע הזמן לבצע את המשימה')}</div>
    <div style="display:flex;gap:8px">
      <button class="reminder-dismiss" style="flex:1;padding:8px;border-radius:8px;background:#4a6aee;color:#fff;border:none;cursor:pointer;font-weight:700;font-size:.85rem">✅ הבנתי</button>
      <button class="reminder-snooze" style="flex:1;padding:8px;border-radius:8px;background:transparent;border:1px solid #444;color:#aaa;cursor:pointer;font-size:.85rem">😴 10 דקות</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.reminder-dismiss').addEventListener('click', () => el.remove());
  el.querySelector('.reminder-snooze').addEventListener('click', () => {
    el.remove();
    try {
      const shown = JSON.parse(localStorage.getItem('carlos_reminders_shown') || '{}');
      const due = new Date(task.reminder_at).getTime();
      delete shown[task.id + '_' + due];
      localStorage.setItem('carlos_reminders_shown', JSON.stringify(shown));
    } catch (_) {}
    setTimeout(() => _fireReminder(task), 10 * 60_000);
  });
  setTimeout(() => { if (el.isConnected) el.remove(); }, 300_000);
}

// If running locally (no Supabase auth layer) or auth already resolved → start now.
// If running in SaaS mode → auth guard calls window._startApp() after it resolves.
if (!window._supabase || window._userId) {
  _initApp();
} else {
  window._startApp = _initApp;
}
