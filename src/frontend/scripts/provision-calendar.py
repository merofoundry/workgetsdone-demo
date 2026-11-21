"""Milestone L, Task 26: dashboard.agenda accepts windowDays (integer 7..42, default 14).

python3 provision-calendar.py [out.json]
One op: update_function on byof-normalize with the whole services/normalize.ts. byof-respond is unchanged: it already derives the
inclusive windowEnd from normalized.windowEnd (services/respond.test.ts pins 7, 14 and 42 day windows), so no respond op is emitted.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
P.op('function.normalize.L', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-L')
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/L-calendar.json')
