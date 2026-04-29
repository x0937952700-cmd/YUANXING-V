import os
import tempfile
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
fd, path = tempfile.mkstemp(suffix='.db')
os.close(fd)
os.environ['SQLITE_PATH'] = path

from app import app  # noqa
from db import init_db  # noqa

init_db()
client = app.test_client()

r = client.get('/')
assert r.status_code == 200, r.status_code
assert '登入' in r.get_data(as_text=True)

r = client.head('/')
assert r.status_code == 200

r = client.post('/api/register', json={'username':'陳韋廷','password':'1234'})
assert r.status_code == 200, r.get_data(as_text=True)

r = client.get('/app')
assert r.status_code == 200
assert '沅興木業' in r.get_data(as_text=True)

r = client.get('/api/health')
assert r.json['ok']

r = client.post('/api/customers', json={'name':'山益','region':'north','common_materials':'花旗松','common_sizes':'100x30x063'})
assert r.json['ok']

r = client.post('/api/inventory', json={'material':'花旗松','product_text':'100x30x063=504x5+588','request_key':'k1'})
assert r.json['ok']

r = client.get('/api/inventory')
assert r.json['ok'] and len(r.json['items']) == 1
item = r.json['items'][0]

r = client.post('/api/inventory/%s/copy_to/master' % item['id'], json={'customer':'山益','deduct_source':True})
assert r.json['ok']

r = client.get('/api/items/by_customer?customer=山益')
assert r.json['ok'] and len(r.json['items']) >= 1
ship_item = r.json['items'][0]

r = client.post('/api/shipping/preview', json={'items':[ship_item], 'weight_per_cbm': 600})
assert r.json['ok'] and 'formula' in r.json

r = client.post('/api/shipping/confirm', json={'customer':'山益','items':[{'source_table': ship_item['source_table'], 'item_id': ship_item['id'], 'ship_qty': 1, 'product_text': ship_item['product_text']}], 'weight_per_cbm':600, 'request_key':'ship1'})
assert r.json['ok'], r.get_data(as_text=True)

r = client.get('/api/warehouse')
assert r.json['ok'] and len(r.json['cells']) >= 120
cell_id = r.json['cells'][0]['id']

r = client.post(f'/api/warehouse/cells/{cell_id}/items', json={'items':[{'customer':'山益','material':'花旗松','product_text':'100x30x063=504x5+588','pieces':6}]})
assert r.json['ok']

r = client.get('/api/activity')
assert r.json['ok']

r = client.get('/api/backup')
assert r.status_code == 200

print('CLEAN V1 smoke test passed')
