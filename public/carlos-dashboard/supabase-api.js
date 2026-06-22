// supabase-api.js — Supabase adapter for Carlos Dashboard
// Replaces all local /api/* calls with direct Supabase queries.
// Loaded before app.js. app.js calls window._sbApi() instead of fetch.

// ─── Helpers ────────────────────────────────────────────────────────────────
function _ilDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function _getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = (day === 0) ? -6 : 1 - day; // Monday = week start
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ─── State builder ──────────────────────────────────────────────────────────
async function _sbGetState(sb, uid) {
  const today = _ilDate();
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 864e5).toISOString();

  const [
    tasksRes, completedRes, completedWeekRes, habitDefsRes, habitLogRes,
    weeklyRes, dailyRes, timeLogRes, contentRes, clientsRes, eventsRes,
    journalRes, emailRes, briefingRes, calRes, calUpRes, refreshRes,
    configRes, slotsRes, apptsRes, notifsRes, pubLogRes, bookingProfileRes, playbooksRes
  ] = await Promise.all([
    sb.from('tasks').select('*').eq('user_id', uid).eq('status', 'pending').order('created_at'),
    sb.from('tasks').select('*').eq('user_id', uid).eq('status', 'completed').gte('completed_at', today + 'T00:00:00+00:00'),
    sb.from('tasks').select('*').eq('user_id', uid).eq('status', 'completed').gte('completed_at', _getWeekStart(today) + 'T00:00:00+00:00'),
    sb.from('habit_definitions').select('*').eq('user_id', uid).eq('active', true).order('sort_order'),
    sb.from('habits_log').select('*').eq('user_id', uid).gte('date', monthAgo),
    sb.from('weekly_plan').select('*').eq('user_id', uid).order('week_of', { ascending: false }).limit(1),
    sb.from('daily_plan').select('*').eq('user_id', uid).eq('date_for', today),
    sb.from('time_log').select('*').eq('user_id', uid).order('logged_at', { ascending: false }).limit(100),
    sb.from('content_items').select('*').eq('user_id', uid).order('created_at'),
    sb.from('clients').select('*').eq('user_id', uid).order('full_name'),
    sb.from('events').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sb.from('journal_entries').select('*').eq('user_id', uid).eq('date', today),
    sb.from('sync_data').select('*').eq('user_id', uid).eq('key', 'email-summary'),
    sb.from('sync_data').select('*').eq('user_id', uid).eq('key', 'morning-briefing'),
    sb.from('sync_data').select('*').eq('user_id', uid).eq('key', 'calendar-today'),
    sb.from('sync_data').select('*').eq('user_id', uid).eq('key', 'calendar-upcoming'),
    sb.from('sync_data').select('*').eq('user_id', uid).eq('key', 'last-refresh'),
    sb.from('dashboard_config').select('*').eq('user_id', uid),
    sb.from('availability_slots').select('*').eq('user_id', uid).order('date').order('time'),
    sb.from('appointments').select('*').eq('user_id', uid).order('date').order('time'),
    sb.from('booking_notifs').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
    sb.from('publishing_log').select('*').eq('user_id', uid).gte('published_at', ninetyAgo),
    sb.from('booking_profiles').select('slug').eq('user_id', uid).maybeSingle(),
    sb.from('playbooks').select('*').eq('user_id', uid)
  ]);

  // Build habits in expected format: { habits: [{id, emoji, label}], completions: {'YYYY-MM-DD': [id,...]} }
  const habitDefs = habitDefsRes.data || [];
  const habitLogs = habitLogRes.data || [];
  const completions = {};
  for (const log of habitLogs) {
    if (!log.done) continue;
    if (!completions[log.date]) completions[log.date] = [];
    completions[log.date].push(log.habit_id);
  }
  const habits = {
    habits: habitDefs.map(h => ({ id: h.id, emoji: h.emoji || '✅', label: h.label })),
    completions
  };

  // Weekly plan
  const weeklyRow = weeklyRes.data && weeklyRes.data[0];
  const weekly = weeklyRow ? {
    week_of: weeklyRow.week_of,
    focus_today: weeklyRow.focus_today || [],
    quotas: weeklyRow.quotas || {}
  } : null;

  // Daily plan
  const dailyRow = dailyRes.data && dailyRes.data[0];
  const daily = dailyRow ? { date_for: dailyRow.date_for, quotas: dailyRow.quotas || {} }
    : { date_for: today, quotas: {} };

  // Config / domains / content_types
  const configRow = configRes.data && configRes.data[0];
  const domains = configRow && configRow.domains
    ? (typeof configRow.domains === 'string' ? JSON.parse(configRow.domains) : configRow.domains)
    : [
        { id: 'treatments', emoji: '💆', label: 'טיפולים' },
        { id: 'music', emoji: '🎵', label: 'מוזיקה' },
        { id: 'product', emoji: '🚀', label: 'כלי' },
        { id: 'unassigned', emoji: '⚪', label: 'כללי' }
      ];
  const contentTypes = configRow && configRow.content_types
    ? (typeof configRow.content_types === 'string' ? JSON.parse(configRow.content_types) : configRow.content_types)
    : [
        { id: 'reel', emoji: '🎬', label: 'רילס' },
        { id: 'post', emoji: '📝', label: 'פוסט' }
      ];
  const contactsLabels = configRow && configRow.contacts_labels
    ? (typeof configRow.contacts_labels === 'string' ? JSON.parse(configRow.contacts_labels) : configRow.contacts_labels)
    : { sectionTitle: 'אנשי קשר ואירועים', tab1Emoji: '👤', tab1Label: 'אנשי קשר', tab2Emoji: '📅', tab2Label: 'אירועים' };

  // Calendar
  const calRow = calRes.data && calRes.data[0];
  const calendar = calRow && calRow.value ? calRow.value : { date: null, events: [], updated_at: null };
  const calUpRow = calUpRes.data && calUpRes.data[0];
  const calendarUpcoming = calUpRow && calUpRow.value ? calUpRow.value : { events: [], updated_at: null };

  // Clients (map full_name → name for UI compatibility)
  const clients = (clientsRes.data || []).map(c => ({ ...c, name: c.full_name }));
  const events = eventsRes.data || [];

  // Publishing stats computed client-side
  const pubLogs = pubLogRes.data || [];
  const contentItems = contentRes.data || [];
  const publishingStats = _computePubStats(pubLogs, contentItems);

  // Task stats
  const completedToday = completedRes.data || [];
  const completedWeek = completedWeekRes.data || [];
  const taskStats = {
    completedToday: completedToday.length,
    completedWeek: completedWeek.length,
    total: (tasksRes.data || []).length + completedToday.length
  };

  return {
    date: today,
    weekly,
    tasks: tasksRes.data || [],
    completedToday,
    habits,
    timeLog: { entries: timeLogRes.data || [] },
    content: { items: contentItems },
    daily,
    clients,
    events,
    journalToday: (journalRes.data && journalRes.data[0]) ? journalRes.data[0].body : '',
    emailSummary: (emailRes.data && emailRes.data[0]) ? (emailRes.data[0].text_value || '') : '',
    briefing: (briefingRes.data && briefingRes.data[0]) ? (briefingRes.data[0].text_value || '') : '',
    calendar,
    calendarUpcoming,
    lastRefresh: (refreshRes.data && refreshRes.data[0]) ? refreshRes.data[0].value : null,
    publishingStats,
    taskStats,
    userConfig: {
      userName: window._userName || '',
      assistantName: (configRow && configRow.assistant_name) || 'קרלוס',
      edition: (configRow && configRow.edition) || 'full',
      aiBriefing: false,
      domains,
      contentTypes,
      contactsLabels
    },
    bookingData: {
      slots: slotsRes.data || [],
      appointments: (apptsRes.data || []).filter(a => a.status !== 'cancelled'),
      notifications: notifsRes.data || [],
      cloudflared_available: false,
      publicSlug: (bookingProfileRes && bookingProfileRes.data && bookingProfileRes.data.slug) || null
    },
    playbooks: playbooksRes.data || []
  };
}

