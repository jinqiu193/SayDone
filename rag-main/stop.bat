@echo off
chcp 65001 >nul 2>&1
title Stop RAG Services

echo Stopping RAG services...

:: Kill processes on port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000.*LISTEN" 2^>nul') do (
    echo Killing PID %%a on port 8000
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill processes on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000.*LISTEN" 2^>nul') do (
    echo Killing PID %%a on port 3000
    taskkill /F /PID %%a >nul 2>&1
)

:: Also kill by window title
taskkill /FI "WINDOWTITLE eq RAG-Backend" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq RAG-Frontend" /F >nul 2>&1

echo Done.
timeout /t 2 /nobreak >nul
