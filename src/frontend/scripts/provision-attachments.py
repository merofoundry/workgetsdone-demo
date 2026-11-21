"""Task 20: notes.read carries the note's visible attachments (a files dataset) for the Attachments panel.

python3 provision-attachments.py [out.json]   -> 1 update_function (respond), 1 create_saved_query, 1 create_rule
The dataset rule runs after the other notes.read datasets; respond.ts reads filesRows (it need not be in `expected`, a missing
dataset yields an empty list).
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
NOTES_READ = 'd12d7537-4ff9-40b0-90bc-63d2a96eb73e'
P.op('function.respond.I', 'update_function', function_id=L.RESPOND, source=(P.ROOT / 'services/respond.ts').read_text(), idempotency_key='wgd-full-build-respond-I')
ast = P.data_query('note_file', [P.condition('note_file', 'note', '=', ':id')])
q = P.query('notes_read_files_rows', ast)
body = {'name': 'byof notes.read.files.dataset', 'trigger': 'webhook_received', 'phase': 'post_save', 'priority': -45, 'run_as': 'actor', 'isActive': True, 'scope': {'service_config_id': NOTES_READ},
        'condition': P.guarded('notes.read', {'var': 'after.valid'}),
        'actions': [{**P.require(q, P.parameters(ast)), 'result_field': 'filesRows', 'allow_empty': True}]}
P.op('rule.notes.read.files.dataset', 'create_rule', body=body)
Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-attachments.json').write_text(json.dumps({'operations': P.OPS}, indent=2) + '\n')
print(len(P.OPS), 'operations')
