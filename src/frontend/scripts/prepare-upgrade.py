"""Convert generated scoped plans to inactive updates of this build's live resources.

No MCP requests are made. Requires the reviewed platform patch before applying.
Usage: python3 scripts/prepare-upgrade.py READ_PLAN WRITE_PLAN OUTPUT
"""
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[2]
summary = json.loads((root / 'verification/2026-10-08-frontend/authoring-summary.json').read_text())
ids = {}
for group in summary.values():
    for key, value in group.items():
        if value.get('ok') and value.get('id'):
            ids[key] = value['id']

def resolve(value):
    if isinstance(value, list): return [resolve(item) for item in value]
    if isinstance(value, dict):
        if '$ref' in value:
            assert value['path'] == 'id'
            return ids[value['$ref']]
        return {key: resolve(item) for key, item in value.items()}
    return value

operations = []
for plan_file in sys.argv[1:3]:
    for operation in json.loads(Path(plan_file).read_text())['operations']:
        name, key = operation['name'], operation['key']
        args = resolve(operation['arguments'])
        if name == 'create_service': continue
        resource_key = key
        if key.endswith('.dataset'): resource_key = key.removesuffix('.dataset') + '.count'
        resource_id = ids[resource_key]
        if name == 'create_function':
            name = 'update_function'
            args = {'application_id':args['application_id'], 'function_id':resource_id,
                    'source':args['source'], 'idempotency_key':key + '-scoped-v3'}
        elif name == 'create_saved_query':
            name = 'update_saved_query'; args['saved_query_id'] = resource_id
        elif name == 'create_rule':
            name = 'update_rule'; args['rule_id'] = resource_id
            assert args['body']['isActive'] is False
        else: raise ValueError(name)
        operations.append({'key':'scoped.'+key, 'name':name, 'arguments':args})
output = Path(sys.argv[3])
output.write_text(json.dumps({'buildLog':str(root/'BUILD_LOG.md'), 'operations':operations}, indent=2)+'\n')
print(f'{len(operations)} inactive upgrade operations written to {output}')
