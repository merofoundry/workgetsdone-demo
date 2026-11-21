type Input = { input: { payload?: Record<string, unknown>; name?: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^[0-9+()\-.\sx]{0,40}$/i;
const STATUS = ['NOT_STARTED', 'STARTED', 'ON_SCHEDULE', 'BEHIND_SCHEDULE', 'MAINTENANCE', 'COMPLETED', 'CANCELLED'];
type Spec = { key: string; field: string; kind: 'text' | 'email' | 'phone' | 'uuid' | 'bool' | 'date' | 'datetime' | 'enum' | 'timezone' | 'secret'; max?: number; min?: number; required?: boolean; values?: string[] };
const text = (key: string, field: string, max: number, required = false): Spec => ({ key, field, kind: 'text', max, required });
const uuid = (key: string, field: string, required = false): Spec => ({ key, field, kind: 'uuid', required });
const address: Spec[] = [text('address1', 'address1', 100), text('address2', 'address2', 100), text('city', 'city', 100), text('state', 'state', 64), text('postalCode', 'postal_code', 20), text('country', 'country', 100)];
const LIST_KINDS = ['company', 'contact', 'project', 'task', 'call', 'note', 'note_file'];
const GRANT_KINDS = [...LIST_KINDS, 'contact_company'];
const kindSpec = (values: string[]): Spec => ({ key: 'objectKind', field: 'object_kind', kind: 'enum', values, required: true });
const strategySpec = (required = false): Spec => ({ key: 'strategy', field: 'strategy', kind: 'enum', values: ['cascade', 'reparent'], required });
const deleteSpecs = (withStrategy = false): Spec[] => [uuid('id', 'id', true), { key: 'dryRun', field: 'dry_run', kind: 'bool' }, ...(withStrategy ? [strategySpec()] : [])];
// IANA zone names from Intl.supportedValuesOf('timeZone') (Node 22) plus UTC and the current names of zones that ICU still lists under an older name. The function sandbox has no usable Intl (a bogus zone passed an Intl.DateTimeFormat probe), so the list is embedded; normalize.test.ts checks it against the host Intl.
const ZONES = new Set(('UTC Africa/Abidjan Africa/Accra Africa/Addis_Ababa Africa/Algiers Africa/Asmera Africa/Bamako Africa/Bangui Africa/Banjul Africa/Bissau Africa/Blantyre Africa/Brazzaville Africa/Bujumbura Africa/Cairo Africa/Casablanca Africa/Ceuta Africa/Conakry Africa/Dakar Africa/Dar_es_Salaam Africa/Djibouti Africa/Douala Africa/El_Aaiun Africa/Freetown Africa/Gaborone Africa/Harare Africa/Johannesburg Africa/Juba Africa/Kampala Africa/Khartoum Africa/Kigali Africa/Kinshasa Africa/Lagos Africa/Libreville Africa/Lome Africa/Luanda Africa/Lubumbashi Africa/Lusaka Africa/Malabo Africa/Maputo Africa/Maseru Africa/Mbabane Africa/Mogadishu Africa/Monrovia Africa/Nairobi Africa/Ndjamena Africa/Niamey Africa/Nouakchott Africa/Ouagadougou Africa/Porto-Novo Africa/Sao_Tome Africa/Tripoli Africa/Tunis Africa/Windhoek America/Adak America/Anchorage America/Anguilla America/Antigua America/Araguaina America/Argentina/La_Rioja America/Argentina/Rio_Gallegos America/Argentina/Salta America/Argentina/San_Juan America/Argentina/San_Luis America/Argentina/Tucuman America/Argentina/Ushuaia America/Aruba America/Asuncion America/Bahia America/Bahia_Banderas America/Barbados America/Belem America/Belize America/Blanc-Sablon America/Boa_Vista America/Bogota America/Boise America/Buenos_Aires America/Cambridge_Bay America/Campo_Grande America/Cancun America/Caracas America/Catamarca America/Cayenne America/Cayman America/Chicago America/Chihuahua America/Ciudad_Juarez America/Coral_Harbour America/Cordoba America/Costa_Rica America/Coyhaique America/Creston America/Cuiaba America/Curacao America/Danmarkshavn America/Dawson America/Dawson_Creek America/Denver America/Detroit America/Dominica America/Edmonton America/Eirunepe America/El_Salvador America/Fort_Nelson America/Fortaleza America/Glace_Bay America/Godthab America/Goose_Bay America/Grand_Turk America/Grenada America/Guadeloupe America/Guatemala America/Guayaquil America/Guyana America/Halifax America/Havana America/Hermosillo America/Indiana/Knox America/Indiana/Marengo America/Indiana/Petersburg America/Indiana/Tell_City America/Indiana/Vevay America/Indiana/Vincennes America/Indiana/Winamac America/Indianapolis America/Inuvik America/Iqaluit America/Jamaica America/Jujuy America/Juneau America/Kentucky/Monticello America/Kralendijk America/La_Paz America/Lima America/Los_Angeles America/Louisville America/Lower_Princes America/Maceio America/Managua America/Manaus America/Marigot America/Martinique America/Matamoros America/Mazatlan America/Mendoza America/Menominee America/Merida America/Metlakatla America/Mexico_City America/Miquelon America/Moncton America/Monterrey America/Montevideo America/Montserrat America/Nassau America/New_York America/Nome America/Noronha America/North_Dakota/Beulah America/North_Dakota/Center America/North_Dakota/New_Salem America/Ojinaga America/Panama America/Paramaribo America/Phoenix America/Port-au-Prince America/Port_of_Spain America/Porto_Velho America/Puerto_Rico America/Punta_Arenas America/Rankin_Inlet America/Recife America/Regina America/Resolute America/Rio_Branco America/Santarem America/Santiago America/Santo_Domingo America/Sao_Paulo America/Scoresbysund America/Sitka America/St_Barthelemy America/St_Johns America/St_Kitts America/St_Lucia America/St_Thomas America/St_Vincent America/Swift_Current America/Tegucigalpa America/Thule America/Tijuana America/Toronto America/Tortola America/Vancouver America/Whitehorse America/Winnipeg America/Yakutat Antarctica/Casey Antarctica/Davis Antarctica/DumontDUrville Antarctica/Macquarie Antarctica/Mawson Antarctica/McMurdo Antarctica/Palmer Antarctica/Rothera Antarctica/Syowa Antarctica/Troll Antarctica/Vostok Arctic/Longyearbyen Asia/Aden Asia/Almaty Asia/Amman Asia/Anadyr Asia/Aqtau Asia/Aqtobe Asia/Ashgabat Asia/Atyrau Asia/Baghdad Asia/Bahrain Asia/Baku Asia/Bangkok Asia/Barnaul Asia/Beirut Asia/Bishkek Asia/Brunei Asia/Calcutta Asia/Chita Asia/Colombo Asia/Damascus Asia/Dhaka Asia/Dili Asia/Dubai Asia/Dushanbe Asia/Famagusta Asia/Gaza Asia/Hebron Asia/Hong_Kong Asia/Hovd Asia/Irkutsk Asia/Jakarta Asia/Jayapura Asia/Jerusalem Asia/Kabul Asia/Kamchatka Asia/Karachi Asia/Katmandu Asia/Khandyga Asia/Krasnoyarsk Asia/Kuala_Lumpur Asia/Kuching Asia/Kuwait Asia/Macau Asia/Magadan Asia/Makassar Asia/Manila Asia/Muscat Asia/Nicosia Asia/Novokuznetsk Asia/Novosibirsk Asia/Omsk Asia/Oral Asia/Phnom_Penh Asia/Pontianak Asia/Pyongyang Asia/Qatar Asia/Qostanay Asia/Qyzylorda Asia/Rangoon Asia/Riyadh Asia/Saigon Asia/Sakhalin Asia/Samarkand Asia/Seoul Asia/Shanghai Asia/Singapore Asia/Srednekolymsk Asia/Taipei Asia/Tashkent Asia/Tbilisi Asia/Tehran Asia/Thimphu Asia/Tokyo Asia/Tomsk Asia/Ulaanbaatar Asia/Urumqi Asia/Ust-Nera Asia/Vientiane Asia/Vladivostok Asia/Yakutsk Asia/Yekaterinburg Asia/Yerevan Atlantic/Azores Atlantic/Bermuda Atlantic/Canary Atlantic/Cape_Verde Atlantic/Faeroe Atlantic/Madeira Atlantic/Reykjavik Atlantic/South_Georgia Atlantic/St_Helena Atlantic/Stanley Australia/Adelaide Australia/Brisbane Australia/Broken_Hill Australia/Darwin Australia/Eucla Australia/Hobart Australia/Lindeman Australia/Lord_Howe Australia/Melbourne Australia/Perth Australia/Sydney Europe/Amsterdam Europe/Andorra Europe/Astrakhan Europe/Athens Europe/Belgrade Europe/Berlin Europe/Bratislava Europe/Brussels Europe/Bucharest Europe/Budapest Europe/Busingen Europe/Chisinau Europe/Copenhagen Europe/Dublin Europe/Gibraltar Europe/Guernsey Europe/Helsinki Europe/Isle_of_Man Europe/Istanbul Europe/Jersey Europe/Kaliningrad Europe/Kiev Europe/Kirov Europe/Lisbon Europe/Ljubljana Europe/London Europe/Luxembourg Europe/Madrid Europe/Malta Europe/Mariehamn Europe/Minsk Europe/Monaco Europe/Moscow Europe/Oslo Europe/Paris Europe/Podgorica Europe/Prague Europe/Riga Europe/Rome Europe/Samara Europe/San_Marino Europe/Sarajevo Europe/Saratov Europe/Simferopol Europe/Skopje Europe/Sofia Europe/Stockholm Europe/Tallinn Europe/Tirane Europe/Ulyanovsk Europe/Vaduz Europe/Vatican Europe/Vienna Europe/Vilnius Europe/Volgograd Europe/Warsaw Europe/Zagreb Europe/Zurich Indian/Antananarivo Indian/Chagos Indian/Christmas Indian/Cocos Indian/Comoro Indian/Kerguelen Indian/Mahe Indian/Maldives Indian/Mauritius Indian/Mayotte Indian/Reunion Pacific/Apia Pacific/Auckland Pacific/Bougainville Pacific/Chatham Pacific/Easter Pacific/Efate Pacific/Enderbury Pacific/Fakaofo Pacific/Fiji Pacific/Funafuti Pacific/Galapagos Pacific/Gambier Pacific/Guadalcanal Pacific/Guam Pacific/Honolulu Pacific/Kiritimati Pacific/Kosrae Pacific/Kwajalein Pacific/Majuro Pacific/Marquesas Pacific/Midway Pacific/Nauru Pacific/Niue Pacific/Norfolk Pacific/Noumea Pacific/Pago_Pago Pacific/Palau Pacific/Pitcairn Pacific/Ponape Pacific/Port_Moresby Pacific/Rarotonga Pacific/Saipan Pacific/Tahiti Pacific/Tarawa Pacific/Tongatapu Pacific/Truk Pacific/Wake Pacific/Wallis Asia/Kolkata Asia/Kathmandu Asia/Yangon Asia/Ho_Chi_Minh Europe/Kyiv America/Argentina/Buenos_Aires America/Argentina/Cordoba America/Argentina/Catamarca America/Argentina/Jujuy America/Argentina/Mendoza America/Nuuk America/Indiana/Indianapolis America/Kentucky/Louisville Atlantic/Faroe Pacific/Kanton Pacific/Chuuk Pacific/Pohnpei Africa/Asmara').split(' '));
const validZone = (zone: string) => ZONES.has(zone);
const SCHEMAS: Record<string, Spec[]> = {
  companies: [text('name', 'name', 200, true), ...address, { key: 'phone1', field: 'phone1', kind: 'phone' }, { key: 'phone2', field: 'phone2', kind: 'phone' }, { key: 'fax', field: 'fax', kind: 'phone' }],
  contacts: [text('firstName', 'first_name', 100, true), text('lastName', 'last_name', 100, true), { key: 'email1', field: 'email1', kind: 'email', required: true }, { key: 'email2', field: 'email2', kind: 'email' }, { key: 'workPhone', field: 'work_phone', kind: 'phone' }, { key: 'homePhone', field: 'home_phone', kind: 'phone' }, { key: 'cellPhone', field: 'cell_phone', kind: 'phone' }, { key: 'fax', field: 'fax', kind: 'phone' }, ...address, text('title', 'title', 100)],
  projects: [text('name', 'name', 255, true), text('description', 'description', 100000, true), { key: 'status', field: 'status', kind: 'enum', values: STATUS }, { key: 'startDate', field: 'start_date', kind: 'date' }, { key: 'endDate', field: 'end_date', kind: 'date' }, uuid('parentProjectId', 'parent_project'), uuid('contactId', 'contact'), uuid('companyId', 'company')],
  tasks: [text('title', 'name', 255, true), text('body', 'description', 100000), { key: 'startAt', field: 'start_date', kind: 'datetime' }, { key: 'endAt', field: 'end_date', kind: 'datetime' }, { key: 'billable', field: 'billable', kind: 'bool' }, { key: 'billed', field: 'billed', kind: 'bool' }, uuid('assigneeId', 'assignee'), uuid('contactId', 'contact'), uuid('projectId', 'project'), uuid('companyId', 'company')],
  calls: [text('title', 'subject', 255, true), uuid('calleeId', 'callee'), { key: 'startAt', field: 'start_date', kind: 'datetime' }, { key: 'endAt', field: 'end_date', kind: 'datetime' }, { key: 'billable', field: 'billable', kind: 'bool' }, { key: 'billed', field: 'billed', kind: 'bool' }, { key: 'followup', field: 'followup', kind: 'bool' }, uuid('contactId', 'contact'), uuid('projectId', 'project'), uuid('companyId', 'company'), uuid('taskId', 'task')],
  notes: [text('title', 'description', 200, true), text('body', 'body', 100000), { key: 'occurredAt', field: 'occurred_at', kind: 'datetime' }, uuid('contactId', 'contact'), uuid('companyId', 'company'), uuid('projectId', 'project'), uuid('taskId', 'task'), uuid('callId', 'call')],
  'contacts.associate': [uuid('contactId', 'contact', true), uuid('companyId', 'company', true), text('role', 'role', 100), { key: 'isPrimary', field: 'is_primary', kind: 'bool' }],
  'contacts.dissociate': [uuid('associationId', 'association', true)],
  'companies.setPrimaryContact': [uuid('id', 'id', true), uuid('contactId', 'contact')],
  'grants.list': [kindSpec(LIST_KINDS), uuid('objectId', 'object_id', true)],
  'grants.grant': [kindSpec(GRANT_KINDS), uuid('objectId', 'object_id', true), uuid('userId', 'user_id', true), { key: 'level', field: 'level', kind: 'enum', values: ['viewer', 'editor', 'manager'], required: true }, { key: 'scope', field: 'share_scope', kind: 'enum', values: ['self', 'subtree'], required: true }],
  'grants.revoke': [kindSpec(GRANT_KINDS), uuid('objectId', 'object_id', true), uuid('userId', 'user_id', true), text('source', 'revoked_source', 40, true)],
  'companies.delete': deleteSpecs(), 'contacts.delete': deleteSpecs(), 'tasks.delete': deleteSpecs(), 'calls.delete': deleteSpecs(), 'notes.delete': deleteSpecs(),
  'projects.delete': deleteSpecs(true), 'projects.deleteChildren': [uuid('id', 'id', true), strategySpec(true)],
  'notes.convertToTask': [uuid('id', 'id', true), uuid('clientRef', 'client_ref', true)],
  'files.delete': [uuid('id', 'id', true)],
  'account.update': [text('displayName', 'display_name', 255, true), { key: 'timezone', field: 'timezone', kind: 'timezone', max: 64, required: true }, text('userName', 'user_name', 64)],
  'account.changePassword': [{ key: 'newPassword', field: 'new_password', kind: 'secret', min: 12, max: 128, required: true }],
  'users.update': [uuid('id', 'id', true), text('displayName', 'display_name', 255, true), { key: 'timezone', field: 'timezone', kind: 'timezone', max: 64, required: true }, { key: 'isActive', field: 'is_active', kind: 'bool', required: true }, { key: 'oauthProvider', field: 'oauth_provider', kind: 'enum', values: ['google'] }, text('oauthSubject', 'oauth_subject', 255)],
  'projects.archive': [uuid('id', 'id', true)],
  'projects.unarchive': [uuid('id', 'id', true)],
};
const SERVICE_VERBS: Record<string, string> = { 'users.update': 'other', 'account.update': 'other', 'account.changePassword': 'other', 'contacts.associate': 'create', 'contacts.dissociate': 'other', 'companies.setPrimaryContact': 'other', 'projects.archive': 'other', 'companies.delete': 'other', 'contacts.delete': 'other', 'projects.delete': 'other', 'projects.deleteChildren': 'other', 'tasks.delete': 'other', 'calls.delete': 'other', 'notes.delete': 'other', 'files.delete': 'other', 'projects.unarchive': 'other', 'notes.convertToTask': 'other', 'grants.list': 'other', 'grants.grant': 'other', 'grants.revoke': 'other' };
const has = (key: string) => Object.prototype.hasOwnProperty.call(SCHEMAS, key);
function schemaPass(name: string | undefined, payload: Record<string, unknown>) {
  const [prefix, rawVerb] = (name || '').split('.'); const specs = (has(name || '') ? SCHEMAS[name as string] : has(prefix) ? SCHEMAS[prefix] : undefined);
  const verb = SERVICE_VERBS[name || ''] ?? rawVerb; const isDelete = /\.(delete(Children)?|convertToTask)$/.test(name || '');
  if (!specs || !['create', 'update', 'other'].includes(verb)) return null;
  const allowed = new Set([...specs.map(s => s.key), ...(verb === 'update' ? ['id', 'version'] : []), ...(verb === 'create' ? ['clientRef'] : [])]); const errors: string[] = []; const secrets: Record<string, string> = {}; const fields: Record<string, unknown> = {}; const refs: Record<string, string | null> = {};
  for (const key of Object.keys(payload)) if (!allowed.has(key)) errors.push(key);
  for (const spec of specs) {
    let value = payload[spec.key];
    if (typeof value === 'string' && spec.kind !== 'secret') value = value.trim();
    if (value === '' || value === undefined) value = null;
    if (value === null) { if (spec.required) errors.push(spec.key); if (spec.kind !== 'secret') fields[spec.field] = spec.kind === 'bool' ? false : null; if (spec.kind === 'uuid') refs[spec.key] = null; continue; }
    switch (spec.kind) {
      case 'text': if (typeof value !== 'string' || value.length > (spec.max || 255)) errors.push(spec.key); break;
      case 'email': if (typeof value !== 'string' || !value.includes('@') || value.length > 254) errors.push(spec.key); break;
      case 'phone': if (typeof value !== 'string' || !PHONE.test(value)) errors.push(spec.key); break;
      case 'uuid': if (typeof value !== 'string' || !UUID.test(value)) errors.push(spec.key); else { const lowered = value.toLowerCase(); value = lowered; refs[spec.key] = lowered; } break;
      case 'bool': if (typeof value !== 'boolean') errors.push(spec.key); break;
      case 'date': if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(value + 'T00:00:00Z').getTime()) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) errors.push(spec.key); break;
      case 'datetime': if (typeof value !== 'string' || isNaN(new Date(value).getTime())) errors.push(spec.key); else value = new Date(value).toISOString(); break;
      case 'enum': if (!spec.values!.includes(value as string)) errors.push(spec.key); break;
      case 'timezone': if (typeof value !== 'string' || value.length > (spec.max || 64) || !validZone(value)) errors.push(spec.key); break;
      case 'secret': if (typeof value !== 'string' || value.length < (spec.min || 0) || value.length > (spec.max || 128)) errors.push(spec.key); else secrets[spec.key] = value; break;
    }
    if (spec.kind !== 'secret') fields[spec.field] = value;
  }
  if (name === 'users.update' && (fields.oauth_provider == null) !== (fields.oauth_subject == null)) errors.push('oauthSubject'); // link or unlink both together
  if (name === 'companies.setPrimaryContact' && !Object.prototype.hasOwnProperty.call(payload, 'contactId')) errors.push('contactId'); // null clears, but the key must be sent
  if (prefix === 'projects' && verb === 'update' && typeof payload.id === 'string' && fields.parent_project && String(fields.parent_project) === payload.id.toLowerCase()) errors.push('parentProjectId');
  if (fields.start_date && fields.end_date && String(fields.end_date) < String(fields.start_date)) errors.push('endAt');
  if (fields.billed === true && fields.billable !== true) errors.push('billed');
  if (!isDelete && prefix === 'notes' && !['contact', 'company', 'project', 'task', 'call'].some(f => fields[f])) errors.push('target');
  if (!isDelete && prefix === 'tasks' && fields.description == null) fields.description = '';
  if (prefix === 'notes' && verb === 'update' && fields.occurred_at == null) errors.push('occurredAt');
  if (prefix === 'notes' && verb === 'create' && !fields.occurred_at) fields.occurred_at = new Date().toISOString();
  const version = verb === 'update' ? payload.version as number : null;
  if (verb === 'update' && (typeof version !== 'number' || !Number.isInteger(version) || (version as number) < 1)) errors.push('version');
  if (verb === 'update' && (typeof payload.id !== 'string' || !UUID.test(payload.id))) errors.push('id');
  // Legacy creates stay compatible during the release window: clientRef is optional for exactly these three services.
  const legacyCreate = ['tasks.create', 'calls.create', 'notes.create'].includes(name || '');
  const rawRef = verb === 'create' ? (typeof payload.clientRef === 'string' ? payload.clientRef.toLowerCase() : payload.clientRef) : null;
  const clientRef = legacyCreate && (rawRef === undefined || rawRef === null) ? null : rawRef;
  if (verb === 'create' && !(legacyCreate && clientRef === null) && (typeof clientRef !== 'string' || !UUID.test(clientRef))) errors.push('clientRef');
  if (verb === 'create') fields.client_ref = clientRef;
  if (verb === 'update') fields.version = (version as number) + 1;
  return { errors, secrets, fields, refs, version, nextVersion: version === null ? null : version + 1, clientRef };
}
const name_is_grant = (name?: string) => name === 'grants.grant';
const LEVELS: Record<string, [number, string]> = { viewer: [1, 'Viewer'], editor: [3, 'Editor'], manager: [15, 'Manager'] };
function expandShare(level: string, scope: string, target: string, now: string) {
  const [bits, label] = LEVELS[level] || [0, ''];
  const digits = now.replace(/[^0-9]/g, '');
  return { permBits: bits, canWrite: (bits & 2) === 2, canDelete: (bits & 4) === 4, canShare: (bits & 8) === 8, accessLabel: label + (scope === 'subtree' ? ' - this record and everything under it' : ' - this record only'), grantSource: 'share-' + (digits.length > 0 ? digits : '0'), writeTargetKey: (bits & 2) === 2 ? target : null };
}

