import copy
import json
from pathlib import Path
import tempfile
import unittest
import threading
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch

import app


class StarterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = app.Store(Path(self.temp.name))
        self.profile = json.loads((app.ROOT / 'examples/profile.json').read_text(encoding='utf-8'))
        self.store.save_profile(self.profile)
        self.text = (app.ROOT / 'examples/messages.jsonl').read_text(encoding='utf-8')
        self.config = dict(api_key='dummy-never-sent', base_url='https://api.deepseek.com', model='test-model', thinking=True, effort='high')

    def test_incremental_import_preserves_reply_and_text(self):
        self.assertEqual(self.store.import_messages(self.text)['inserted'], 2)
        self.assertEqual(self.store.import_messages(self.text)['duplicates'], 2)
        row = self.store.evidence('demo-2')
        self.assertEqual(row['reply_to_message_id'], 'demo-1')
        self.assertEqual(row['quoted_text'], '今天想去散步。')
        self.assertEqual(row['timestamp'], '2026-01-01T02:01:00+00:00')

    def test_conflict_rolls_back_whole_batch(self):
        self.store.import_messages(self.text)
        rows = [json.loads(line) for line in self.text.splitlines()]
        first = copy.deepcopy(rows[0]); first['message_id'] = 'new-before-conflict'
        rows[1]['text'] = 'changed'
        with self.assertRaises(ValueError):
            self.store.import_messages(json.dumps([first, rows[1]]))
        with self.assertRaises(ValueError):
            self.store.evidence('new-before-conflict')
        self.assertNotEqual(self.store.evidence('demo-2')['text'], 'changed')

    def test_role_mapping_and_timezone_are_required(self):
        row = json.loads(self.text.splitlines()[0])
        row['speaker_id'] = 'another-person'
        with self.assertRaises(ValueError):
            self.store.import_messages(json.dumps([row]))
        row['speaker_id'] = 'demo-user'; row['timestamp'] = '2026-01-01T10:00:00'
        with self.assertRaises(ValueError):
            self.store.import_messages(json.dumps([row]))

    def test_memory_evidence_versioning_and_soft_delete(self):
        self.store.import_messages(self.text)
        data = dict(summary='虚构人物询问路线偏好', type='behavior', level='explicit_fact', confidence=.8, evidence=[])
        with self.assertRaises(ValueError):
            self.store.save_memory(data)
        data['evidence'] = ['demo-2']
        saved = self.store.save_memory(data)
        saved['summary'] = '修改后的观察'; self.store.save_memory(saved)
        self.store.delete_memory(saved['id'])
        self.assertEqual(self.store.memories(), [])
        with self.store.connect() as conn:
            self.assertEqual(conn.execute('SELECT count(*) FROM memory_history').fetchone()[0], 3)
            self.assertEqual(conn.execute('SELECT count(*) FROM messages').fetchone()[0], 2)

    def test_identity_and_request_preview(self):
        self.store.import_messages(self.text)
        result = app.preview(self.store, '散步', 'test-session', self.config)
        self.assertIn(self.profile['target_name'], result['payload']['messages'][0]['content'])
        self.assertNotIn(self.config['api_key'], app.encode(result))
        self.assertEqual(result['payload']['thinking'], {'type': 'enabled'})
        with patch('app.urlopen') as network:
            with self.assertRaises(ValueError):
                app.send(self.store, dict(message='散步', session_id='test-session', preview_id='wrong'), self.config)
            network.assert_not_called()

    def test_generated_chat_does_not_enter_evidence_or_memory(self):
        result = app.preview(self.store, '你好', 'session', self.config)
        class Reply:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b'{"choices":[{"message":{"content":"hello"}}]}'
        with patch('app.urlopen', return_value=Reply()):
            response = app.send(self.store, dict(message='你好', session_id='session', preview_id=result['preview_id']), self.config)
        self.assertEqual(response['classification'], 'generated_content')
        self.assertEqual(len(self.store.recent('session')), 2)
        self.assertEqual(self.store.memories(), [])
        with self.store.connect() as conn:
            self.assertEqual(conn.execute('SELECT count(*) FROM messages').fetchone()[0], 0)

    def test_identity_cannot_switch_in_same_database(self):
        changed = dict(self.profile, target_id='other-id')
        with self.assertRaises(ValueError): self.store.save_profile(changed)

    def test_local_http_and_cross_site_guard(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), app.handler(self.store))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            with urlopen(base + '/') as response:
                self.assertEqual(response.status, 200)
                self.assertIn(b'Persona Starter', response.read())
                self.assertIn("frame-ancestors 'none'", response.headers['Content-Security-Policy'])
            with urlopen(base + '/api/state') as response:
                state = json.loads(response.read())
                self.assertEqual(state['profile']['target_id'], 'demo-target')
                self.assertNotIn('api_key', state)
            request = Request(base + '/api/profile', data=b'{}', headers={
                'Content-Type': 'application/json', 'X-Local-Request': '1',
                'Origin': 'https://unrelated.example'})
            with self.assertRaises(HTTPError) as rejected:
                urlopen(request)
            self.assertEqual(rejected.exception.code, 400)
            rejected.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
