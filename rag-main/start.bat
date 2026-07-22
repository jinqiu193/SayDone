@echo off
chcp 65001 >nul 2>&1
title RAG Enterprise Knowledge Base

echo ============================================
echo   RAG Enterprise Knowledge Base Launcher
echo ============================================
echo.

:: Check Python venv
if not exist "backend\venv\Scripts\python.exe" (
    echo [ERROR] Python venv not found at backend\venv\
    echo Please run: cd backend ^&^& python -m venv venv ^&^& venv\Scripts\pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    pause
    exit /b 1
)

:: Check node_modules
if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

:: Kill old processes on port 8000 and 3000
echo [1/3] Cleaning old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000.*LISTEN" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000.*LISTEN" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: Start backend
echo [2/3] Starting backend (port 8000)...
start "RAG-Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000"

:: Wait for backend to initialize
timeout /t 3 /nobreak >nul

:: Start frontend
echo [3/3] Starting frontend (port 3000)...
start "RAG-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo   Services started!
echo.
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:8000
echo   API Docs:  http://localhost:8000/docs
echo.
echo   Close the terminal windows to stop.
echo ============================================
echo.

:: Auto-open browser
timeout /t 3 /nobreak >nul
start http://localhost:3000
