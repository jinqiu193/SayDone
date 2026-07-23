import os
import subprocess

os.chdir(r"e:\SayIt-main\SayIt-main")

# Write new gitignore that explicitly excludes nul
with open('.gitignore', 'w') as f:
    f.write('''# Dependencies
node_modules/

# Build output
dist/
build/

# Rust build
target/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
runtime/

# Backup files
*.bak
*~
''')

# Use git add with explicit paths, excluding problematic files
result = subprocess.run(
    ['git', 'add', '-A', '--', ':!client/nul', ':!nul'],
    capture_output=True, text=True
)
print("git add:", result.stderr if result.returncode else "OK")
print(result.stdout)

# Commit
result = subprocess.run(
    ['git', 'commit', '-m', 'Initial commit: 言出，文成 v0.0.7'],
    capture_output=True, text=True
)
print("git commit:", result.stderr if result.returncode else "OK")
print(result.stdout[:500] if result.stdout else "")
