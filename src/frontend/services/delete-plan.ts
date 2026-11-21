type Row = Record<string, any>;
type Input = { record: Row; input: { name: string; actor?: string } };
const MESSAGE = 'This record cannot be deleted yet.';
const SLOTS: Record<string, number> = { 'contacts.delete': 3, 'projects.deleteChildren': 4, 'tasks.delete': 6, 'calls.delete': 7, 'notes.delete': 7 };
const BLOCKERS: Record<string, [string, string][]> = {
  'companies.delete': [['projects', 'projectsRows'], ['tasks', 'tasksRows'], ['calls', 'callsRows'], ['associations', 'associationsRows']],
  'contacts.delete': [['projects', 'projectsRows'], ['tasks', 'tasksRows'], ['calls', 'callsRows'], ['companies', 'companiesRows']],
};
const count = (state: Row, key: string): number => {
  const rows = state[key];
  if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.n !== 'number') throw new Error('delete plan: dataset ' + key + ' is missing or malformed');
  return rows[0].n;
};
const list = (state: Row, key: string): Row[] => {
  const rows = state[key];
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('delete plan: dataset ' + key + ' is missing or too large');
  return Array.from(new Map(rows.map((row: Row) => [row.key, row])).values());
};
export function handler(event: Input) {
  const state = event.record; const name = event.input.name; const actor = event.input.actor ?? null; const n = state.normalized || {};
  const strategy: string | null = n.strategy ?? null;
  const children = { tasks: 0, calls: 0, notes: 0, files: 0, subprojects: 0, associations: 0 };
  const reasons: { kind: string; count: number }[] = []; let strategies: string[] = [];
  let work: { id: string; data: Row }[] = [];
  const deleted3 = (id: string) => ({ id, data: { mark_deleted: true, deleted_at: n.now, deleted_by: actor } });
  const blockers = () => { for (const [kind, key] of BLOCKERS[name]) { const c = count(state, key); if (c > 0) reasons.push({ kind, count: c }); } };
  if (name === 'companies.delete') {
    children.tasks = count(state, 'tasksRows'); children.calls = count(state, 'callsRows'); children.associations = count(state, 'associationsRows');
    blockers();
  } else if (name === 'contacts.delete') {
    const links = list(state, 'associationsRows'); children.associations = links.length;
    children.tasks = count(state, 'tasksRows'); children.calls = count(state, 'callsRows');
    blockers();
    work = links.map(row => ({ id: row.key, data: { mark_deleted: true, deleted_at: n.now } }));
  } else if (name === 'projects.delete') {
    children.subprojects = count(state, 'subprojectsRows'); children.tasks = list(state, 'tasksRows').length; children.calls = list(state, 'callsRows').length; children.notes = list(state, 'notesRows').length; children.files = list(state, 'filesRows').length;
    const total = children.tasks + children.calls + children.notes + children.files;
    if (children.subprojects > 0) reasons.push({ kind: 'subprojects', count: children.subprojects });
    if (total > 0) strategies = ['cascade', 'reparent'];
    if (total > 0) reasons.push({ kind: 'children', count: total });  // strategy is accepted for compatibility and ignored: children are moved by projects.deleteChildren first
  } else if (name === 'projects.deleteChildren') {
    children.subprojects = count(state, 'subprojectsRows');
    if (children.subprojects > 0) reasons.push({ kind: 'subprojects', count: children.subprojects });
    const tasks = list(state, 'tasksRows'), calls = list(state, 'callsRows'), notes = list(state, 'notesRows'), files = list(state, 'filesRows');
    if (strategy === 'cascade') {
      children.tasks = tasks.length; children.calls = calls.length; children.notes = notes.length; children.files = files.length;
      work = [...files, ...notes, ...calls, ...tasks].map(row => ({ id: row.key, data: { ...deleted3(row.key).data, project: row.project ?? null, company: row.company ?? null, contact: row.contact ?? null } }));
    } else {
      const direct = (rows: Row[]) => rows.filter(row => row.project === n.id);
      children.tasks = direct(tasks).length; children.calls = direct(calls).length; children.notes = direct(notes).length;
      const company = state.targetCompany ?? null, contact = state.targetContact ?? null;
      const moving = [...direct(notes), ...direct(calls), ...direct(tasks)];
      if (moving.length > 0 && !company && !contact) reasons.push({ kind: 'orphans', count: moving.length });
      work = moving.map(row => ({ id: row.key, data: { mark_deleted: false, deleted_at: null, deleted_by: null, project: null, company, contact: company ? row.contact ?? null : contact } }));
    }
  } else if (name === 'tasks.delete') {
    const calls = list(state, 'callsRows'), notes = list(state, 'notesRows'); children.calls = calls.length; children.notes = notes.length;
    const project = state.targetProject ?? null, company = state.targetCompany ?? null, contact = state.targetContact ?? null;
    const moving = [...calls, ...notes];
    if (moving.length > 0 && !project && !company && !contact) reasons.push({ kind: 'orphans', count: moving.length });
    work = moving.map(row => ({ id: row.key, data: { task: null, project, company, contact: project || company ? row.contact ?? null : contact } }));
  } else if (name === 'calls.delete') {
    const notes = list(state, 'notesRows'); children.notes = notes.length;
    const task = state.targetTask ?? null, project = state.targetProject ?? null, company = state.targetCompany ?? null, contact = state.targetContact ?? null;
    if (notes.length > 0 && !task && !project && !company && !contact) reasons.push({ kind: 'orphans', count: notes.length });
    work = notes.map(row => ({ id: row.key, data: { call: null, task, project, company, contact: task || project || company ? row.contact ?? null : contact } }));
  } else if (name === 'notes.delete') {
    const files = list(state, 'filesRows'); children.files = files.length;
    work = files.map(row => deleted3(row.key));
  } else throw new Error('delete plan: unknown service ' + name);
  const slots = work.slice(0, SLOTS[name] ?? 0); const remaining = Math.max(0, work.length - slots.length);
  const blocked = reasons.length > 0; const last = remaining === 0;
  const plan = { blocked, reasons, children, strategies, companyId: state.targetCompany ?? null };
  return {
    plan, slots, slotCount: slots.length, last,
    dryRunBody: { data: { blocked, reasons, children, strategies } },
    blockedBody: { error: { message: MESSAGE, reasons } },
    doneBody: { data: { ok: true, done: last, remaining } },
  };
}
