@echo off
cd /d "%~dp0"
where powershell >nul 2>&1
if errorlevel 1 (
  echo PowerShell no esta disponible.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\CONFIGURAR-SERVIDOR.ps1
pause
