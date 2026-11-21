"""Merge service ids from authoring result files into public/services.json.

Usage: write-registry.py [--registry <path>] <results.json>...
Fails (exit 1, nothing written) if any service.* result is not ok or has no id.
"""
import json, sys
from pathlib import Path
args = sys.argv[1:]
registry = Path(__file__).resolve().parent.parent / 'public/services.json'
if args[:1] == ['--registry']:
    registry = Path(args[1]); args = args[2:]
data = json.loads(registry.read_text())
merged, bad = {}, []
for file in args:
    for key, result in json.loads(Path(file).read_text()).items():
        if not key.startswith('service.'): continue
        if result.get('ok') is True and result.get('id'):
            merged[key[len('service.'):]] = result['id']
        else:
            bad.append(f'{key} ({file})')
if bad:
    for b in bad: print('missing service id: ' + b, file=sys.stderr)
    sys.exit(1)
data['services'].update(merged)
registry.write_text(json.dumps(data, indent=2) + '\n')
print(f"{len(data['services'])} services in {registry}")
