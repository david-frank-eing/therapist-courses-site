// "הצג שמות" — מדביק על כל אזור במסך תווית עם הקוד והשם שלו (F3 · ספקים חדשים), כדי שדוד יוכל
// להגיד "תשנה את F3" ושנינו נדבר על אותו מקום (דוד, 12/11/2026).
//
// קובץ אחד לשלושת הממשקים, בלי תלות בשום ספרייה:
//   מסך הכספים במחשב      H:\carlos\dashboard\areas-engine.js          + finance-areas.json
//   הדשבורד בענן והאתר    therapist-courses-site/public/areas-engine.js + carlos-dashboard/areas.json, areas-courses.json
// שני העותקים חייבים להיות זהים. המרשמים (JSON) הם המקור היחיד לשמות; docs/AREAS.md נבנה מהם.
//
// שורה במרשם:  { "code": "F3", "name": "ספקים חדשים", "sel": "CSS selector" }
//         או:  { "code": "F3", "name": "...", "h": "טקסט שמופיע בכותרת", "up": "האב שעוטף את האזור" }
// "kind": "window" = חלון שנפתח רק בלחיצה. מופיע במפה, ומקבל תווית כשהוא פתוח.
//
// השכבה רק מצוירת מעל הדף: היא לא משנה פריסה, לא שומרת כלום, ונעלמת ב-Esc.
(function () {
  if (window.CarlosAreas) return;
  var UP = '.step, .card, details, section, aside, li';
  var layer = null, on = false, registry = [], observer = null, sizer = null, timer = null, buttons = [];

  function css() {
    if (document.getElementById('carlos-areas-css')) return;
    var s = document.createElement('style');
    s.id = 'carlos-areas-css';
    s.textContent =
      '#carlos-areas-layer{position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000;direction:rtl}' +
      '#carlos-areas-layer .ca-box{position:absolute;border:2px dashed #ffb454;border-radius:10px;pointer-events:none;box-sizing:border-box}' +
      '#carlos-areas-layer .ca-tag{position:absolute;font:700 12.5px/1.2 "Segoe UI",Arial,sans-serif;background:#ffb454;color:#1b1400;' +
      'border:0;border-radius:6px;padding:3px 8px;white-space:nowrap;cursor:copy;box-shadow:0 1px 6px rgba(0,0,0,.45)}' +
      '#carlos-areas-layer .ca-tag b{font-weight:800;margin:0 0 0 6px;direction:ltr;unicode-bidi:isolate}' +
      '#carlos-areas-layer .ca-tag.done{background:#5fd6a0}' +
      '#carlos-areas-layer .ca-tag:focus-visible{outline:2px solid #fff;outline-offset:1px}' +
      '.ca-toggle[aria-pressed="true"]{background:#ffb454!important;color:#1b1400!important;border-color:#ffb454!important}';
    document.head.appendChild(s);
  }

  function find(entry) {
    var out = [];
    try {
      if (entry.sel) {
        Array.prototype.forEach.call(document.querySelectorAll(entry.sel), function (el) {
          var target = entry.up ? el.closest(entry.up) : el;       // sel + up: האב שעוטף את מה שנמצא
          if (target && out.indexOf(target) === -1) out.push(target);
        });
        return out;
      }
      if (!entry.h) return out;
      var heads = document.querySelectorAll(entry.hsel || 'h2, h3');
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].textContent.indexOf(entry.h) === -1) continue;
        var el = heads[i].closest(entry.up || UP);
        if (el && out.indexOf(el) === -1) out.push(el);
      }
    } catch (e) {}
    return out;
  }

  function shown(el) {
    if (!el || (layer && layer.contains(el))) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && el.getClientRects().length > 0;
  }

  function draw() {
    if (!on || !layer) return;
    if (observer) observer.disconnect();
    layer.textContent = '';
    var sx = window.scrollX, sy = window.scrollY, taken = [], count = 0;
    registry.forEach(function (entry) {
      find(entry).filter(shown).forEach(function (el) {
        var r = el.getBoundingClientRect();
        var box = document.createElement('div');
        box.className = 'ca-box';
        box.style.cssText = 'left:' + (r.left + sx) + 'px;top:' + (r.top + sy) + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
        layer.appendChild(box);
        var tag = document.createElement('button');
        tag.type = 'button'; tag.className = 'ca-tag';
        tag.title = 'לחיצה מעתיקה את השם';
        tag.setAttribute('data-ca-copy', entry.code + ' ' + entry.name);
        var b = document.createElement('b'); b.textContent = entry.code;
        tag.appendChild(b); tag.appendChild(document.createTextNode(entry.name));
        layer.appendChild(tag);
        // פינה ימנית-עליונה של האזור (תחילת השורה בעברית); אזור בתוך אזור מקבל תווית שורה מתחת
        var x = r.right + sx - tag.offsetWidth - 6, y = r.top + sy - 9;
        if (x < sx + 4) x = sx + 4;
        if (y < sy + 2 && r.top < 2) y = sy + 2;
        for (var guard = 0; guard < 12; guard++) {
          var clash = taken.some(function (t) { return Math.abs(t.y - y) < 22 && x < t.x + t.w && t.x < x + tag.offsetWidth; });
          if (!clash) break;
          y += 23;
        }
        taken.push({ x: x, y: y, w: tag.offsetWidth });
        tag.style.left = x + 'px'; tag.style.top = y + 'px';
        count++;
      });
    });
    layer.setAttribute('data-count', String(count));
    if (observer) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open', 'style', 'hidden'] });
  }

  function later() { clearTimeout(timer); timer = setTimeout(draw, 120); }

  function set(value) {
    on = !!value;
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(on)); });
    if (!on) {
      if (observer) { observer.disconnect(); observer = null; }
      if (sizer) { sizer.disconnect(); sizer = null; }
      if (layer) { layer.remove(); layer = null; }
      window.removeEventListener('scroll', later, true);
      window.removeEventListener('resize', later);
      return;
    }
    css();
    layer = document.createElement('div');
    layer.id = 'carlos-areas-layer';
    document.body.appendChild(layer);
    observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) if (!layer || !layer.contains(records[i].target)) return later();
    });
    // הדף ממשיך להיטען אחרי הציור (מספרים שמגיעים, כרטיס שנפתח): כל שינוי גובה מצייר מחדש
    if (window.ResizeObserver) { sizer = new ResizeObserver(later); sizer.observe(document.body); }
    window.addEventListener('scroll', later, true);
    window.addEventListener('resize', later);
    draw();
  }

  document.addEventListener('click', function (ev) {
    var tag = ev.target.closest && ev.target.closest('.ca-tag');
    if (!tag) return;
    ev.preventDefault(); ev.stopPropagation();
    var text = tag.getAttribute('data-ca-copy');
    var ok = function () { tag.classList.add('done'); setTimeout(function () { tag.classList.remove('done'); }, 900); };
    try { navigator.clipboard.writeText(text).then(ok, function () {}); } catch (e) {}
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && on && !document.querySelector('dialog[open]')) set(false);
  });

  function load(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      registry = (data && data.areas) || [];
      return registry;
    });
  }

  function bind(button) {
    if (!button || buttons.indexOf(button) !== -1) return;
    buttons.push(button);
    button.classList.add('ca-toggle');
    button.setAttribute('aria-pressed', String(on));
    button.addEventListener('click', function () { api.toggle(); });
  }

  var source = null;
  var api = window.CarlosAreas = {
    // url של מרשם: נטען פעם אחת, בלחיצה הראשונה
    use: function (url) { source = url; return api; },
    bind: bind,
    toggle: function (value) {
      var next = value === undefined ? !on : !!value;
      if (!next || registry.length || !source) { set(next); return Promise.resolve(on); }
      return load(source).then(function () { set(true); return on; }, function () { set(false); return on; });
    },
    isOn: function () { return on; },
    count: function () { return layer ? Number(layer.getAttribute('data-count') || 0) : 0; },
    redraw: draw
  };

  // שימוש בלי קוד: <script src="areas-engine.js" data-registry="x.json" data-mount=".top .row-actions" data-label="🏷 הצג שמות">
  var me = document.currentScript;
  if (me && me.getAttribute('data-registry')) {
    api.use(me.getAttribute('data-registry'));
    var ready = function () {
      var existing = me.getAttribute('data-button') && document.querySelector(me.getAttribute('data-button'));
      if (existing) return bind(existing);
      var mount = me.getAttribute('data-mount') && document.querySelector(me.getAttribute('data-mount'));
      if (!mount) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = me.getAttribute('data-class') || 'btn';
      b.id = 'areasBtn';
      b.textContent = me.getAttribute('data-label') || '🏷 הצג שמות';
      b.title = 'מציג על כל אזור את הקוד והשם שלו. לחיצה על תווית מעתיקה אותה. Esc מכבה';
      mount.insertBefore(b, mount.firstChild);
      bind(b);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  }
})();
