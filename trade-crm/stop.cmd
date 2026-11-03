@echo off
rem Stop trade-crm.
rem NOTE: keep this file ASCII-only.
cd /d "%~dp0"
node "%~dp0stop.mjs"
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
echo To use it again, double-click start.cmd
echo.
pause
