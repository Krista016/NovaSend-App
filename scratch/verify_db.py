import sqlite3

def main():
    conn = sqlite3.connect('novasend.db')
    cursor = conn.cursor()

    # Get recent 3 campaigns for user 36
    cursor.execute("SELECT id, name, status, sent, failed, total, created_at FROM campaigns WHERE user_id=36 ORDER BY created_at DESC LIMIT 3")
    campaigns = cursor.fetchall()
    print("Recent Campaigns:")
    for camp in campaigns:
        print(camp)

    conn.close()

if __name__ == '__main__':
    main()
