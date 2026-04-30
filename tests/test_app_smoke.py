import os
os.environ['SQLITE_PATH'] = '/tmp/yuanxing_step1_test.db'
try:
    os.remove(os.environ['SQLITE_PATH'])
except FileNotFoundError:
    pass

from app import app


def test_login_inventory_shipping_flow():
    c = app.test_client()
    r = c.post('/api/login', json={'username':'陳韋廷','password':'1234'})
    assert r.status_code == 200
    assert r.get_json()['success'] is True
    r = c.post('/api/customers', json={'name':'山益','region':'北區'})
    assert r.status_code == 200
    r = c.post('/api/master_orders', json={'customer_name':'山益','product_text':'80x30x125=111+132x3','material':'白鐵','zone':'A'})
    assert r.status_code == 200
    item = r.get_json()['items'][0]
    r = c.post('/api/ship-preview', json={'customer_name':'山益','weight_input':2.5,'items':[{'source':'master_orders','id':item['id'],'qty':1}]})
    assert r.status_code == 200
    assert r.get_json()['preview']['can_submit'] is True
    r = c.post('/api/ship', json={'customer_name':'山益','items':[{'source':'master_orders','id':item['id'],'qty':1}]})
    assert r.status_code == 200
    assert r.get_json()['success'] is True
