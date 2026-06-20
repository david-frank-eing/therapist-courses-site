// Carlos Dashboard — client logic
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
    toast('שגיאה בחיבור לשרת: ' + e.message, false);
    throw e;
  }
}

// DOMAINS is populated dynamically from config.json via /api/state (userConfig.domains)
// Default fallback used before first state load
let DOMAINS = [{ id: 'unassigned', label: '⚪ לא משויך' }];

// תיקון timezone: שימוש בתאריך מקומי (לא UTC) למניעת קפיצת יום אחרי חצות
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
      { id: 'unassigned', label: '⚪ לא משויך' }
    ];
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
    msg.textContent = `🟢 עודכן ב-${lastRefresh.time} היום`;
    bar.classList.remove('hidden');
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
      if (!pid) throw new Error(r.error || 'no pid');
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
      const todayDate = new Date().toISOString().slice(0, 10);
      if (briefingDate !== todayDate) {
        staleHtml = `<div class="br-stale-warning">⚠️ בריפינג מ-${dd}.${mm} — לחץ 🔄 לעדכון</div>`;
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
      const line = raw.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
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
    ? summary.split('\n').filter(l => l.trim()).map(l => `<div>${l}</div>`).join('')
    : '<span class="muted-text">סיכום מיילים יופיע כאן אחרי הרענון הבוקר (07:00)<br><span class="br-hint">💡 לרענון מיידי — לחץ 🔄 בפינה</span></span>';
}

// (renderFocus moved to sidebar — see renderSbFocus below)

