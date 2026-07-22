import sqlite3
db = sqlite3.connect(r'C:/Users/Administrator/AppData/Local/com.saydone.app/saydone.db')
print('schema_migrations rows:')
for r in db.execute('SELECT version, name, applied_at FROM schema_migrations ORDER BY version'):
    print(' ', r)
print('all tables:')
for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    print(' ', r[0])
