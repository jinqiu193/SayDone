# Stop old processes
$conns = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
$conns2 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
foreach ($c in $conns2) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

# Start backend
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location 'f:\rag-main\backend'; .\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 3

# Start frontend
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location 'f:\rag-main\frontend'; npm run dev"

Write-Host "`nServices restarted!"
Write-Host "Frontend:  http://localhost:3000"
Write-Host "Backend:   http://localhost:8000"