type ListRule = { keys: string[]; sorts: string[] };
const DATES = ['from', 'to'];
const T = ['includeClosed', 'billable', 'billed', 'from', 'to', 'projectId', 'companyId', 'contactId'];
const LIST_FILTERS: Record<string, ListRule> = {
  'tasks.list': { keys: [...T, 'assigneeId'], sorts: ['date', 'title', 'due'] },
  'calls.list': { keys: T, sorts: ['date', 'title', 'due'] },
  'projects.list': { keys: ['includeClosed', 'status', 'companyId', 'ownerId'], sorts: ['activity', 'name', 'start'] },
  'notes.list': { keys: ['includeClosed', 'parentKind', 'from', 'to'], sorts: ['date', 'title'] },
  'companies.list': { keys: [], sorts: ['name', 'city'] },
  'contacts.list': { keys: ['companyId'], sorts: ['lastName', 'firstName'] },
};
const isDay = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value + 'T00:00:00Z').getTime()) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
function listFilterProblem(rule: ListRule, payload: Record<string, unknown>, uuid: RegExp): boolean {
  const allowed = [...rule.keys, 'sort', 'query', 'cursor', 'pageSize'];
  if (Object.keys(payload).some(key => !allowed.includes(key))) return true;
  if (payload.sort != null && (typeof payload.sort !== 'string' || !rule.sorts.includes(payload.sort))) return true;
  for (const key of ['includeClosed', 'billable', 'billed']) if (payload[key] != null && typeof payload[key] !== 'boolean') return true;
  for (const key of DATES) if (payload[key] != null && !isDay(payload[key])) return true;
  if (typeof payload.from === 'string' && typeof payload.to === 'string' && payload.from > payload.to) return true;
  for (const key of ['projectId', 'companyId', 'contactId', 'assigneeId', 'ownerId']) if (payload[key] != null && (typeof payload[key] !== 'string' || !uuid.test(payload[key] as string))) return true;
  if (payload.status != null && !STATUS.includes(payload.status as string)) return true;
  if (payload.parentKind != null && !['project', 'company', 'contact', 'task', 'call'].includes(payload.parentKind as string)) return true;
  return false;
}
/** Day bounds are UTC: from is the start of its day, toExclusive the start of the day after to. */
function listFilters(payload: Record<string, unknown>) {
  const next = typeof payload.to === 'string' ? new Date(new Date(payload.to + 'T00:00:00Z').getTime() + 86400000).toISOString() : null;
  const text = (key: string) => typeof payload[key] === 'string' ? payload[key] : null;
  return { billable: payload.billable === true, billed: payload.billed === true, from: typeof payload.from === 'string' ? payload.from + 'T00:00:00.000Z' : null, toExclusive: next,
    projectId: text('projectId'), companyId: text('companyId'), contactId: text('contactId'), assigneeId: text('assigneeId'), ownerId: text('ownerId'), status: text('status'), parentKind: text('parentKind') };
}
export function handler(event: Input) {
  const payload = event.input.payload || {};
  if (event.input.name === 'grants.revoke' && typeof payload.source === 'string' && payload.source.trim().toLowerCase() === 'creator') return { valid: false, resultStatus: 422, result: { error: { message: "The creator's access cannot be removed." } } };
  const schema = schemaPass(event.input.name, payload);
  if (schema) {
    if (schema.errors.length) return { valid: false, resultStatus: 422, result: { error: { message: 'Some fields are missing or invalid.', fields: schema.errors } } };
    // The share_action pre_save expand rule does not run for service-created rows (observed 2026-10-11: perm_bits, access_label
    // and grant_source stayed null), so grants.grant carries the same expansion as wgd-share-expand in normalized.share.
    const share = name_is_grant(event.input.name) ? expandShare(schema.fields.level as string, schema.fields.share_scope as string, String(schema.refs.objectId || ''), new Date().toISOString()) : null;
    return { valid: true, normalized: { oauthTouched: event.input.name === 'users.update' && ('oauthProvider' in payload || 'oauthSubject' in payload), share, dryRun: schema.fields.dry_run === true, strategy: schema.fields.strategy ?? null, id: typeof payload.id === 'string' ? payload.id.toLowerCase() : '', objectKind: schema.fields.object_kind ?? null, level: schema.fields.level ?? null, scope: schema.fields.share_scope ?? null, source: schema.fields.revoked_source ?? null, fields: schema.fields, version: schema.version, nextVersion: schema.nextVersion, clientRef: schema.clientRef, now: new Date().toISOString(), ...schema.refs } };
  }
  const uuid = UUID;
  const lower = (value: unknown) => typeof value === 'string' ? value.toLowerCase() : value;
  const id = lower(payload.id || payload.objectId || '') as string;
  const kind = typeof payload.kind === 'string' ? payload.kind : 'everything';
  const cursor = payload.cursor == null ? 0 : Number(payload.cursor);
  const projectId = lower(payload.projectId) || null; const contactId = lower(payload.contactId) || null;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const date = (value: unknown) => value == null ? null : typeof value === 'string' && !isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : 'invalid';
  const startAt = date(payload.startAt); const endAt = date(payload.endAt);
  const listRule = LIST_FILTERS[event.input.name || ''];
  const listBad = listRule ? listFilterProblem(listRule, payload, uuid) : payload.sort != null;
  const invalid = listBad || (id !== '' && (typeof id !== 'string' || !uuid.test(id))) || [projectId, contactId].some(value => value != null && (typeof value !== 'string' || !uuid.test(value))) || (event.input.name?.endsWith('.create') && (!title || title.length > 255)) || body.length > 100000 || startAt === 'invalid' || endAt === 'invalid' || (startAt && endAt && endAt < startAt) || !['everything', 'tasks', 'calls', 'notes', 'files'].includes(kind) || !Number.isInteger(cursor) || cursor < 0 || cursor > 10000 || (payload.pageSize != null && payload.pageSize !== 25) || payload.order != null || payload.current_user_id != null || payload.actor_id != null;
  const start = typeof payload.windowStart === 'string' ? new Date(payload.windowStart + 'T00:00:00Z') : new Date();
  if (payload.windowStart == null) { start.setUTCDate(start.getUTCDate() - start.getUTCDay()); start.setUTCHours(0, 0, 0, 0); }
  const days = event.input.name === 'dashboard.agenda' && payload.windowDays != null ? payload.windowDays : 14;
  const badDays = typeof days !== 'number' || !Number.isInteger(days) || days < 7 || days > 42;
  if (invalid || badDays || isNaN(start.getTime())) return { valid: false, resultStatus: 422, result: { error: { message: 'The supplied filter or identifier is not valid.' } } };
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + days);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setUTCDate(today.getUTCDate() + 1);
  return { valid: true, normalized: { filter: listRule ? listFilters(payload) : {}, sort: listRule && typeof payload.sort === 'string' ? payload.sort : null, id, kind, title, body, projectId, contactId, startAt, endAt, billable: payload.billable === true, now: new Date().toISOString(), includeClosed: payload.includeClosed === true, cursor, limit: Math.min(25, Math.max(1, Number(payload.limit) || 6)), query: typeof payload.query === 'string' ? payload.query.trim().toLowerCase().slice(0, 255) : '', kinds: Array.isArray(payload.kinds) ? payload.kinds : [], windowDays: days, windowStart: start.toISOString(), windowEnd: end.toISOString(), today: today.toISOString(), tomorrow: tomorrow.toISOString() } };
}
