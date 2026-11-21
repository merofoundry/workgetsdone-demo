"""Milestone H, Task 18: account.read, account.update, account.changePassword.

python3 provision-account.py [out.json]
account.read: dataset `me` (app_user where key = :actor, no credential column) -> byof-account-respond (own small function; byof-respond untouched).
account.update: update_record on the actor's own app_user row (display_name, timezone, user_name only).
account.changePassword: WITHDRAWN (H-1). Only a validating stub that answers 503; no password write, sessions list or slot rules are emitted
(rule update_record does not hash credential fields).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
APP_USER = 'ac9d3d8f-7737-4cb8-ab2d-a012f7cd3d9f'; APP_SESSION = '1f5a99c8-af77-4134-889a-57efa0a5e271'
def patch(status, body): return [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': status}, {'op': 'replace', 'path': '/body', 'value': body}]}]
P.op('function.normalize.H', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-H')
P.op('function.account.respond', 'create_function', name='byof-account-respond', source=(P.ROOT / 'services/account-respond.ts').read_text(), idempotency_key='wgd-byof-account-respond-v1')
valid = {'var': 'after.valid'}
# ---- account.read
name = 'account.read'
P.op('service.' + name, 'create_service', name=name, service_type='webhook_in', base_url='mero://inbound/' + name, auth_type='none', settings={'public': False}, description='BYOF: the signed-in user own profile.')
L._rule(name + '.normalize', name, 'post_save', [{'type': 'run_function', 'params': {'function_id': L.NORMALIZE, 'payload': '{{payload}}', 'name': name}}], priority=-100)
cols = ['key', 'email', 'display_name', 'user_name', 'timezone', 'last_login', 'is_active', 'is_admin', 'oauth_provider']
me = P.query('account_read_me_rows', {'fromModel': 'app_user', 'fromAlias': 'app_user', 'select': [P.field('app_user', c) for c in cols], 'where': P.group(P.condition('app_user', 'key', '=', ':actor')), 'limit': 1})
L._rule(name + '.me.dataset', name, 'post_save', [{**P.require(me, {'actor': L.ACTOR}), 'result_field': 'meRows', 'allow_empty': True}], priority=-50, condition=P.guarded(name, valid))
admin = L.P.require('6efa0c06-3d43-49f4-a280-154e66799afd', {'actor': L.ACTOR}, 404); admin.update({'result_field': 'adminRows', 'allow_empty': True})  # roster decides isAdmin (fix: app_user.is_admin is not set for bob)
L._rule(name + '.admin.dataset', name, 'post_save', [admin], priority=-49, condition=P.guarded(name, valid))
L._rule(name + '.respond', name, 'response', patch(503, {'error': {'message': 'This information could not be loaded. Please try again.'}}) + [
    {'type': 'run_function', 'params': {'function_id': P.ref('function.account.respond'), 'name': name}},
    {'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': '{{after.resultStatus}}'}, {'op': 'replace', 'path': '/body', 'value': '{{after.result}}'}]}], condition=P.guarded(name))
# ---- account.update
name = 'account.update'
L.write_service(name, 'BYOF: update the signed-in user own display name, time zone and user name.')
F = lambda k: '{{after.normalized.fields.' + k + '}}'
L.write(name, [{'type': 'update_record', 'target_record_id': L.ACTOR, 'data': {'display_name': F('display_name'), 'timezone': F('timezone'), 'user_name': F('user_name')}, 'trigger_rules': False}], P.guarded(name, valid))
# ---- account.changePassword: validating stub (deviation H-1)
# Self-service password change is withdrawn: a rule `update_record` stores the value raw and does NOT apply the password_hash
# credential strategy, so the earlier chain (session list_records, eight revoke slots, password write) wrote a plaintext password
# (incident entry in BUILD_LOG.md, 2026-10-11). The generator therefore never emits a password write, a sessions rule or slot rules.
# The service only validates input (422) and answers 503. Do not re-add the chain until rule record writes hash credential fields.
name = 'account.changePassword'
L.write_service(name, 'BYOF (withdrawn, H-1): validates the request and answers 503; password changes are handled by an administrator.')
# write_service emits a success response guarded by after.saved; nothing in this stub ever sets saved, so it can never fire.
L._rule(name + '.withdrawn', name, 'response', patch(503, {'error': {'message': 'Password changes are handled by an administrator for now.'}}), priority=-50, condition=P.guarded(name, valid))
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/H.json')
