import psycopg2, os
def conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"))
