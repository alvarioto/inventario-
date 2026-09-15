@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Necesitas instalar Node.js LTS y volver a abrir este archivo.
  pause
  exit /b 1
)
if not exist .env.server (
  echo No existe .env.server. La app arrancara sin IA hasta configurarlo.
)
node scripts\SERVIR-LOCAL.mjs
if errorlevel 1 echo No se ha completado. Lee el error de arriba.
pause
