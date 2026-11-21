"""Emit the live-only rule changes of Task 9 (creator-grant redirect removal, persist-create-fields rules) as plan operations.

Source of truth: services/live-fixes-2026-10-11.json, keyed by the live rule id. update_rule entries replace the existing rule;
create_rule entries recreate a rule that a rebuilt application will not have (their id key is only a label)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
for rule_id, entry in json.loads((P.ROOT / 'services/live-fixes-2026-10-11.json').read_text()).items():
    if entry['op'] == 'update_rule': P.op('livefix.' + rule_id, 'update_rule', rule_id=rule_id, body=entry['body'])
    else: P.op('livefix.' + entry['body']['name'].replace(' ', '-'), 'create_rule', body=entry['body'])
# model-scoped rules carry no service scope, so the per-service action budget in L.emit does not apply
out = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/live-fixes.json'); out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'operations': P.OPS}, indent=2) + '\n'); print(f'{len(P.OPS)} operations -> {out}')
