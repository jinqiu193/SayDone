@echo off
cd /d E:\SayIt-main\SayIt-main\client
call node_modules\.bin\tauri.cmd build --no-bundle
echo ExitCode: %ERRORLEVEL%
