import sqlite3

try:
    conn = sqlite3.connect("momo.db")
    cursor = conn.cursor()

    # Show available tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("Tables:", tables)

    # Try to read from the transactions table
    cursor.execute("SELECT * FROM transactions LIMIT 5")
    rows = cursor.fetchall()

    if not rows:
        print("No transactions found.")
    else:
        for row in rows:
            print(row)

except Exception as e:
    print("Error:", e)

finally:
    conn.close()