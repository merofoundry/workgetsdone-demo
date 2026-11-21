"""Append an authoring result file to BUILD_LOG.md as a new entry. Never rewrites earlier text."""
import json, sys
from datetime import datetime, timezone
from pathlib import Path
log = Path(__file__).resolve().parents[2] / 'BUILD_LOG.md'
results = json.loads(Path(sys.argv[1]).read_text()); heading = sys.argv[2]
lines = [f"\n\n### {datetime.now(timezone.utc).strftime('%Y-%m-%d')} — {heading}\n"]
for key, r in results.items():
    lines.append(f"- {r.get('at', '')} — {r.get('tool', '')} {key}: " + (f"succeeded; id {r['id']}" if r.get('ok') else f"FAILED {r.get('error', '')}"))
with log.open('a') as f: f.write('\n'.join(lines) + '\n')
print(f'{len(results)} lines appended to {log}')