// ─── Publishing stats ───────────────────────────────────────────────────────
function _computePubStats(pubLogs, contentItems) {
  const stats = {};
  const now = Date.now();
  for (const log of pubLogs) {
    const d = log.domain || 'unassigned';
    if (!stats[d]) stats[d] = { total: 0, week: 0, month: 0 };
    const age = now - new Date(log.published_at).getTime();
    stats[d].total++;
    if (age < 7 * 864e5) stats[d].week++;
    if (age < 30 * 864e5) stats[d].month++;
  }
  // Also count published content items
  for (const item of contentItems) {
    if (item.status !== 'published') continue;
    const d = item.domain || 'unassigned';
    if (!stats[d]) stats[d] = { total: 0, week: 0, month: 0 };
    // Content published_at not tracked in items — skip time breakdown
  }
  return stats;
}

// ─── Main API router ────────────────────────────────────────────────────────
window._sbApi = async function(url, body) {
  const sb = window._supabase;
  const uid = window._userId;
  if (!sb || !uid) throw new Error('Not authenticated');

  // ── State ─────────────────────────────────────────────────────────────────
  if (url === '/api/state') return _sbGetState(sb, uid);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  if (url === '/api/task') {
    const { action, id, title, category, priority, due_date, reminder_at } = body || {};

    if (action === 'toggle') {
      const { error } = await sb.from('tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', id).eq('user_id', uid);
      if (error) throw error;
      return { ok: true };
    }

    if (action === 'add') {
      const { error } = await sb.from('tasks').insert({
        user_id: uid,
        title,
        category: category || 'general',
        priority: priority || 'normal',
        status: 'pending',
        due_date: due_date || null,
        reminder_at: reminder_at || null,
        created_at: new Date().toISOString()
      });
      if (error) throw error;
      return { ok: true };
    }

    return { ok: false, error: 'Unknown task action: ' + action };
  }

  if (url === '/api/task/undo') {
    const { error } = await sb.from('tasks').update({
      status: 'pending', completed_at: null
    }).eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/task/update') {
    const { id, ...fields } = body || {};
    const allowed = ['title', 'category', 'priority', 'due_date', 'reminder_at', 'notes'];
    const update = {};
    for (const k of allowed) if (k in fields) update[k] = fields[k] || null;
    const { error } = await sb.from('tasks').update(update).eq('id', id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/task/delete') {
    const { error } = await sb.from('tasks').delete().eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Habits ────────────────────────────────────────────────────────────────
  if (url === '/api/habit') {
    const habitId = body.id;
    const today = _ilDate();
    const { data: existing } = await sb.from('habits_log')
      .select('id, done').eq('user_id', uid).eq('habit_id', habitId).eq('date', today).maybeSingle();
    if (existing) {
      const { error } = await sb.from('habits_log').update({ done: !existing.done }).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('habits_log')
        .insert({ user_id: uid, habit_id: habitId, date: today, done: true });
      if (error) throw error;
    }
    return { ok: true };
  }

  if (url === '/api/habit/add') {
    const { emoji, label } = body || {};
    const { data: existing } = await sb.from('habit_definitions')
      .select('sort_order').eq('user_id', uid).order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const nextOrder = existing ? (existing.sort_order + 1) : 0;
    const { error } = await sb.from('habit_definitions').insert({
      user_id: uid, emoji: emoji || '✅', label, active: true, sort_order: nextOrder
    });
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/habit/update') {
    const { id, emoji, label } = body || {};
    const update = {};
    if (emoji !== undefined) update.emoji = emoji;
    if (label !== undefined) update.label = label;
    const { error } = await sb.from('habit_definitions').update(update).eq('id', id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/habit/delete') {
    const { error } = await sb.from('habit_definitions').delete().eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  if (url === '/api/timer') {
    const { domain, label, seconds, note } = body || {};
    const { error } = await sb.from('time_log').insert({
      user_id: uid,
      domain: domain || 'unassigned',
      label: label || '',
      seconds: seconds || 0,
      note: note || '',
      logged_at: new Date().toISOString()
    });
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/timer/delete') {
    const { error } = await sb.from('time_log').delete().eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Journal ───────────────────────────────────────────────────────────────
  if (url === '/api/journal') {
    const today = _ilDate();
    const { data: existing } = await sb.from('journal_entries')
      .select('id, body').eq('user_id', uid).eq('date', today).maybeSingle();
    const timeStr = new Date().toLocaleTimeString('he-IL',
      { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
    const newEntry = `[${timeStr}] ${body.text}`;
    const newBody = existing ? (existing.body + '\n\n' + newEntry) : newEntry;
    const { error } = await sb.from('journal_entries').upsert(
      { user_id: uid, date: today, body: newBody, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    );
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/journal/history') {
    const { data, error } = await sb.from('journal_entries')
      .select('date, body, updated_at')
      .eq('user_id', uid)
      .order('date', { ascending: false });
    if (error) throw error;
    return { entries: data || [] };
  }

  // ── Content ───────────────────────────────────────────────────────────────
  if (url === '/api/content/add') {
    const { type, domain, title } = body || {};
    const { error } = await sb.from('content_items').insert({
      user_id: uid,
      title,
      type: type || 'post',
      domain: domain || 'unassigned',
      status: 'idea',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/content/update') {
    const { id, ...fields } = body || {};
    const allowed = ['title', 'type', 'status', 'domain', 'creative_urls', 'body', 'scheduled_for', 'docs_url'];
    const update = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in fields) update[k] = fields[k];
    const { error } = await sb.from('content_items').update(update).eq('id', id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/content/delete') {
    const { error } = await sb.from('content_items').delete().eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Quota ─────────────────────────────────────────────────────────────────
  if (url === '/api/quota/update') {
    const { key, target, scope } = body || {};
    const today = _ilDate();
    const weekOf = _getWeekStart(today);

    if (scope === 'daily') {
      const { data: existing } = await sb.from('daily_plan')
        .select('quotas').eq('user_id', uid).eq('date_for', today).maybeSingle();
      const quotas = existing ? { ...(existing.quotas || {}) } : {};
      quotas[key] = { ...(quotas[key] || {}), target };
      await sb.from('daily_plan').upsert(
        { user_id: uid, date_for: today, quotas, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,date_for' }
      );
    } else {
      const { data: existing } = await sb.from('weekly_plan')
        .select('quotas').eq('user_id', uid).eq('week_of', weekOf).maybeSingle();
      const quotas = existing ? { ...(existing.quotas || {}) } : {};
      quotas[key] = { ...(quotas[key] || {}), target };
      await sb.from('weekly_plan').upsert(
        { user_id: uid, week_of: weekOf, quotas, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,week_of' }
      );
    }
    return { ok: true };
  }

  // ── Focus ─────────────────────────────────────────────────────────────────
  if (url === '/api/focus/update') {
    const today = _ilDate();
    const weekOf = _getWeekStart(today);
    // Fetch existing to preserve quotas
    const { data: existing } = await sb.from('weekly_plan')
      .select('quotas').eq('user_id', uid).eq('week_of', weekOf).maybeSingle();
    const quotas = existing ? (existing.quotas || {}) : {};
    const { error } = await sb.from('weekly_plan').upsert(
      { user_id: uid, week_of: weekOf, focus_today: body.focus_today || [], quotas, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,week_of' }
    );
    if (error) throw error;
    return { ok: true };
  }

  // ── Clients ───────────────────────────────────────────────────────────────
  if (url === '/api/client/add') {
    const { name, full_name, phone, email, city, notes, photo_url } = body || {};
    const { error } = await sb.from('clients').insert({
      user_id: uid,
      full_name: full_name || name || '',
      phone: phone || '',
      email: email || '',
      city: city || '',
      notes: notes || '',
      photo_url: photo_url || '',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/client/update') {
    const { id, name, full_name, ...rest } = body || {};
    const update = {
      updated_at: new Date().toISOString(),
      ...(full_name !== undefined ? { full_name } : name !== undefined ? { full_name: name } : {})
    };
    const allowed = ['phone', 'email', 'city', 'notes', 'photo_url', 'archived'];
    for (const k of allowed) if (k in rest) update[k] = rest[k];
    const { error } = await sb.from('clients').update(update).eq('id', id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/client/delete') {
    const { error } = await sb.from('clients').delete().eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Events ────────────────────────────────────────────────────────────────
  if (url === '/api/event/add') {
    const { title, date, price, status, notes, client_id } = body || {};
    const { error } = await sb.from('events').insert({
      user_id: uid,
      title: title || '',
      date: date || null,
      price: price || 0,
      status: status || 'lead',
      notes: notes || '',
      client_id: client_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/event/update') {
    const { id, ...rest } = body || {};
    const update = { updated_at: new Date().toISOString() };
    const allowed = ['title', 'date', 'price', 'status', 'notes', 'client_id', 'archived'];
    for (const k of allowed) if (k in rest) update[k] = rest[k];
    const { error } = await sb.from('events').update(update).eq('id', id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/event/delete') {
    const { error } = await sb.from('events').delete().eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Booking: notifications ────────────────────────────────────────────────
  if (url === '/api/booking/notify/read') {
    const { error } = await sb.from('booking_notifs')
      .update({ read: true }).eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Booking: slots ────────────────────────────────────────────────────────
  if (url === '/api/booking/slot/delete') {
    const { error } = await sb.from('availability_slots')
      .delete().eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  if (url === '/api/booking/slot/add-batch') {
    const slots = (body.slots || []).map(s => ({
      user_id: uid,
      date: s.date,
      time: s.time,
      time_to: s.time_to || null,
      duration_min: s.duration_min || 60,
      booked: false
    }));
    if (slots.length) {
      const { error } = await sb.from('availability_slots').insert(slots);
      if (error) throw error;
    }
    return { ok: true, count: slots.length };
  }

  // ── Booking: cancel ───────────────────────────────────────────────────────
  if (url === '/api/booking/cancel') {
    const { error } = await sb.from('appointments')
      .update({ status: 'cancelled' }).eq('id', body.id).eq('user_id', uid);
    if (error) throw error;
    return { ok: true };
  }

  // ── Booking: profile ──────────────────────────────────────────────────────
  if (url === '/api/booking/profile') {
    const { data } = await sb.from('booking_profiles').select('*').eq('user_id', uid).maybeSingle();
    return data || { name: '', title: 'מטפל מוסמך', bio: '', services: [], location: '', photo_url: '' };
  }

  if (url === '/api/booking/profile/update') {
    const { error } = await sb.from('booking_profiles').upsert(
      { user_id: uid, ...body, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    return { ok: true };
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  if (url === '/api/settings') {
    const { data } = await sb.from('dashboard_config').select('*').eq('user_id', uid).maybeSingle();
    const weeklyRes = await sb.from('weekly_plan').select('quotas')
      .eq('user_id', uid).order('week_of', { ascending: false }).limit(1);
    const wp = weeklyRes.data && weeklyRes.data[0];
    const quotas = wp ? (wp.quotas || {}) : {};
    return {
      userName: window._userName || '',
      assistantName: (data && data.assistant_name) || 'קרלוס',
      edition: (data && data.edition) || 'full',
      apiKeySet: false,
      weeklyTargets: Object.entries(quotas).map(([k, q]) => ({
        key: k, label: q.label || k, target: q.target || 0, unit: q.unit || ''
      }))
    };
  }

  if (url === '/api/settings/update') {
    const update = { updated_at: new Date().toISOString() };
    if (body.assistantName !== undefined) update.assistant_name = body.assistantName;
    if (body.domains !== undefined) update.domains = body.domains;
    if (body.content_types !== undefined) update.content_types = body.content_types;
    if (body.contacts_labels !== undefined) update.contacts_labels = body.contacts_labels;
    if (body.categories !== undefined) update.categories = body.categories;
    if (body.edition !== undefined) update.edition = body.edition;
    const { error } = await sb.from('dashboard_config').upsert(
      { user_id: uid, ...update }, { onConflict: 'user_id' }
    );
    if (error) throw error;
    // Store userName in profile (Supabase auth metadata)
    if (body.userName !== undefined) {
      window._userName = body.userName;
      await sb.auth.updateUser({ data: { full_name: body.userName } });
    }
    return { ok: true };
  }

  // ── Capture ───────────────────────────────────────────────────────────────
  if (url === '/api/capture/save') {
    const { text, type, parsed } = body || {};
    if (type === 'client' && parsed && parsed.name) {
      const { error } = await sb.from('clients').insert({
        user_id: uid,
        full_name: parsed.name,
        phone: parsed.phone || '',
        email: parsed.email || '',
        city: parsed.city || '',
        notes: text,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      if (!error) return { ok: true, created: true };
    }
    // Save as journal note fallback
    const today = _ilDate();
    const { data: existing } = await sb.from('journal_entries')
      .select('id, body').eq('user_id', uid).eq('date', today).maybeSingle();
    const newBody = existing ? (existing.body + '\n\n---\n' + text) : text;
    await sb.from('journal_entries').upsert(
      { user_id: uid, date: today, body: newBody, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' }
    );
    return { ok: true, created: false };
  }

  // ── Calendar (upcoming — read only) ──────────────────────────────────────
  if (url === '/api/calendar-upcoming') {
    const { data } = await sb.from('sync_data')
      .select('value').eq('user_id', uid).eq('key', 'calendar-upcoming').maybeSingle();
    return (data && data.value) ? data.value : { events: [], updated_at: null };
  }

  // ── Booking: poll ─────────────────────────────────────────────────────────
  // Used by the 30s setInterval. Returns {hasNew, count}.
  if (url === '/api/booking/poll') {
    const { data, error } = await sb.from('booking_notifs')
      .select('id').eq('user_id', uid).eq('read', false);
    if (error) return { hasNew: false, count: 0 };
    return { hasNew: (data && data.length > 0), count: data ? data.length : 0 };
  }

  // ── Playbooks ─────────────────────────────────────────────────────────────
  if (url === '/api/playbook/save') {
    const { domain_id, content } = body;
    const { error } = await sb.from('playbooks').upsert(
      { user_id: uid, domain_id, content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,domain_id' }
    );
    return { ok: !error };
  }

  // ── No-op / not-available in cloud ───────────────────────────────────────
  if (url === '/api/setup/run-refresh') return { ok: true, message: 'לא זמין בגרסת הענן' };
  if (url === '/api/setup/schedule-task') return { ok: true };
  if (url === '/api/upload') return { ok: false, url: null };
  if (url === '/api/ask') return { ok: false, error: 'AI לא זמין בגרסת הענן' };
  if (url === '/api/tunnel/start') return { ok: false, message: 'לא זמין' };
  if (url === '/api/tunnel/stop') return { ok: true };
  if (url === '/api/tunnel/status') return { running: false, url: null };

  console.warn('[sbApi] Unhandled URL:', url, body);
  return { ok: false, error: 'Unknown API: ' + url };
};
