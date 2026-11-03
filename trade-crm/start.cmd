@echo off
rem Start trade-crm (no-op if it is already running).
rem NOTE: keep this file ASCII-only; cmd.exe parses .cmd as ANSI, so UTF-8
rem Chinese text would corrupt the batch file.
cd /d "%~dp0"
wscript.exe "%~dp0startup-entry.vbs"
powershell -NoProfile -Command "Start-Sleep -Seconds 4"
echo.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest 'http://127.0.0.1:4317/api/ping' -UseBasicParsing -TimeoutSec 6; Write-Host ('OK  ' + $r.Content) -ForegroundColor Green; Write-Host 'Open: http://127.0.0.1:4317' } catch { Write-Host 'Not ready yet. See logs\server.log' -ForegroundColor Yellow }"
echo.
pause
