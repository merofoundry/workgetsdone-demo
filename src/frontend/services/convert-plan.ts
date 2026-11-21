type Row = Record<string, any>;
type Input = { record: Row; input: { actor?: string } };
const truth = (value: unknown) => value === true || value === 'true';
const refusal = (message: string) => ({ error: { message } });
export function handler(event: Input) {
  const state = event.record; const n = state.normalized || {};
  const rows = state.noteRows;
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('convert plan: note dataset is missing or ambiguous');
  const note: Row = rows[0];
  const first = (key: string): Row | null => Array.isArray(state[key]) && state[key].length > 0 ? state[key][0] : null;
  const parentTask = first('parentTaskRows'); const parentCall = first('parentCallRows');
  // An earlier attempt may have created the task and failed before archiving and linking the note: reuse it instead of creating a second one.
  const reuse = first('existingTaskRows') !== null;
  // One level up: a link the note does not carry is taken from its parent task, then from its parent call.
  const link = (field: string): string | null => note[field] || parentTask?.[field] || parentCall?.[field] || null;
  const project = link('project'), company = link('company'), contact = link('contact');
  const converted = note.converted_task != null && note.converted_task !== '';
  let message: string | null = null;
  if (converted) message = 'This note was already converted.';
  else if (truth(note.archived)) message = 'This note is archived.';
  else if (!reuse && !project && !company && !contact) message = 'This note has no project, company or contact to attach the task to.';
  const taskData = { name: String(note.description || '').slice(0, 255), description: note.body || note.description || '', project, company, contact, source_note: n.id, client_ref: n.fields?.client_ref ?? n.clientRef };
  return { taskData, reuse, blocked: message !== null, blockBody: refusal(message ?? '') };
}
