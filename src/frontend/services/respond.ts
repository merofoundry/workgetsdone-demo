type Row = Record<string, any>;
type Input = { record: Row; input: { name: string; expected: { key: string; count: boolean }[] } };
const truth = (value: unknown) => value === true || value === 'true';
const unique = (rows: Row[]) => Array.from(new Map(rows.map(row => [row.key || row.id || row.project, row])).values());
export function handler(event: Input) {
  const state = event.record; const n = state.normalized || {}; const name = event.input.name;
  if (!state.valid) return { resultStatus: state.resultStatus || 422, result: state.result || { error: { message: 'Invalid request.' } } };
  for (const { key, count } of event.input.expected) {
    const dataset = state[key + 'Rows'];
    if (!Array.isArray(dataset) || (!count && dataset.length > 1000) || (count && (dataset.length !== 1 || typeof dataset[0]?.n !== 'number'))) return { resultStatus: 503, result: { error: { message: 'This information could not be loaded. Please try again.' } } };
  }
  const rows = (key: string): Row[] => unique(state[key + 'Rows'] || []);
  const count = (key: string) => event.input.expected.find(dataset => dataset.key === key)?.count ? state[key + 'Rows'][0].n : rows(key).length;
  const lookup = (key: string, id: unknown, field = 'name') => rows(key).find(row => row.key === id)?.[field] || null;
  const person = (id: unknown) => { const row = rows('contacts').find(row => row.key === id) || rows('contact').find(row => row.key === id); return row ? [row.first_name, row.last_name].filter(Boolean).join(' ') : null; };
  const writable = (kind: string, id: string) => rows(kind + 'Writable').some(row => row.id === id || row.key === id);
  const mapEntry = (kind: string, row: Row): Row => ({ id: row.key, kind, title: row.name || row.subject || row.description || row.original_filename,
    date: kind === 'task' ? row.end_date || row.start_date : kind === 'call' ? row.start_date : kind === 'note' ? row.occurred_at : row.creation_date,
    createdAt: row.creation_date || null, startAt: row.start_date || null, dueAt: kind === 'task' ? row.end_date || row.start_date : null,
    personName: person(row.contact || row.callee), projectId: row.project || null, projectName: lookup('projects', row.project), companyName: lookup('companies', row.company),
    durationMinutes: kind === 'call' && row.start_date && row.end_date ? Math.max(0, Math.round((new Date(row.end_date).getTime() - new Date(row.start_date).getTime()) / 60000)) : null,
    billable: truth(row.billable), completed: truth(row.completed), archived: truth(row.archived), body: row.body || (kind === 'task' ? row.description : kind === 'call' && !['true', 'false'].includes(String(row.followup)) ? row.followup : null) || null, attachmentCount: 0,
    endAt: row.end_date || null, version: Number(row.version) || 1, contactId: row.contact || null, companyId: row.company || null, calleeId: row.callee || null, taskId: row.task || null, callId: row.call || null, assigneeId: row.assignee || null,
    billed: truth(row.billed), followup: truth(row.followup), occurredAt: kind === 'note' ? row.occurred_at || null : null,
    source: row.call ? 'from a call' : row.task ? 'on a task' : null, byteSize: row.byte_size ?? null, uploaderName: null,
    canWrite: writable(kind, row.key), canDelete: false, canShare: false,
    convertedTaskId: row.converted_task || null, canConvertToTask: kind === 'note' && !truth(row.archived) && !row.converted_task && writable('note', row.key) });
  const open = (row: Row) => !truth(row.completed) && !truth(row.archived);
  const summary = (row: Row): Row => ({ id: row.key, name: row.name, companyName: lookup('companies', row.company), status: row.status || 'PROPOSED',
    openTasks: rows('taskRollups').find(group => group.project === row.key)?.n || 0,
    openCalls: rows('callRollups').find(group => group.project === row.key)?.n || 0,
    notes: rows('noteRollups').find(group => group.project === row.key)?.n || 0,
    lastActivityAt: [...rows('taskRollups'), ...rows('callRollups'), ...rows('noteRollups')].filter(group => group.project === row.key).map(group => group.lastActivityAt || '').sort().pop() || row.start_date || null });
  const companyRow = (row: Row): Row => ({ id: row.key, name: row.name, city: row.city || null, state: row.state || null, country: row.country || null, phone: row.phone1 || null,
    primaryContactName: person(row.primary_contact), projects: rows('projects').filter(p => p.company === row.key && !truth(p.archived)).length, contacts: rows('associations').filter(a => a.company === row.key).length });
  const association = (row: Row): Row => ({ id: row.key, contactId: row.contact, contactName: person(row.contact), companyId: row.company, companyName: lookup('companies', row.company) || lookup('company', row.company), role: row.role || null, isPrimary: truth(row.is_primary) });
  const contactRow = (row: Row): Row => ({ id: row.key, firstName: row.first_name, lastName: row.last_name, name: [row.first_name, row.last_name].filter(Boolean).join(' '), title: row.title || null, email: row.email1 || null, phone: row.cell_phone || row.work_phone || row.home_phone || null,
    companyNames: rows('associations').filter(a => a.contact === row.key).map(a => lookup('companies', a.company)).filter(Boolean) });
  const permissions = (kind: string) => ({ read: true as const, write: count(kind + 'Writable') > 0, delete: count(kind + 'Shareable') > 0, share: count(kind + 'Shareable') > 0 });
  const paginate = (items: Row[]) => ({ items: items.slice(n.cursor, n.cursor + 25), total: items.length, nextCursor: n.cursor + 25 < items.length ? String(n.cursor + 25) : null });
  const textMatch = (item: Row, fields: string[]) => fields.map(f => item[f]).flat().filter(Boolean).join(' ').toLowerCase().includes(n.query || '');
  const f: Row = n.filter || {}; const sort: string | null = n.sort || null;
  const asc = (value: unknown, other: unknown) => String(value ?? '').toLowerCase().localeCompare(String(other ?? '').toLowerCase());
  // Empty values sort last in either direction.
  const byKey = (get: (item: Row) => unknown, dir: 1 | -1) => (a: Row, b: Row) => { const x = get(a); const y = get(b); if (!x && !y) return 0; if (!x) return 1; if (!y) return -1; return dir * asc(x, y); };
  // Bounds compare as epoch times, so stored values without milliseconds, with an offset or date-only compare correctly.
  // A row with no usable date is excluded only when a bound is set.
  const lower = f.from ? new Date(f.from).getTime() : null; const upper = f.toExclusive ? new Date(f.toExclusive).getTime() : null;
  const inDay = (value: unknown) => { if (lower === null && upper === null) return true; const time = value ? new Date(value as string).getTime() : NaN; return !isNaN(time) && (lower === null || time >= lower) && (upper === null || time < upper); };
  const ordered = (items: Row[], rules: Record<string, (a: Row, b: Row) => number>, fallback: string) => items.sort((a, b) => (rules[sort || fallback](a, b)) || a.id.localeCompare(b.id));
  let data: Row = {};
  if (name === 'dashboard.stats') data = { todayCount: count('todayTasks') + count('todayCalls'), overdueCount: count('overdue'), openTasks: count('openTasks'), openCalls: count('openCalls'), unbilledCalls: count('unbilledCalls'), activeProjects: count('activeProjects') };
  else if (name === 'dashboard.agenda') data = { windowStart: n.windowStart.slice(0, 10), windowEnd: new Date(new Date(n.windowEnd).getTime() - 86400000).toISOString().slice(0, 10), items: [...rows('tasks').map(row => mapEntry('task', row)), ...rows('calls').map(row => mapEntry('call', row))], overdue: rows('overdue').map(row => mapEntry('task', row)) };
  else if (name === 'dashboard.rollup') data = { projects: rows('projects').filter(row => !truth(row.archived)).map(summary).sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '')).slice(0, n.limit), total: count('projects') };
  else if (name === 'projects.read') {
    const row = rows('project').find(row => row.key === n.id);
    if (!row) return { resultStatus: 404, result: { error: { message: 'This record could not be found.' } } };
    data = { ...summary(row), openTasks: count('openTasks'), openCalls: count('openCalls'), notes: count('notes'), description: row.description || null, contactName: person(row.contact), ownerName: state.ownerName || null, startDate: row.start_date || null, endDate: row.end_date || null,
      parent: row.parent_project && lookup('projects', row.parent_project) ? { id: row.parent_project, name: lookup('projects', row.parent_project) } : null,
      subprojects: rows('projects').filter(project => project.parent_project === row.key && !truth(project.archived)).map(project => ({ id: project.key, name: project.name, status: project.status })),
      counts: { tasks: count('openTasks'), lateTasks: count('overdue'), calls: count('openCalls'), notes: count('notes'), files: count('files'), unbilledCalls: count('unbilledCalls') },
      permissions: { ...permissions('project'), write: count('projectWritable') > 0 }, version: Number(row.version) || 1,
      companyId: row.company || null, contactId: row.contact || null, parentProjectId: row.parent_project || null, archived: truth(row.archived) };
  } else if (/^(projects|companies|contacts)\.timeline$/.test(name)) {
    let entries = [...rows('tasks').map(row => mapEntry('task', row)), ...rows('calls').map(row => mapEntry('call', row)), ...rows('notes').map(row => mapEntry('note', row)), ...rows('files').map(row => mapEntry('file', row))];
    entries = entries.filter(entry => (n.includeClosed || (!entry.completed && !entry.archived)) && (n.kind === 'everything' || n.kind === entry.kind + 's')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id));
    data = { entries: entries.slice(n.cursor, n.cursor + 25), nextCursor: n.cursor + 25 < entries.length ? String(n.cursor + 25) : null, remaining: Math.max(0, entries.length - n.cursor - 25) };
  } else if (name === 'projects.list' || /^(tasks|calls|notes)\.list$/.test(name)) {
    const key = name.split('.')[0];
    const parentOf = (row: Row) => row.call ? 'call' : row.task ? 'task' : row.project ? 'project' : row.company ? 'company' : row.contact ? 'contact' : null;
    const keep = (row: Row) => (n.includeClosed || open(row)) && (key === 'projects' ? (!f.status || (row.status || 'PROPOSED') === f.status) && (!f.companyId || row.company === f.companyId) && (!f.ownerId || row.owner === f.ownerId)
      : key === 'notes' ? (!f.parentKind || parentOf(row) === f.parentKind) && inDay(row.occurred_at)
      : (!f.billable || truth(row.billable)) && (!f.billed || truth(row.billed)) && inDay(row.start_date) && (!f.projectId || row.project === f.projectId) && (!f.companyId || row.company === f.companyId) && (!f.contactId || row.contact === f.contactId) && (!f.assigneeId || row.assignee === f.assigneeId));
    const startOf = new Map(rows(key).map(row => [row.key, row.start_date]));
    let items = rows(key).filter(keep).map(row => key === 'projects' ? { ...summary(row), archived: truth(row.archived) } : mapEntry(key.slice(0, -1), row));
    items = items.filter(item => [item.name || item.title, item.companyName, item.projectName, item.personName].filter(Boolean).join(' ').toLowerCase().includes(n.query || ''));
    const recent = (a: Row, b: Row) => (b.lastActivityAt || b.date || '').localeCompare(a.lastActivityAt || a.date || '');
    ordered(items, { date: recent, activity: recent, title: byKey(item => item.title, 1), name: byKey(item => item.name, 1), due: byKey(item => item.dueAt || item.date, 1), start: byKey(item => startOf.get(item.id), 1) }, key === 'projects' ? 'activity' : 'date');
    data = { items: items.slice(n.cursor, n.cursor + 25), total: items.length, nextCursor: n.cursor + 25 < items.length ? String(n.cursor + 25) : null };
  } else if (/^(tasks|calls|notes)\.read$/.test(name)) {
    const key = name.split('.')[0]; const row = rows(key).find(row => row.key === n.id);
    if (!row) return { resultStatus: 404, result: { error: { message: 'This record could not be found.' } } };
    const kind = key.slice(0, -1); const shareable = count(kind + 'Shareable') > 0;
    const attachments = kind === 'note' ? rows('files').filter(file => file.note === row.key && !file.deleted_at).map(file => ({ id: file.key, originalFilename: file.original_filename, byteSize: file.byte_size ?? null, contentType: file.content_type ?? null })) : undefined;
    data = { ...mapEntry(kind, row), canShare: shareable, canDelete: shareable, ...(attachments ? { attachments, attachmentCount: attachments.length } : {}) };
  } else if (name === 'files.read') {
    const row = rows('file').find(row => row.key === n.id);
    if (!row) return { resultStatus: 404, result: { error: { message: 'This record could not be found.' } } };
    const parent = rows('notes').find(note => note.key === row.note);
    data = { id: row.key, originalFilename: row.original_filename, contentType: row.content_type || null, byteSize: row.byte_size ?? null, checksum: row.checksum || null, createdAt: row.creation_date || null,
      uploaderName: rows('users').find(user => user.key === row.creator)?.display_name || null, unavailableReason: row.unavailable_reason || null,
      note: row.note ? { id: row.note, title: parent?.description || 'Note' } : null, projectId: row.project || null, projectName: lookup('projects', row.project), companyId: row.company || null, companyName: lookup('companies', row.company),
      contactId: row.contact || null, contactName: person(row.contact), taskId: row.task || null, callId: row.call || null, version: Number(row.version) || 1, permissions: permissions('note_file') };
  } else if (name === 'grants.list') {
    const found: Row[] = state.grantsRows || [];
    if (!found.length) return { resultStatus: 404, result: { error: { message: 'This record could not be found.' } } };
    const people = rows('users');
    const distinct = Array.from(new Map(found.map(row => [row.user_id + '|' + row.source, row])).values());
    const grants = distinct.map(row => ({ userId: row.user_id, displayName: people.find(user => user.key === row.user_id)?.display_name || 'Former user', source: row.source, accessLabel: row.access_label || null, grantedAt: row.granted_at || null, revocable: row.source !== 'creator' }))
      .sort((a, b) => Number(b.source === 'creator') - Number(a.source === 'creator') || String(a.grantedAt || '').localeCompare(String(b.grantedAt || '')));
    data = { grants, users: people.map(user => ({ id: user.key, displayName: user.display_name })), levels: ['viewer', 'editor', 'manager'], scopes: ['self', 'subtree'] };
  } else if (name === 'search') {
    const matches: Row[] = [];
    for (const [kind, key, title] of [['companies', 'companies', 'name'], ['contacts', 'contacts', 'last_name'], ['projects', 'projects', 'name'], ['tasks', 'tasks', 'name'], ['calls', 'calls', 'subject'], ['notes', 'notes', 'description']]) {
      if (n.kinds.length && !n.kinds.includes(kind)) continue;
      for (const row of rows(key)) { const label = kind === 'contacts' ? [row.first_name, row.last_name].filter(Boolean).join(' ') : row[title]; if (n.query.length >= 2 && String(label).toLowerCase().includes(n.query)) matches.push({ id: row.key, kind, label, context: lookup('companies', row.company), href: '/' + kind + '/' + row.key }); }
    }
    data = { matches: matches.slice(0, n.limit) };
  } else if (name === 'companies.list') data = paginate(ordered(rows('companies').map(companyRow).filter(item => textMatch(item, ['name', 'city', 'primaryContactName'])), { name: (a, b) => a.name.localeCompare(b.name), city: byKey(item => item.city, 1) }, 'name'));
  else if (name === 'companies.read') {
    const row = rows('company').find(row => row.key === n.id);
    if (!row) return { resultStatus: 404, result: { error: { message: 'This record could not be found.' } } };
    data = { ...companyRow(row), address1: row.address1 || null, address2: row.address2 || null, postalCode: row.postal_code || null, phone2: row.phone2 || null, fax: row.fax || null, primaryContactId: row.primary_contact || null,
      associations: rows('associations').filter(a => a.company === row.key).map(association), projectList: rows('projects').filter(p => p.company === row.key && !truth(p.archived)).map(p => ({ id: p.key, name: p.name, status: p.status || 'NOT_STARTED' })), version: Number(row.version) || 1, permissions: permissions('company') };
  } else if (name === 'contacts.list') data = paginate(ordered(rows('contacts').filter(row => !f.companyId || rows('associations').some(a => a.contact === row.key && a.company === f.companyId)).map(contactRow).filter(item => textMatch(item, ['name', 'email', 'companyNames'])), { lastName: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName), firstName: (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) }, 'lastName'));
  else if (name === 'contacts.read') {
    const row = rows('contact').find(row => row.key === n.id);
    if (!row) return { resultStatus: 404, result: { error: { message: 'This record could not be found.' } } };
    data = { ...contactRow(row), email2: row.email2 || null, workPhone: row.work_phone || null, homePhone: row.home_phone || null, cellPhone: row.cell_phone || null, fax: row.fax || null, address1: row.address1 || null, address2: row.address2 || null, city: row.city || null, state: row.state || null, postalCode: row.postal_code || null, country: row.country || null,
      associations: rows('associations').filter(a => a.contact === row.key).map(association), version: Number(row.version) || 1, permissions: permissions('contact') };
  }
  else return { resultStatus: 503, result: { error: { message: 'This service is unavailable.' } } };
  return { resultStatus: 200, result: { data } };
}
