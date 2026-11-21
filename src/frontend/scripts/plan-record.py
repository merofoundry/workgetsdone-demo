#!/usr/bin/env python3
"""plan-record.py <authoring.json> <key> <tool> ok <id> | failed "<error>" """
import json, sys
from datetime import datetime, timezone
from pathlib import Path
p = Path(sys.argv[1]); key, tool, state = sys.argv[2:5]
data = json.loads(p.read_text()) if p.exists() else {}
e = {'tool': tool, 'ok': state == 'ok', 'id': sys.argv[5] if state == 'ok' else None, 'at': datetime.now(timezone.utc).isoformat()}
if state != 'ok': e['error'] = sys.argv[5]
data[key] = e  # latest attempt wins; matches write-registry.py and journal.py
p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(data, indent=2) + '\n')
