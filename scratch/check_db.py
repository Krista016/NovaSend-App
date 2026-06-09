import sqlite3
import os

db_path = 'novasend.db'
print(f"Checking database at {os.path.abspath(db_path)}")
print(f"File exists: {os.path.exists(db_path)}")
print(f"File size: {os.path.getsize(db_path)} bytes")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("Tables:")
for t in tables:
    print(f"  - {t[0]}")
    # Print schema
    cursor.execute(f"PRAGMA table_info({t[0]})")
    cols = cursor.fetchall()
    for col in cols:
        print(f"    * {col[1]} ({col[2]})")
conn.close()
