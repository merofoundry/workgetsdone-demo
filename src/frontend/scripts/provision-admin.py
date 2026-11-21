"""Milestone H, Task 19: users.list and users.update (administrators). users.create is frontend only (deviation H-2).

python3 provision-admin.py [out.json]
Every service is gated by require_query admin_check (404, non-admins learn nothing) plus a denied response rule.
H-2: no rule writes app_user.password (rule record writes do not hash credentials, see the Task 18 incident). Administrator
user creation goes through the authenticated form user_create_authenticated, whose submit route hashes credentials.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
DENIED = {'error': {'message': 'This record could not be found.'}}
ADMIN_CHECK = '6efa0c06-3d43-49f4-a280-154e66799afd'
def patch(status, body): return [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': status}, {'op': 'replace', 'path': '/body', 'value': body}]}]
def gate(name):
    L._rule(name + '.gate', name, 'post_save', [P.require(ADMIN_CHECK, {'actor': L.ACTOR}, 404), P.setfields({'gatePassed': True})], priority=-90, condition=P.guarded(name, {'var': 'after.valid'}))
P.op('function.normalize.H2', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-H2')
P.op('function.users.respond', 'create_function', name='byof-users-respond', source=(P.ROOT / 'services/users-respond.ts').read_text(), idempotency_key='wgd-byof-users-respond-v1')
# ---- users.list
name = 'users.list'
P.op('service.' + name, 'create_service', name=name, service_type='webhook_in', base_url='mero://inbound/' + name, auth_type='none', settings={'public': False}, description='BYOF (administrators): every account with its roster admin flag.')
L._rule(name + '.normalize', name, 'post_save', [{'type': 'run_function', 'params': {'function_id': L.NORMALIZE, 'payload': '{{payload}}', 'name': name}}], priority=-100)
gate(name)
cols = ['key', 'email', 'display_name', 'user_name', 'is_active', 'is_admin', 'last_login', 'timezone', 'oauth_provider']
users = P.query('users_all_rows', {'fromModel': 'app_user', 'fromAlias': 'app_user', 'select': [P.field('app_user', c) for c in cols], 'orderBy': [{'field': P.field('app_user', 'display_name'), 'direction': 'asc'}], 'limit': 1001})
admins = P.query('users_admins_rows', {'fromModel': 'admin_flag', 'fromAlias': 'af', 'select': [P.field('af', 'user_id')], 'where': P.group(P.condition('af', 'revoked_at', 'is_null')), 'limit': 1001})
ok = P.guarded(name, {'var': 'after.valid'}, {'var': 'after.gatePassed'})
L._rule(name + '.users.dataset', name, 'post_save', [{**P.require(users, {}), 'result_field': 'usersRows', 'allow_empty': True}], priority=-50, condition=ok)
L._rule(name + '.admins.dataset', name, 'post_save', [{**P.require(admins, {}), 'result_field': 'adminsRows', 'allow_empty': True}], priority=-49, condition=ok)
L._rule(name + '.respond', name, 'response', patch(503, {'error': {'message': 'This information could not be loaded. Please try again.'}}) + [
    {'type': 'run_function', 'params': {'function_id': P.ref('function.users.respond'), 'name': name}},
    {'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': '{{after.resultStatus}}'}, {'op': 'replace', 'path': '/body', 'value': '{{after.result}}'}]}], condition=P.guarded(name, {'or': [{'!': {'var': 'after.valid'}}, {'var': 'after.gatePassed'}]}))
L._rule(name + '.denied', name, 'response', patch(404, DENIED), priority=10, condition=P.guarded(name, {'var': 'after.valid'}, {'!': {'var': 'after.gatePassed'}}))
# ---- users.update
name = 'users.update'
L.write_service(name, 'BYOF (administrators): display name, time zone, active flag and Google link (oauth_provider and oauth_subject together) of an account. Never password, email or is_admin.')
gate(name)
target = P.query('users_update_target_guard', {'fromModel': 'app_user', 'fromAlias': 'app_user', 'select': [P.field('app_user', 'key')], 'where': P.group(P.condition('app_user', 'key', '=', ':id')), 'limit': 1})
okg = P.guarded(name, {'var': 'after.valid'}, {'var': 'after.gatePassed'})
L._rule(name + '.target.guard', name, 'post_save', [P.require(target, {'id': L.n('id')}, 404), P.setfields({'targetId': '{{query_rows.0.key}}'})], priority=-80, condition=okg)
selfie = {'==': [{'var': 'after.normalized.id'}, {'var': 'actor.id'}]}
L._rule(name + '.self.flag', name, 'post_save', [P.setfields({'selfDeactivate': True})], priority=-70, condition=P.guarded(name, {'var': 'after.valid'}, {'var': 'after.gatePassed'}, selfie, {'==': [{'var': 'after.normalized.fields.is_active'}, False]}))
F = lambda k: '{{after.normalized.fields.' + k + '}}'
L.write(name, [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'display_name': F('display_name'), 'timezone': F('timezone'), 'is_active': F('is_active')}, 'trigger_rules': False}],
        P.guarded(name, {'var': 'after.valid'}, {'var': 'after.gatePassed'}, {'var': 'after.targetId'}, {'!': {'var': 'after.selfDeactivate'}}, {'!': {'var': 'after.normalized.oauthTouched'}}))
# FED-03: Google linking. provider and subject are written together, and only when the request carried either key.
L._rule(name + '.write.oauth', name, 'post_save', [P.setfields({'guardsPassed': True}), {'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'display_name': F('display_name'), 'timezone': F('timezone'), 'is_active': F('is_active'), 'oauth_provider': F('oauth_provider'), 'oauth_subject': F('oauth_subject')}, 'trigger_rules': False}, P.setfields({'saved': True})],
        settings={'on_failure': 'abort'}, condition=P.guarded(name, {'var': 'after.valid'}, {'var': 'after.gatePassed'}, {'var': 'after.targetId'}, {'!': {'var': 'after.selfDeactivate'}}, {'var': 'after.normalized.oauthTouched'}))
L._rule(name + '.denied', name, 'response', patch(404, DENIED), priority=10, condition=P.guarded(name, {'var': 'after.valid'}, {'!': {'var': 'after.targetId'}}))
L._rule(name + '.self', name, 'response', patch(422, {'error': {'message': 'You cannot deactivate your own account.'}}), priority=20, condition=P.guarded(name, {'var': 'after.selfDeactivate'}))
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/H2.json')
