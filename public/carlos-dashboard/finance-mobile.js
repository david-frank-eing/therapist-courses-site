// finance-mobile.js — "💰 כספים" on the phone (Carlos finance, plan 6).
// Shows the snapshot the PC uploads (finance_state) and records taps as finance_requests.
// It never computes money and never talks to the PC: the PC picks up taps within about a minute.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ils = v => (v == null || v === '' || isNaN(Number(v))) ? '—'
    : '₪ ' + Number(v).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v, cur) => (!cur || cur === 'ILS') ? ils(v) : (v == null ? '—' : `${Number(v).toFixed(2)} ${esc(cur)}`);
  const dm = s => { if (!s) return ''; const [, m, d] = String(s).slice(0, 10).split('-'); return `${+d}/${+m}`; };
  const pctOf = (v, total) => total ? (v / total * 100).toFixed(1) + '%' : '';
  const hm = d => d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: 'numeric', minute: '2-digit' });

  const HEB_MONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const CHART_VIEWS = [['domain', 'לפי תחום'], ['category', 'לפי קטגוריה'], ['month', 'לפי חודש']];
  const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
  const OTHER_COLOR = '#8a8aa0', MAX_SLICES = 7;
  const DOMAIN_COLOR = { 'טיפולים': SERIES[2], 'DJ': SERIES[6], 'משותף': SERIES[1], 'פרטי': SERIES[0], 'לא סווג': OTHER_COLOR };
  const PC_LATE_MIN = 5;

  function deadlineText(p) {
    const n = p.days_left, d = p.deadline_label;
    if (n > 1) return `עוד ${n} ימים עד ${d}`;
    if (n === 1) return `מחר ה-${d}`;
    if (n === 0) return `היום ה-${d}`;
    return `עבר ה-${d}, לפני ${-n} ימים`;
  }

  function pcStatus(row, now = new Date()) {
    if (!row || !row.pc_seen_at) return 'המחשב עוד לא העלה נתונים. צריך שהבוט של קרלוס ירוץ במחשב';
    const seen = new Date(row.pc_seen_at);
    if ((now - seen) / 60000 <= PC_LATE_MIN) return null;
    const day = seen.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) === now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    return `המחשב לא מחובר מאז ${day ? '' : dm(seen.toISOString()) + ' '}${hm(seen)}. לחיצות יחכו לו`;
  }

  function packageText(pkg) {
    if (pkg.state === 'built') return `החבילה מוכנה במחשב${pkg.files ? ` (${pkg.files} קבצים)` : ''}, עוד לא נשלחה`;
    if (pkg.state === 'stale') return 'משהו השתנה אחרי הבנייה. בנה שוב במחשב';
    if (pkg.state === 'sent') return `נשלחה לרו"ח ב-${dm(pkg.sent_at)}${pkg.sent_how === 'auto' ? ' (זוהה אוטומטית)' : ''}`;
    return 'החבילה עוד לא נבנתה. בונים במחשב';
  }

  const canMarkSent = snap => !snap.locked && !!snap.package && snap.package.state === 'built';
  const requestPayload = (fields, snap) => Object.assign({}, fields, { period_key: snap.period.key });

  // up to 7 slices; the rest become "שאר" (summed in agorot so the total stays exact)
  function slices(rows, colorOf) {
    const pos = rows.filter(r => r.total > 0);
    const shown = pos.length > MAX_SLICES ? pos.slice(0, MAX_SLICES - 1) : pos;
    const rest = pos.slice(shown.length);
    const out = shown.map(r => ({ name: r.name, total: r.total, color: colorOf(r.name), key: r.name }));
    if (rest.length) out.push({ name: `שאר (${rest.length})`, total: rest.reduce((a, r) => a + Math.round(r.total * 100), 0) / 100, color: OTHER_COLOR, key: null });
    return out;
  }

  function donut(parts, total, clickable, domainFilter) {
    const R = 92, r = 58, C = 110, GAP = 0.012;
    const sum = parts.reduce((a, p) => a + p.total, 0);
    const pt = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)} ${(C + rad * Math.sin(a)).toFixed(2)}`;
    let a0 = -Math.PI / 2;
    const arcs = parts.map(p => {
      const frac = sum ? p.total / sum : 0, a1 = a0 + frac * 2 * Math.PI;
      let d;
      if (frac >= 0.9999) {
        d = `M ${pt(R, 0)} A ${R} ${R} 0 1 1 ${pt(R, Math.PI)} A ${R} ${R} 0 1 1 ${pt(R, 0)} Z M ${pt(r, 0)} A ${r} ${r} 0 1 0 ${pt(r, Math.PI)} A ${r} ${r} 0 1 0 ${pt(r, 0)} Z`;
      } else {
        const s = a0 + (parts.length > 1 ? GAP : 0), e = Math.max(s, a1 - (parts.length > 1 ? GAP : 0)), big = e - s > Math.PI ? 1 : 0;
        d = `M ${pt(R, s)} A ${R} ${R} 0 ${big} 1 ${pt(R, e)} L ${pt(r, e)} A ${r} ${r} 0 ${big} 0 ${pt(r, s)} Z`;
      }
      const mid = (a0 + a1) / 2;
      const label = frac >= 0.07 ? `<text x="${(C + 75 * Math.cos(mid)).toFixed(1)}" y="${(C + 75 * Math.sin(mid) + 4).toFixed(1)}" class="slice-l">${Math.round(frac * 100)}%</text>` : '';
      a0 = a1;
      const hit = clickable && p.key ? ` data-slice="${esc(p.key)}" class="hit${p.key === domainFilter ? ' on' : ''}"` : '';
      return `<g${hit}><path d="${d}" fill="${p.color}" fill-rule="evenodd"><title>${esc(p.name)}: ${ils(p.total)} · ${pctOf(p.total, total)}</title></path>${label}</g>`;
    }).join('');
    const legend = parts.map(p => `<li${clickable && p.key ? ` data-slice="${esc(p.key)}" class="hit"` : ''}><i style="background:${p.color}"></i>
      <span class="ln">${esc(p.name)}</span><b class="num">${ils(p.total)}</b><span class="num dim">${pctOf(p.total, total)}</span></li>`).join('');
    const empty = parts.length ? '' : '<div class="dim">אין הוצאות בסינון הזה.</div>';
    return `<div class="fm-chart"><svg viewBox="0 0 220 220" role="img" aria-label="עוגה">${arcs}
      <text x="110" y="104" class="c-l">סה"כ הוצאות</text><text x="110" y="126" class="c-v">${ils(total)}</text></svg>
      <ul class="fm-legend">${legend}</ul>${empty}</div>`;
  }

  function bars(rows, total) {
    if (!rows.length) return '<div class="dim">אין הוצאות בסינון הזה.</div>';
    const W = 130, H = 170, top = 28, max = Math.max(...rows.map(r => r.total), 0.01);
    const cols = rows.map((r, i) => {
      const h = Math.max(0, r.total) / max * (H - top), x = 20 + i * W, y = H - h;
      const [yy, mm] = r.name.split('-');
      const monthName = esc(HEB_MONTHS[+mm] || '');
      return `<g><rect x="${x + 30}" y="${y.toFixed(1)}" width="${W - 60}" height="${h.toFixed(1)}" rx="4" fill="${SERIES[0]}"><title>${monthName} ${esc(yy)}: ${ils(r.total)}</title></rect>
        <text x="${x + W / 2}" y="${(y - 8).toFixed(1)}" class="bar-v">${ils(r.total)}</text>
        <text x="${x + W / 2}" y="${H + 20}" class="bar-l">${monthName}</text></g>`;
    }).join('');
    const width = 40 + rows.length * W;
    return `<div class="fm-chart"><svg viewBox="0 0 ${width} ${H + 30}" role="img" aria-label="עמודות לפי חודש">
      <line x1="10" x2="${width - 10}" y1="${H}" y2="${H}" class="axis"/>${cols}</svg></div>`;
  }

  const pure = { esc, ils, money, dm, pctOf, deadlineText, pcStatus, packageText, canMarkSent, requestPayload,
    slices, donut, bars, SERIES, OTHER_COLOR, DOMAIN_COLOR, CHART_VIEWS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ── DOM (Task 8) ──
  const T = window;
  const $ = id => document.getElementById(id);
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const POLL_MS = 4000, POLL_MAX_MS = 180000, SNAP_WAIT_MS = 30000;
  let ROW = null, SNAP = null, tab = store.get('carlos-fm-tab', 'pkg'), view = store.get('carlos-fm-chart', 'domain');
  let domainFilter = 'הכל';
  const waiting = new Map();        // request id -> {cmd, payload, since, warned}
  const openCats = new Set();
  let pollTimer = null;             // the one shared poller for everything in `waiting`

  const sb = () => T._supabase;
  const say = (msg, ok) => (typeof T.toast === 'function' ? T.toast(msg, ok, 4000) : alert(msg));
  const isWaiting = (cmd, match) => [...waiting.values()].some(w => w.cmd === cmd && Object.keys(match).every(k => w.payload[k] === match[k]));
  const isOpen = () => !!($('fm') && !$('fm').classList.contains('hidden'));

  function shell() {
    if ($('fm')) return;
    const el = document.createElement('div');
    el.id = 'fm'; el.className = 'fm hidden'; el.dir = 'rtl';
    el.innerHTML = `<div class="fm-top"><b>💰 כספים</b><span id="fm-period" class="dim"></span><button class="fm-x" data-fm="close" aria-label="סגור">✕</button></div>
      <div class="fm-tabs"><button data-fmtab="pkg">החבילה</button><button data-fmtab="money">לאן הולך הכסף</button></div>
      <div id="fm-body" class="fm-body"></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
  }

  async function load() {
    const { data, error } = await sb().from('finance_state').select('data,made_at,pc_seen_at').eq('user_id', T._userId).maybeSingle();
    if (error) throw error;
    ROW = data; SNAP = data && data.data;
    const { data: open } = await sb().from('finance_requests').select('id,cmd,payload,status,created_at')
      .eq('user_id', T._userId).in('status', ['pending', 'running']).order('created_at');
    const openIds = new Set((open || []).map(r => r.id));
    for (const id of [...waiting.keys()]) if (!openIds.has(id)) waiting.delete(id);   // no longer pending/running
    (open || []).forEach(r => {
      if (!waiting.has(r.id)) waiting.set(r.id, { cmd: r.cmd, payload: r.payload || {}, since: Date.parse(r.created_at) || Date.now(), warned: false });
    });
  }

  async function open() {
    if (!T._isAdmin || !sb()) return;
    shell();
    $('fm').classList.remove('hidden');
    document.body.classList.add('fm-open');
    $('fm-body').innerHTML = '<div class="fm-card dim">טוען…</div>';
    try { await load(); render(); startPoll(); } catch (e) { $('fm-body').innerHTML = `<div class="fm-card err">לא הצלחתי לטעון: ${esc(e.message || e)}</div>`; }
  }

  function close() {
    $('fm').classList.add('hidden');
    document.body.classList.remove('fm-open');
    stopPoll();
  }

  function render() {
    document.querySelectorAll('#fm [data-fmtab]').forEach(b => b.classList.toggle('on', b.dataset.fmtab === tab));
    const late = pcStatus(ROW);
    const lateHtml = late ? `<div class="fm-warn">${esc(late)}</div>` : '';
    const waitHtml = waiting.size ? `<div class="fm-wait">⏳ ${waiting.size === 1 ? 'לחיצה אחת ממתינה' : waiting.size + ' לחיצות ממתינות'} למחשב (בדרך כלל עד דקה)</div>` : '';
    if (!SNAP) { $('fm-period').textContent = ''; $('fm-body').innerHTML = lateHtml || '<div class="fm-card dim">אין נתונים עדיין.</div>'; return; }
    $('fm-period').textContent = SNAP.period.label;
    $('fm-body').innerHTML = lateHtml + waitHtml + (tab === 'money' ? moneyHtml() : packageHtml());
  }

  function packageHtml() {
    const s = SNAP;
    const head = `<div class="fm-card"><div class="fm-big">${esc(deadlineText(s.period))}</div>
      <div>${esc(packageText(s.package))}</div>
      ${canMarkSent(s) ? `<button class="fm-btn" data-fm="sent" ${isWaiting('mark-sent', {}) ? 'disabled' : ''}>${isWaiting('mark-sent', {}) ? 'ממתין למחשב…' : 'סמן כנשלח'}</button>` : ''}
      ${s.in_check ? `<div class="dim">🔍 ${s.in_check} בבדיקה (במחשב)</div>` : ''}</div>`;
    if (s.locked) return head;
    if (s.stop) return head + `<div class="fm-card err">${esc(s.stop)}</div>`;
    const receipts = (s.receipts || []).map(r => {
      const busy = isWaiting('receipt-confirm', { id: r.id }) || isWaiting('receipt-discard', { id: r.id });
      const buttons = busy ? '<span class="dim">ממתין למחשב…</span>'
        : `${r.problems.length ? `<span class="dim">חסר: ${esc(r.problems.join(', '))}. לתקן בטלגרם</span>`
          : `<button class="fm-btn" data-fm="ok" data-id="${esc(r.id)}" data-ver="${esc(r.ver)}">✓ נכון</button>`}
           <button class="fm-btn ghost" data-fm="discard" data-id="${esc(r.id)}">🗑 לא קבלה</button>`;
      return `<li><div><b>${esc(r.vendor || '—')}</b><div class="dim">${dm(r.date)} · ${money(r.total, r.currency)}</div></div><div class="fm-row-btns">${buttons}</div></li>`;
    }).join('');
    const missing = (s.missing || []).map(m => `<li><div><b>${esc(m.merchant)}</b><div class="dim">${dm(m.date)} · ${esc(m.via)}</div></div><span class="num">${ils(m.amount)}</span></li>`).join('');
    return head
      + `<div class="fm-card"><h3>קבלות מטלגרם לאישור (${(s.receipts || []).length})</h3>${receipts ? `<ul class="fm-list">${receipts}</ul>` : '<div class="dim">אין.</div>'}</div>`
      + `<div class="fm-card"><h3>חשבוניות חסרות (${(s.missing || []).length})</h3>${missing ? `<ul class="fm-list">${missing}</ul>` : '<div class="dim">אין חסרות.</div>'}</div>`
      + (s.remaining ? `<div class="dim fm-foot">עוד ${s.remaining} החלטות מחכות במסך במחשב.</div>` : '');
  }

  const options = (list, current) => list.map(n => `<option ${n === current ? 'selected' : ''}>${esc(n)}</option>`).join('');

  function moneyHtml() {
    const res = SNAP.spending;
    if (!res || res.stop) return `<div class="fm-card err">${esc((res && res.stop) || 'אין נתונים')}</div>`;
    if (!res.views[domainFilter]) domainFilter = 'הכל';
    if (!CHART_VIEWS.some(([k]) => k === view)) view = 'domain';
    const v = res.views[domainFilter], t = v.totals;
    const catColor = {};
    (res.views['הכל'].by_category || []).forEach((c, i) => { catColor[c.name] = i < SERIES.length ? SERIES[i] : OTHER_COLOR; });
    const byDomain = domainFilter === 'הכל' ? res.by_domain : res.by_domain.filter(d => d.name === domainFilter);
    const chart = view === 'month' ? bars(v.by_month, t.spend)
      : view === 'category' ? donut(slices(v.by_category, n => catColor[n] || OTHER_COLOR), t.spend, false, domainFilter)
        : donut(slices(byDomain, n => DOMAIN_COLOR[n] || OTHER_COLOR), t.spend, true, domainFilter);
    const chips = ['הכל'].concat(res.domains).map(d => `<button data-fmfilter="${esc(d)}" class="fm-chip ${d === domainFilter ? 'on' : ''}">${esc(d)}</button>`).join('');
    const seg = CHART_VIEWS.map(([k, l]) => `<button data-fmview="${k}" class="${k === view ? 'on' : ''}">${l}</button>`).join('');
    const cats = v.categories.map(c => {
      const rows = !openCats.has(c.name) ? '' : `<ul class="fm-list">${c.rows.map(r => {
        const busy = isWaiting('vendor-category', { vendor: r.vendor }) || isWaiting('vendor-domain', { vendor: r.vendor });
        return `<li class="fm-charge"><div><b>${esc(r.merchant)}</b><div class="dim">${dm(r.date)} · ${ils(r.amount)} · ${esc(r.via)}</div></div>
          ${busy ? '<span class="dim">ממתין למחשב…</span>' : `<div class="fm-selects"><select data-fmcat="${esc(r.vendor)}" aria-label="קטגוריה">${options(res.choices, r.category)}</select>
          <select data-fmdom="${esc(r.vendor)}" aria-label="תחום">${options(res.domains, r.domain)}</select></div>`}</li>`;
      }).join('')}</ul>`;
      return `<div class="fm-cat"><button data-fmcatopen="${esc(c.name)}"><b>${esc(c.name)}</b>${c.kind === 'spend' ? '' : ' <span class="dim">לא הוצאה</span>'}
        <span class="num">${ils(c.total)}</span><span class="dim">${c.rows.length}</span></button>${rows}</div>`;
    }).join('') || '<div class="dim">אין חיובים בסינון הזה.</div>';
    const withSuggestion = res.vendors.filter(x => x.suggestion !== 'לא סווג').length;
    const vendorsCard = !res.vendors.length ? '' : `<div class="fm-card"><h3>ספקים בלי תחום (${res.vendors.length})</h3>
      ${withSuggestion ? (isWaiting('domains-accept-all', {}) ? '<span class="dim">ממתין למחשב…</span>'
        : `<button class="fm-btn" data-fm="domainsAll">אשר את כל ההצעות (${withSuggestion})</button>`) : ''}
      <div class="dim">או לבחור תחום בכל חיוב למטה. התחום רק בשבילך, והחבילה לרו"ח לא משתנה.</div></div>`;
    return `<div class="fm-card"><div class="fm-stats"><div><span class="dim">הוצאות</span><b class="num">${ils(t.spend)}</b></div>
        <div><span class="dim">הלוואות</span><b class="num">${ils(t.loans)}</b></div><div><span class="dim">חיסכון</span><b class="num">${ils(t.savings)}</b></div></div>
        <div class="fm-chips">${chips}</div><div class="fm-seg">${seg}</div>${chart}</div>`
      + vendorsCard + `<div class="fm-card">${cats}</div>`
      + '<div class="dim fm-foot">קטגוריה ותחום נבחרים לכל ספק, וחלים על כל החיובים שלו.</div>';
  }

  async function ask(cmd, fields, confirmText) {
    if (!SNAP) return;
    if (confirmText && !confirm(confirmText)) return render();
    const payload = requestPayload(fields, SNAP);
    const { data, error } = await sb().from('finance_requests').insert({ user_id: T._userId, cmd, payload }).select('id').single();
    if (error) { say('לא נשמר: ' + error.message, false); return render(); }
    waiting.set(data.id, { cmd, payload, since: Date.now(), warned: false });
    render();
    startPoll();
  }

  // one shared poller for everything in `waiting`, instead of one loop per request.
  function startPoll() {
    if (pollTimer || !waiting.size || !isOpen()) return;
    pollTimer = setTimeout(pollTick, POLL_MS);
  }

  function stopPoll() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function pollTick() {
    pollTimer = null;
    if (!waiting.size || !isOpen()) return;
    pollOnce().catch(() => {}).then(() => {
      if (waiting.size && isOpen()) pollTimer = setTimeout(pollTick, POLL_MS);
    });
  }

  async function pollOnce() {
    const ids = [...waiting.keys()];
    if (!ids.length) return;
    const { data: rows } = await sb().from('finance_requests').select('id,status,result,done_at').in('id', ids);
    const byId = new Map((rows || []).map(r => [r.id, r]));
    let latestDone = null;
    for (const id of ids) {
      const w = waiting.get(id);
      if (!w) continue;
      const r = byId.get(id);
      if (!r || r.status === 'done' || r.status === 'failed') {
        waiting.delete(id);   // done/failed → toast once, per id, then it's off the waiting list
        if (r && r.status === 'failed') say((r.result && r.result.message) || 'לא בוצע', false);
        else if (r && r.status === 'done') say('בוצע', true);
        if (r && r.done_at) {
          const doneAt = new Date(r.done_at);
          if (!latestDone || doneAt > latestDone) latestDone = doneAt;
        }
      } else if (!w.warned && Date.now() - w.since >= POLL_MAX_MS) {
        // still pending/running in the DB, so it stays in `waiting` ("ממתין" is still correct) —
        // this is a one-time heads-up, not a failure.
        w.warned = true;
        say('המחשב עוד לא ביצע. זה יקרה כשיתחבר', false);
      }
    }
    // refresh pc_seen_at every poll so the "PC not connected" warning updates live
    const { data: stateRow } = await sb().from('finance_state').select('pc_seen_at,made_at').eq('user_id', T._userId).maybeSingle();
    if (stateRow) ROW = ROW ? Object.assign({}, ROW, stateRow) : stateRow;

    if (latestDone) {
      const waitSnap = Date.now();
      do {
        const { data } = await sb().from('finance_state').select('data,made_at,pc_seen_at').eq('user_id', T._userId).maybeSingle();
        if (data) { ROW = data; SNAP = data.data; }
        if (ROW && ROW.made_at && new Date(ROW.made_at) >= latestDone) break;
        await new Promise(r => setTimeout(r, 3000));
      } while (Date.now() - waitSnap < SNAP_WAIT_MS);
    }
    if (isOpen()) render();
  }

  const builtWarning = () => SNAP && SNAP.package && SNAP.package.state === 'built'
    ? 'החבילה שנבנתה תסומן "בנה שוב" במחשב. להמשיך?' : null;

  function onClick(ev) {
    const t = ev.target;
    const sl = t.closest('[data-slice]');
    if (sl) { domainFilter = domainFilter === sl.dataset.slice ? 'הכל' : sl.dataset.slice; return render(); }
    const b = t.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.fm === 'close') return close();
    if (d.fmtab) { tab = d.fmtab; store.set('carlos-fm-tab', tab); return render(); }
    if (d.fmview) { view = d.fmview; store.set('carlos-fm-chart', view); return render(); }
    if (d.fmfilter) { domainFilter = d.fmfilter; return render(); }
    if (d.fmcatopen) { openCats.has(d.fmcatopen) ? openCats.delete(d.fmcatopen) : openCats.add(d.fmcatopen); return render(); }
    if (d.fm === 'ok') return ask('receipt-confirm', { id: d.id, ver: d.ver });
    if (d.fm === 'discard') return ask('receipt-discard', { id: d.id }, 'להוציא את הקבלה? (היא נשמרת בצד במחשב)');
    if (d.fm === 'sent') return ask('mark-sent', {}, `לסמן את החבילה של ${SNAP.period.label} כנשלחה לרו"ח? אחרי זה התקופה ננעלת`);
    if (d.fm === 'domainsAll') return ask('domains-accept-all', {}, builtWarning());
  }

  function onChange(ev) {
    const s = ev.target.closest('select[data-fmcat], select[data-fmdom]');
    if (!s) return;
    if (s.dataset.fmcat !== undefined) return ask('vendor-category', { vendor: s.dataset.fmcat, category: s.value }, builtWarning());
    return ask('vendor-domain', { vendor: s.dataset.fmdom, domain: s.value }, builtWarning());
  }

  T.FinanceMobile = { open, close };
})();
