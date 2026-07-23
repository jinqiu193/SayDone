import os
import subprocess

os.chdir(r"e:\SayIt-main\SayIt-main")

# Find and mark all nul files for deletion
nul_files = []
for root, dirs, files in os.walk('.'):
    for f in files:
        if f.lower() == 'nul':
            path = os.path.join(root, f)
            nul_files.append(path)
            print(f"Found: {path}")

# Try to delete nul files using Windows command
for path in nul_files:
    try:
        # Use del command in Windows
        result = subprocess.run(
            ['cmd', '/c', 'del', '/f', '/q', path.replace('/', '\\')],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"Deleted: {path}")
        else:
            print(f"Failed to delete {path}: {result.stderr}")
    except Exception as e:
        print(f"Error deleting {path}: {e}")

# Write gitignore
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
nul
''')

# Add files one by one, skipping nul
result = subprocess.run(['git', 'add', '.'], capture_output=True, text=True)
if result.returncode != 0:
    print(f"git add failed: {result.stderr}")
    # Try with explicit paths
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'target', 'dist', '.git']]
        for f in files:
            if f.lower() != 'nul':
                path = os.path.join(root, f).replace('\\', '/')
                subprocess.run(['git', 'add', path], capture_output=True)
else:
    print("git add OK")

# Commit
result = subprocess.run(
    ['git', 'commit', '-m', 'Initial commit: 言出，文成 v0.0.7'],
    capture_output=True, text=True
)
print("git commit:", result.returncode)
print(result.stdout[:1000] if result.stdout else result.stderr)