function dueLabel(task) {
  if (!task.due_date) return '';
  const tmrw = ilDate(1);
  const d = task.due_date;
  const day = d === todayStr() ? 'היום' : d === tmrw ? 'מחר' : d.slice(8, 10) + '/' + d.slice(5, 7);
  let time = '';
  if (task.reminder_at && task.reminder_at.length >= 16) time = ' ' + task.reminder_at.slice(11, 16);
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
          <span class="${t.priority === 'urgent' ? 'urgent' : ''}">${overdueMark}${t.priority === 'urgent' ? '⚠️ ' : ''}${t.title}</span>
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
          <span>${t.title}</span>
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
    ? (lastState.tasks || []).find(x => x.id === id)
    : ((lastState.content || {}).items || []).find(x => x.id === id);
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
    if (kind === 'task' && k === 'reminder_at' && item.reminder_at && item.reminder_at.length >= 16) return item.reminder_at.slice(11, 16);
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
    toast('✓ עודכן');
    loadState();
  });
  const del = form.querySelector('.ef-del');
  if (del) del.addEventListener('click', async () => {
    await api('/api/task', { action: 'toggle', id });
    toast('🗑️ המשימה הוסרה');
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
        : `<div class="mig-file-icon">📎</div>`}
      <span class="mig-name" title="${displayName}">${displayName}</span>
      <span class="mig-path" title="${fullPath}">uploads\\${fname.slice(0,20)}${fname.length>20?'…':''}</span>
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
        const time = t.reminder_at && t.reminder_at.length >= 16 ? ' · ' + t.reminder_at.slice(11, 16) : '';
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

$('#add-tomorrow').addEventListener('click', async () => {
  const v = document.getElementById('tomorrow-task').value.trim();
  if (!v) { toast('כתוב משימה קודם', false); return; }
  const tmrw = tomorrowStr();
  const time = document.getElementById('tomorrow-time').value;
  const payload = { action: 'add', title: v, due_date: tmrw };
  if (time) payload.reminder_at = tmrw + 'T' + time;
  await api('/api/task', payload);
  document.getElementById('tomorrow-task').value = '';
  document.getElementById('tomorrow-time').value = '';
  toast('✓ נוסף למחר — ' + (time ? time : 'ללא שעה'));
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
  const sessions = (timeLog.sessions || []).filter(s => (s.ended_at || '').slice(0, 10) === date);
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
        const isImg = firstThumb && /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(firstThumb);
        const thumbHtml = thumbUrls.length
          ? (isImg
              ? `<img src="${firstThumb}" class="c-item-thumb" title="${thumbUrls.length} תמונות">`
              : `<span class="c-img-badge">📎 ${thumbUrls.length}</span>`)
          : '';
        return `<div class="c-item" data-id="${item.id}">
          ${thumbHtml}
          <span class="c-item-title">${icon} ${item.title || '(ללא כותרת)'}</span>
          <span class="c-domain">${domainLabel(item.domain)}</span>
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
  await api('/api/content/add', { type, domain, title });
  $('#new-content-title').value = '';
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
  $('#task-stats').textContent = `✅ הושלמו: ${s.today} היום · ${s.week} השבוע · ${s.total} בסה"כ`;
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
  const now = Date.now();
  const ageOf = iso => iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : 0;
  const stale = iso => iso && (now - new Date(iso).getTime() > ms);

  const tasks = (state.tasks || []).filter(t => stale(t.created_at));
  const leads = (state.events || []).filter(e => e.status === 'lead' && stale(e.updated_at || e.created_at));
  const ideas = ((state.content || {}).items || []).filter(c => c.status === 'idea' && stale(c.created_at));

  if (!(tasks.length + leads.length + ideas.length)) {
    $('#open-loops-content').innerHTML = '<div class="muted-text">הכל מתעדכן 🎯 אין דברים תקועים מעל 14 ימים</div>';
    return;
  }
  const group = (title, items, render) => items.length ? `<div class="ol-group">
    <div class="ol-title">${title} (${items.length})</div>
    ${items.map(render).join('')}
  </div>` : '';

  $('#open-loops-content').innerHTML =
    group('⏰ משימות ישנות', tasks, t => `<div class="ol-item"><span>${t.title}</span><span class="ol-age">${ageOf(t.created_at)} ימים</span></div>`) +
    group('🟡 לידים תקועים', leads, e => `<div class="ol-item"><span>${[e.date, e.contact].filter(Boolean).join(' · ') || '(אירוע)'}</span><span class="ol-age">${ageOf(e.updated_at || e.created_at)} ימים</span></div>`) +
    group('💡 רעיונות לא קודמו', ideas, c => `<div class="ol-item"><span>${c.title || '(ללא כותרת)'}</span><span class="ol-age">${ageOf(c.created_at)} ימים</span></div>`);
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
  const v = $('#new-task').value.trim();
  if (!v) { toast('כתוב משימה קודם', false); return; }
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
  toast('✓ ' + (date ? 'משימה נקבעה ל-' + (date === todayStr() ? 'היום' : date) + (time ? ' ' + time : '') : 'המשימה נוספה'));
  loadState();
});
$('#new-task').addEventListener('keydown', e => { if (e.key === 'Enter') $('#add-task').click(); });

// ---------- Journal ----------
$('#journal-save').addEventListener('click', async () => {
  const v = $('#journal-text').value.trim();
  if (!v) { toast('כתוב משהו קודם', false); return; }
  await api('/api/journal', { text: v });
  $('#journal-text').value = '';
  toast('✓ נשמר ליומן האישי של היום');
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
  el.loop = (loop && type === 'chime');           // לולאה רק כשהטיימר מסיים, לא בתצוגה מקדימה
  try { el.currentTime = 0; } catch (e) {}
  Promise.resolve(el.play()).catch(() =>
    toast('הדפדפן חסם את הצליל — לחץ פעם אחת על הדף ונסה שוב', false));
}

function silenceChime() {
  const el = document.getElementById('snd-chime');
  if (el) { el.loop = false; el.pause(); try { el.currentTime = 0; } catch (e) {} }
  $('#attrib-silence').classList.add('hidden');
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
  if (timerMode === 'timer') {
    plannedTotal = configuredSeconds();
    if (plannedTotal <= 0) { toast('קבע דקות או שניות', false); return; }
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
    return `<label>${label}<textarea name="${name}" placeholder="${ph}">${v}</textarea></label>`;
  }
  if (type === 'select' && options) {
    const opts = options.map(([val, txt]) => `<option value="${val}"${val === value ? ' selected' : ''}>${txt}</option>`).join('');
    return `<label>${label}<select name="${name}">${opts}</select></label>`;
  }
  if (type === 'number') return `<label>${label}<input type="number" name="${name}" value="${v}"></label>`;
  if (type === 'date') return `<label>${label}<input type="date" name="${name}" value="${v}"></label>`;
  if (type === 'time') return `<label>${label}<input type="time" name="${name}" value="${v}"></label>`;
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
  window.open('https://calendar.google.com/calendar/u/0/r/week', 'gcal',
    'width=960,height=720,left=120,top=80');
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
    <div class="sbf-form-row">
      <input type="text" id="sbf-emoji" value="${it.emoji || '🎯'}" maxlength="2" placeholder="🎯">
      <input type="text" id="sbf-text"  value="${(it.text || '').replace(/"/g,'&quot;')}" placeholder="פוקוס להיום...">
    </div>
    <div class="sbf-form-btns">
      <button id="sbf-save">💾 שמור</button>
      <button id="sbf-cancel" class="sbf-cancel">ביטול</button>
    </div>`;
  body.appendChild(form);
  form.querySelector('#sbf-text').focus();

  form.querySelector('#sbf-cancel').addEventListener('click', () => loadState());
  const doSave = async () => {
    const emoji = form.querySelector('#sbf-emoji').value.trim() || '•';
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
const PB_LABELS = {
  'treatments': '💆 טיפולים',
  'dj-events':  '🎵 DJ אירועים',
  'product':    '🚀 כלי למטפלים',
  'learning':   '📚 לימוד מוזיקה'
};

async function openPlaybook(domain) {
  const modal = document.getElementById('playbook-modal');
  const titleEl = document.getElementById('pb-modal-title');
  const bodyEl = document.getElementById('pb-modal-body');
  if (!modal) return;
  titleEl.textContent = '📖 ' + (PB_LABELS[domain] || domain);
  bodyEl.innerHTML = '<div class="muted-text">טוען...</div>';
  modal.classList.remove('hidden');
  try {
    const r = await fetch('/api/playbook/' + domain);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const md = await r.text();
    bodyEl.innerHTML = mdToHtml(md);
  } catch (e) {
    bodyEl.innerHTML = `<div class="muted-text">שגיאה בטעינת הפלייבוק: ${e.message}</div>`;
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

// Floating chat bubble removed — use sidebar "שאל קרלוס" panel instead

// ---------- Help Modal ----------
const HELP_SECTIONS = [
  { icon: '🎯', title: 'מה זה הדאשבורד?', body: `כלי ניהול יומי אישי — משימות, לקוחות, הרגלים, תוכן, וזמן, הכל במקום אחד.<br>
    הכל רץ <strong>מקומית על המחשב שלך</strong> — לא בענן, הנתונים שמורים אצלך בלבד.<br>
    הפעלה: לחיצה כפולה על <strong>start-dashboard.bat</strong> ← הדפדפן נפתח אוטומטית.` },

  { icon: '📌', title: 'משימות', body: `<strong>הוספה:</strong> כתוב בשדה "משימה חדשה" + לחץ "הוסף". אפשר לצרף תאריך ושעה.<br>
    <strong>השלמה:</strong> לחץ על ✓ — המשימה עוברת לסטריקאות בתחתית (עם אפשרות ביטול).<br>
    <strong>עריכה:</strong> לחץ ✏️ ליד משימה — ניתן לשנות כותרת, תאריך, הערות, או למחוק.<br>
    <strong>מחר:</strong> קטע נפרד לתכנון משימות של מחר. משימה עם תאריך מחר לא תופיע בקטע הנוכחי.<br>
    <strong>חיפוש:</strong> שדה 🔍 מסנן בזמן אמת לפי שם המשימה.<br>
    <strong>⚠️ אדום</strong> = משימה שעבר תאריכה — יש לטפל בה.` },

  { icon: '👥', title: 'לקוחות ואירועים', body: `<strong>לשוניות:</strong> 💆 לקוחות | 🎵 אירועים — מועברים בלחיצה.<br>
    <strong>הוספה ידנית:</strong> "+ הוסף ידנית" פותח טופס מפורט. לקוח: שם, עיר, טלפון, מייל, מקור, סוג טיפול. אירוע: תאריך, מיקום, אנשים, תשלום, סגנון מוזיקלי, סטטוס.<br>
    <strong>תמונת פרופיל:</strong> בטופס הלקוח — לחץ "📷 העלה תמונה" (עד 20MB).<br>
    <strong>לכידת שיחה:</strong> לחץ "🗣️ לכידת שיחה" ← כתוב בחופשיות מה דיברתם — המערכת שואבת אוטומטית שם, טלפון, עיר.<br>
    <strong>משימות צמודות:</strong> בכל כרטיס — "📋 משימות" לניהול משימות ספציפיות ללקוח/אירוע.<br>
    <strong>חיפוש:</strong> שדה 🔍 מחפש לפי שם, טלפון, עיר.` },

  { icon: '🌱', title: 'הרגלים', body: `לחץ ✓ על הרגל שביצעת היום — הוא יסומן כ"הושלם".<br>
    לחץ שוב לביטול הסימון.<br>
    כל הרגל מציג: <strong>X/7 שבוע</strong> · <strong>X/28 חודש</strong> · <strong>🔥 רצף ימים</strong>.<br>
    קטע "📆 הרגלים — שבוע שעבר" מציג טבלת שבוע מלאה לכל הרגל.` },

  { icon: '⏱️', title: 'טיימר', body: `הווידג'ט הקטן בפינה השמאלית למטה.<br>
    <strong>סטופר:</strong> ▶ התחל → ■ עצור → בחר תחום → 💾 שמור זמן.<br>
    <strong>טיימר:</strong> הגדר דקות/שניות → ▶ התחל → צלצול בסיום → שמור זמן.<br>
    <strong>➕ ידני:</strong> הוסף זמן שעבדת בלי שהטיימר רץ.<br>
    כל הזמן שנרשם מופיע בקטע "⏱️ זמן שנרשם היום".` },

  { icon: '📲', title: 'תוכן השבוע', body: `נהל רילסים ופוסטים בשלבים: <strong>רעיון → טיוטה → מוכן → פורסם</strong>.<br>
    לחץ על הסטטוס כדי להתקדם שלב. "פורסם" מעדכן אוטומטית את מכסת השבוע.<br>
    ✏️ לעריכת תוכן הפוסט, קישור Docs, תאריך תזמון, קובץ מדיה מצורף.<br>
    שיוך לתחום: 💆 טיפולים / 🎵 אירועים / 🚀 כלי / ⚪ כללי.` },

  { icon: '📊', title: 'מכסות שבועיות ויומיות', body: `<strong>שבועי (📈):</strong> יעדים לשבוע — רילסים, פוסטים, שעות, שיווק, וכו\'.<br>
    <strong>יומי (📊):</strong> אותם יעדים אבל ליום הנוכחי — מתאפסים כל בוקר.<br>
    ✏️ לשינוי יעד בכל שורה.<br>
    <strong>איפוס שבועי:</strong> כל ראשון בשבוע כל המכסות מתאפסות אוטומטית.` },

  { icon: '🌅', title: 'בריפינג בוקר', body: `מציג סיכום שנשמר בקובץ <code>sync/morning-briefing.md</code>.<br>
    כותב לשם בצורה אוטומטית כשקרלוס מייצר בריפינג (מחייב חיבור).<br>
    ניתן גם לערוך את הקובץ ישירות בנוטפד.` },

  { icon: '📧', title: 'סיכום מיילים', body: `מציג סיכום שנשמר בקובץ <code>sync/email-summary.md</code>.<br>
    מתעדכן אוטומטית כשמתחברים ל-Gmail דרך Composio.<br>
    ניתן לכתוב בקובץ ידנית כל סיכום שתרצה.` },

  { icon: '📅', title: 'יומן Google Calendar', body: `<strong>סיידבר — יומן היום:</strong> מציג אירועים מ-<code>sync/calendar-today.json</code>.<br>
    לחץ 🔄 לרענון ידני (מחייב חיבור ל-Google Calendar).<br>
    ניתן לכתוב לקובץ ידנית: <code>{"date":"YYYY-MM-DD","events":[{"time":"09:00","title":"פגישה"}]}</code>` },

  { icon: '📝', title: 'יומן יומי', body: `כתוב מחשבות, הרהורים, רעיונות, או סיכום יום.<br>
    לחץ "שמור ליומן" — הטקסט מצטרף לקובץ <code>journal/YYYY-MM-DD.md</code>.<br>
    קובץ חדש לכל יום. ניתן לפתוח ולקרוא בנוטפד.` },

  { icon: '📖', title: 'פלייבוקים', body: `מדריכי פעולה לפי תחום עסקי.<br>
    לחץ על כפתור תחום בסיידבר (💆 / 🎵 / 🚀 / 📚) לפתיחת המדריך.<br>
    קבצי המדריך נמצאים ב: <code>domains/[תחום]/playbook.md</code><br>
    ניתן לערוך אותם בנוטפד — הם ייטענו עדכניים בכל פתיחה.` },

  { icon: '📄', title: 'ייצוא PDF', body: `לחץ 📄 בכותרת — הדפדפן פותח חלון הדפסה.<br>
    <strong>כל הסקשנים נפתחים אוטומטית</strong> לפני ההדפסה.<br>
    בחלון ההדפסה: "שמור כ-PDF" ← מייצר קובץ PDF מסודר.<br>
    הסיידבר, הטיימר, וכפתורי הפעולה מוסתרים בהדפסה.` },

  { icon: '⚙️', title: 'הגדרות', body: `לחץ ⚙️ בכותרת לפתיחת ההגדרות.<br>
    <strong>שם:</strong> השם שמוצג בברכה ("בוקר טוב דוד").<br>
    <strong>שם העוזר:</strong> מוצג בכותרת הטאב ובפוטר ("קרלוס דאשבורד").<br>
    לחץ 💾 שמור — השינויים יופיעו בטעינה הבאה.<br>
    <em>הגדרות מתקדמות (תחומים, יעדים) — ערוך את <code>config.json</code> ו-<code>weekly_plan.json</code> ישירות.</em>` },

  { icon: '🔧', title: 'הגדרה ראשונית / קבצי מערכת', body: `<strong>config.json</strong> — שם, נתיבים, תחומים עסקיים.<br>
    <strong>weekly_plan.json</strong> — יעדים שבועיים לכל מכסה.<br>
    <strong>habits.json</strong> — הוסף/הסר הרגלים: <code>{"id":"h1","emoji":"🏃","label":"ספורט"}</code><br>
    <strong>תיקיות:</strong> <code>clients/</code> לקוחות · <code>events/</code> אירועים · <code>journal/</code> יומן<br>
    <strong>לשינויים בקובצי JSON</strong> — פתח בנוטפד, שמור, ורענן את הדפדפן.` }
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
  bodyEl.innerHTML = '<div class="muted-text">טוען...</div>';
  try {
    const qs = [];
    if (from) qs.push('from=' + from);
    if (to)   qs.push('to=' + to);
    const r = await fetch('/api/tasks/history' + (qs.length ? '?' + qs.join('&') : ''));
    const data = await r.json();
    renderHistory(data.tasks || []);
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

async function openSettings() {
  const modal  = document.getElementById('settings-modal');
  const bodyEl = document.getElementById('settings-body');
  if (!modal || !bodyEl) return;
  modal.classList.remove('hidden');
  bodyEl.innerHTML = '<div class="muted-text">טוען...</div>';
  try {
    const s = await api('/api/settings');
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
  const btn = document.getElementById('conn-google-refresh');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ מרענן...'; }
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const r = await fetch('/.netlify/functions/google-data', {
      headers: { Authorization: 'Bearer ' + session.access_token }
    });
    const d = await r.json();
    if (d.connected) {
      toast('✓ יומן ומיילים עודכנו');
      loadState();
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

    <div class="settings-section connections-section">
      <div class="settings-section-title">🔌 חיבורים</div>
      <div id="connections-body" class="connections-body"></div>
    </div>

    <div class="settings-actions">
      <button id="settings-save">💾 שמור</button>
      <button id="settings-cancel-btn" class="settings-cancel-btn">ביטול</button>
    </div>`;

  // ── Habits section ────────────────────────────────────────
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
function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

function renderTunnelBar(el, running, tunnelUrl) {
  if (running && tunnelUrl) {
    el.innerHTML = `<div class="bk-tunnel-active">
      <span>🟢 גישה ציבורית פעילה</span>
      <span class="bk-tunnel-url">${_esc(tunnelUrl + '/book')}</span>
      <button id="bk-copy-tunnel" class="bk-tunnel-copy-btn">📋 העתק</button>
      <button id="bk-stop-tunnel" class="bk-tunnel-stop-btn">⏹ עצור</button>
    </div>`;
    document.getElementById('bk-copy-tunnel')?.addEventListener('click', () => {
      navigator.clipboard.writeText(tunnelUrl + '/book').then(() => toast('קישור הועתק ✓'));
    });
    document.getElementById('bk-stop-tunnel')?.addEventListener('click', async () => {
      await api('/api/tunnel/stop', {});
      renderTunnelBar(el, false, null);
      toast('גישה ציבורית הופסקה');
    });
  } else {
    const cfAvail = window._cfAvailable !== false;
    el.innerHTML = cfAvail
      ? `<div class="bk-tunnel-off">
          <span>🔴 גישה ציבורית כבויה — מטופלים לא יוכלו לגשת לדף הזימון</span>
          <button id="bk-start-tunnel" class="bk-tunnel-start-btn">🌐 הפעל עכשיו</button>
        </div>`
      : `<div class="bk-tunnel-off">
          <span class="muted-text">🔌 גישה ציבורית לא זמינה — <code>cloudflared.exe</code> לא נמצא בתיקיית קרלוס</span>
        </div>`;
    document.getElementById('bk-start-tunnel')?.addEventListener('click', async () => {
      el.innerHTML = '<div class="bk-tunnel-loading">⏳ מתחבר לשרתי Cloudflare... (בדרך כלל 10–15 שניות)</div>';
      try {
        const r = await api('/api/tunnel/start', {});
        if (r && r.url) {
          navigator.clipboard.writeText(r.url + '/book').catch(() => {});
          renderTunnelBar(el, true, r.url);
          toast('🌐 גישה ציבורית פעילה — קישור הועתק ✓');
        } else {
          renderTunnelBar(el, false, null);
          toast('שגיאה בהפעלה — נסה שוב', false);
        }
      } catch(e) {
        renderTunnelBar(el, false, null);
        toast('שגיאה — נסה שוב', false);
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

  // ── Tunnel control UI ──
  {
    let urlBar = document.getElementById('bk-url-bar');
    if (!urlBar) {
      urlBar = document.createElement('div');
      urlBar.id = 'bk-url-bar';
      upcomingEl.parentElement.insertBefore(urlBar, upcomingEl);
    }
    api('/api/tunnel/status').then(status => renderTunnelBar(urlBar, status.running, status.url));
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
    const currentPublicUrl = (prof.public_url || '').replace(/\/$/, '');
    body.innerHTML = `
      <h3 style="margin:0 0 14px;color:var(--text)">✏️ ערוך דף ציבורי</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label style="color:var(--text-muted);font-size:.85rem">🔗 קישור ציבורי (Cloudflare / ngrok)</label>
        <input id="bkp-puburl" class="settings-input" value="${_esc(currentPublicUrl)}" placeholder="https://xxx.trycloudflare.com">
        <div style="font-size:.76rem;color:var(--text-muted);margin-top:-6px;line-height:1.4">
          הכנס את ה-URL של ה-Cloudflare tunnel שלך (בלי /book בסוף).<br>
          כפתור 🔗 ישתמש בזה בעת העתקת הקישור למטופלים.
        </div>
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
        <label style="color:var(--text-muted);font-size:.85rem">קישור לתמונה (URL, אופציונלי)</label>
        <input id="bkp-photo" class="settings-input" value="${_esc(prof.photo_url || '')}">
        <button id="bkp-save" style="margin-top:8px;background:var(--accent);color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:.95rem">💾 שמור</button>
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
      toast('פרופיל עודכן ✓');
    });
  });
}

document.getElementById('copy-booking-link')?.addEventListener('click', () => {
  api('/api/tunnel/status').then(status => {
    const url = status.url ? status.url + '/book' : window.location.origin + '/book';
    navigator.clipboard.writeText(url)
      .then(() => toast(status.url ? 'קישור הועתק ✓' : 'הועתק (localhost) — הפעל גישה ציבורית בסקציית הזימונים'))
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
    toast('✅ Google חובר בהצלחה! מרענן נתונים...');
    setTimeout(_googleRefreshData, 800);
  } else if (urlParams.get('google_error')) {
    history.replaceState({}, '', window.location.pathname);
    toast('שגיאה בחיבור Google: ' + decodeURIComponent(urlParams.get('google_error')), false);
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

// If running locally (no Supabase auth layer) or auth already resolved → start now.
// If running in SaaS mode → auth guard calls window._startApp() after it resolves.
if (!window._supabase || window._userId) {
  _initApp();
} else {
  window._startApp = _initApp;
}
