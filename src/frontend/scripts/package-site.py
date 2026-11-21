from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
import json

root = Path(__file__).resolve().parent.parent
archive = root / 'site.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
    for file in sorted((root / 'dist').rglob('*')):
        if file.is_file():
            bundle.write(file, file.relative_to(root / 'dist'))
print(json.dumps({'archive': str(archive), 'archive_sha256': sha256(archive.read_bytes()).hexdigest(), 'archive_size_bytes': archive.stat().st_size}))
