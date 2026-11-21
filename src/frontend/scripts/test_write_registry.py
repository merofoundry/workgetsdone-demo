import json, subprocess, sys, tempfile, unittest
from pathlib import Path
SCRIPT = Path(__file__).with_name('write-registry.py')

class WriteRegistryTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.registry = self.dir / 'services.json'
        self.registry.write_text(json.dumps({'services': {'old': 'O1'}}))
        self.good = self.dir / 'good.json'
        self.good.write_text(json.dumps({'service.x': {'tool': 'create_service', 'ok': True, 'id': 'X1'}, 'rule.x.n': {'ok': False}}))
        self.bad = self.dir / 'bad.json'
        self.bad.write_text(json.dumps({'service.x': {'tool': 'create_service', 'ok': False, 'error': 'boom'}}))
    def run_script(self, *files):
        return subprocess.run([sys.executable, str(SCRIPT), '--registry', str(self.registry), *map(str, files)], capture_output=True, text=True)
    def test_good_run_merges_and_keeps_existing(self):
        r = self.run_script(self.good)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(self.registry.read_text())['services'], {'old': 'O1', 'x': 'X1'})
    def test_bad_run_fails_and_leaves_registry_unchanged(self):
        before = self.registry.read_text()
        r = self.run_script(self.good, self.bad)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('service.x', r.stderr)
        self.assertEqual(self.registry.read_text(), before)
if __name__ == '__main__': unittest.main()
