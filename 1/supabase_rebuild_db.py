"""One-time Supabase/PostgreSQL schema reset for 沅興木業.

Usage on Render Shell or preDeploy once:
    YX_REBUILD_DATABASE=YES python supabase_rebuild_db.py

It drops only public schema objects on the database pointed to by
SUPABASE_DATABASE_URL or DATABASE_URL, then runs db.init_db() to create a clean
empty schema.  It will not run unless YX_REBUILD_DATABASE=YES.
"""
import os
import sys

if os.getenv("YX_REBUILD_DATABASE") != "YES":
    print("Refusing to reset database. Set YX_REBUILD_DATABASE=YES for this one-time rebuild.")
    sys.exit(2)

# Force production behavior: no silent SQLite fallback.
os.environ.setdefault("REQUIRE_POSTGRES", "1")

from db import get_db, init_db, USE_POSTGRES

if not USE_POSTGRES:
    raise RuntimeError("This reset script is for Supabase/PostgreSQL only. DATABASE_URL is not PostgreSQL.")

conn = get_db()
cur = conn.cursor()
print("Dropping public schema objects...")
cur.execute("DROP SCHEMA IF EXISTS public CASCADE")
cur.execute("CREATE SCHEMA public")
cur.execute("GRANT ALL ON SCHEMA public TO postgres")
cur.execute("GRANT ALL ON SCHEMA public TO public")
conn.commit()
cur.close()
conn.close()

print("Rebuilding 沅興木業 tables...")
init_db()
print("Done. New Supabase database is clean and initialized.")
