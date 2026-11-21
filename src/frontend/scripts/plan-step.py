#!/usr/bin/env python3
"""plan-step.py <plan.json> <authoring.json> [<key>]
No key: print the key of the first operation not yet recorded ok. With a key: print tool name and
arguments (refs replaced by recorded ids) as JSON."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
def load(p):
    try: return json.loads(Path(p).read_text())
    except FileNotFoundError: return {}
plan = json.loads(Path(sys.argv[1]).read_text())['operations']; auth = load(sys.argv[2])
ids = {k: v['id'] for k, v in auth.items() if v.get('ok') and v.get('id')}
if len(sys.argv) < 4:
    for o in plan:
        if o['key'] not in ids: print(o['key']); break
    else: print('NO PENDING KEY')
else:
    o = next(o for o in plan if o['key'] == sys.argv[3])
    try: args = L.resolve_refs(o['arguments'], ids)
    except KeyError as e: sys.exit('missing ref ' + str(e))
    print(json.dumps({'name': o['name'], 'arguments': args}))
