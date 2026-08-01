@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".vercel\project.json" (
  echo This folder is not linked to Vercel yet.
  echo Run: npx vercel@latest link
  exit /b 1
)

echo Pulling production environment variables from Vercel...
call npx vercel@latest env pull .env.local --environment=production

if errorlevel 1 (
  echo Environment pull failed.
  exit /b 1
)

echo .env.local was updated. Secret values were not printed.
exit /b 0
