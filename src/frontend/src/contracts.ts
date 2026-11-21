export type Kind = 'task' | 'call' | 'note' | 'file';
export type CreateKind = 'task' | 'call' | 'note' | 'company' | 'contact' | 'project';
export type EditKind = CreateKind;
export type ParentKind = 'project' | 'company' | 'contact' | 'task' | 'call';
export interface Parent { kind: ParentKind; id: string; name: string }
/** Plan 7.4: which record kinds may be created from which parent page. */
export const ALLOWED_CHILDREN: Record<ParentKind, CreateKind[]> = { project: ['note', 'call', 'task'], task: ['note', 'call'], call: ['note'], company: ['note', 'call', 'task'], contact: ['note', 'call', 'task'] };
export const COLLECTIONS: Record<CreateKind, string> = { task: 'tasks', call: 'calls', note: 'notes', company: 'companies', contact: 'contacts', project: 'projects' };
export type FilterKind = 'everything' | 'tasks' | 'calls' | 'notes' | 'files';
export interface User { id: string; displayName: string; isAdmin: boolean }
export interface Stats { todayCount: number; overdueCount: number; openTasks: number; openCalls: number; unbilledCalls: number; activeProjects: number }
export interface AttachmentSummary { id: string; originalFilename: string; byteSize: number | null; contentType: string | null }
export interface Entry {
  id: string; kind: Kind; title: string; date: string | null; createdAt: string | null;
  startAt?: string | null; dueAt?: string | null; personName?: string | null;
  projectId?: string | null; projectName?: string | null; companyName?: string | null;
  durationMinutes?: number | null; billable?: boolean; completed?: boolean; archived?: boolean;
  body?: string | null; source?: string | null; attachmentCount?: number; byteSize?: number;
  attachments?: AttachmentSummary[];
  uploaderName?: string | null; canWrite?: boolean; canDelete?: boolean; canShare?: boolean; canConvertToTask?: boolean; convertedTaskId?: string | null;
  endAt?: string | null; version?: number; contactId?: string | null; companyId?: string | null; calleeId?: string | null; taskId?: string | null; callId?: string | null; assigneeId?: string | null;
  billed?: boolean; followup?: boolean; occurredAt?: string | null;
}
export interface Agenda { windowStart: string; windowEnd: string; items: Entry[]; overdue: Entry[] }
export interface ProjectSummary { id: string; name: string; companyName: string | null; status: string; openTasks: number; openCalls: number; notes: number; lastActivityAt: string | null }
export interface Rollup { projects: ProjectSummary[]; total: number }
export interface Grant { userId: string; displayName: string; source: string; accessLabel: string; grantedAt: string; revocable: boolean }
export interface GrantsResponse { grants: Grant[]; users: { id: string; displayName: string }[]; levels: string[]; scopes: string[] }
export interface Project extends ProjectSummary {
  description: string | null; contactName: string | null; ownerName: string | null;
  startDate: string | null; endDate: string | null; parent: { id: string; name: string } | null;
  subprojects: { id: string; name: string; status: string }[];
  counts: { tasks: number; lateTasks: number; calls: number; notes: number; files: number; unbilledCalls: number };
  permissions: { read: boolean; write: boolean; delete: boolean; share: boolean };
  version: number; companyId: string | null; contactId: string | null; parentProjectId: string | null; archived: boolean;
}
export interface Timeline { entries: Entry[]; nextCursor: string | null; remaining: number }
export interface SearchMatch { id: string; kind: string; label: string; context: string | null; href: string }
export interface SearchResults { matches: SearchMatch[] }
export interface ServiceRegistry { applicationId: string; services: Record<string, string>; identity?: { loginModelId: string; logoutModelId: string } }
export interface Association { id: string; contactId: string; contactName: string; companyId: string; companyName: string; role: string | null; isPrimary: boolean }
export interface Permissions { read: boolean; write: boolean; delete: boolean; share: boolean }
export interface CompanySummary { id: string; name: string; city: string | null; state: string | null; country: string | null; phone: string | null; primaryContactName: string | null; projects: number; contacts: number }
export interface Company extends CompanySummary { address1: string | null; address2: string | null; postalCode: string | null; phone2: string | null; fax: string | null; primaryContactId: string | null; associations: Association[]; projectList: { id: string; name: string; status: string }[]; version: number; permissions: Permissions }
export interface ContactSummary { id: string; firstName: string | null; lastName: string | null; name: string; title: string | null; email: string | null; phone: string | null; companyNames: string[] }
export interface Contact extends ContactSummary { email2: string | null; workPhone: string | null; homePhone: string | null; cellPhone: string | null; fax: string | null; address1: string | null; address2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; associations: Association[]; version: number; permissions: Permissions }
export interface Attachment {
  id: string; originalFilename: string; contentType: string | null; byteSize: number | null; checksum: string | null; createdAt: string | null; uploaderName: string | null; unavailableReason: string | null;
  note: { id: string; title: string } | null; projectId: string | null; projectName: string | null; companyId: string | null; companyName: string | null; contactId: string | null; contactName: string | null;
  taskId: string | null; callId: string | null; version: number; permissions: Permissions;
}
