import os
import sqlite3
import json

def main():
    sql = os.environ.get('SQL_QUERY')
    if not sql:
        print("[]")
        return
        
    params_str = os.environ.get('SQL_PARAMS', '[]')
    params = json.loads(params_str)

    conn = sqlite3.connect('novasend.db')
    cursor = conn.cursor()
    cursor.execute(sql, params)

    if sql.strip().upper().startswith('SELECT'):
        res = cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        out = [dict(zip(cols, row)) for row in res]
        print(json.dumps(out))
    else:
        conn.commit()

    conn.close()

if __name__ == '__main__':
    main()
