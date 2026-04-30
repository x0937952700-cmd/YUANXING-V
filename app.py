from flask import Flask, render_template, jsonify, url_for
import os
import psycopg2

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'yuanxing-clean-ui-shell')

MODULES = {
    'inventory_page': ('inventory', '庫存'),
    'orders_page': ('orders', '訂單'),
    'master_order_page': ('master_order', '總單'),
    'ship_page': ('ship', '出貨'),
    'shipping_query_page': ('shipping_query', '出貨查詢'),
    'warehouse_page': ('warehouse', '倉庫圖'),
    'customers_page': ('customers', '客戶資料'),
    'todos_page': ('todos', '代辦事項'),
}

def username():
    return os.environ.get('YX_USERNAME', '陳韋廷')

@app.route('/', methods=['GET', 'HEAD'])
def home():
    return render_template('index.html', username=username(), title='沅興木業')

@app.route('/login', methods=['GET', 'HEAD'])
def login_page():
    return render_template('login.html', username=username(), title='登入')

@app.route('/settings', methods=['GET', 'HEAD'])
def settings_page():
    return render_template('settings.html', username=username(), title='設定', is_admin=True)

@app.route('/today-changes', methods=['GET', 'HEAD'])
def today_changes_page():
    return render_template('today_changes.html', username=username(), title='今日異動')

for endpoint, (module_key, title) in MODULES.items():
    route = '/' + module_key.replace('_', '-')
    if endpoint == 'master_order_page':
        route = '/master-order'
    if endpoint == 'shipping_query_page':
        route = '/shipping-query'
    def make_view(m=module_key, t=title):
        def view():
            return render_template('module.html', username=username(), title=t, module_key=m)
        return view
    app.add_url_rule(route, endpoint, make_view(), methods=['GET', 'HEAD'])

@app.route('/api/db-check', methods=['GET'])
def db_check():
    database_url = os.environ.get('DATABASE_URL', '')
    if not database_url:
        return jsonify(ok=False, message='DATABASE_URL 尚未設定')
    try:
        conn = psycopg2.connect(database_url, connect_timeout=5)
        cur = conn.cursor()
        cur.execute('select 1')
        cur.close()
        conn.close()
        return jsonify(ok=True, message='PostgreSQL 連線正常')
    except Exception as exc:
        return jsonify(ok=False, message=str(exc)), 500

@app.route('/api/login', methods=['POST'])
def api_login():
    return jsonify(ok=True, redirect=url_for('home'))

@app.route('/health', methods=['GET', 'HEAD'])
def health():
    return 'ok'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', '5000')))
