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
      return `<g><rect x="${x + 30}" y="${y.toFixed(1)}" width="${W - 60}" height="${h.toFixed(1)}" rx="4" fill="${SERIES[0]}"><title>${HEB_MONTHS[+mm]} ${yy}: ${ils(r.total)}</title></rect>
        <text x="${x + W / 2}" y="${(y - 8).toFixed(1)}" class="bar-v">${ils(r.total)}</text>
        <text x="${x + W / 2}" y="${H + 20}" class="bar-l">${HEB_MONTHS[+mm]}</text></g>`;
    }).join('');
    const width = 40 + rows.length * W;
    return `<div class="fm-chart"><svg viewBox="0 0 ${width} ${H + 30}" role="img" aria-label="עמודות לפי חודש">
      <line x1="10" x2="${width - 10}" y1="${H}" y2="${H}" class="axis"/>${cols}</svg></div>`;
  }

  const pure = { esc, ils, money, dm, pctOf, deadlineText, pcStatus, packageText, canMarkSent, requestPayload,
    slices, donut, bars, SERIES, OTHER_COLOR, DOMAIN_COLOR, CHART_VIEWS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ── DOM (Task 8) ──
})();
