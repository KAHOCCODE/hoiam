@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0"

if "%~1"=="" goto PROMPT_PATH
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%scripts\import-local-config.ps1" -OldProject "%~1"
goto SETUP_DONE

:PROMPT_PATH
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%scripts\import-local-config.ps1"

:SETUP_DONE
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Setup was not completed. Read the message above.
  exit /b %EXIT_CODE%
)

echo.
echo [Hoi Am] Installing required packages...
pushd "%PROJECT_ROOT%"
call npm install --no-audit --no-fund
set "NPM_EXIT=%ERRORLEVEL%"
popd

if not "%NPM_EXIT%"=="0" (
  echo Package installation failed. Check Node.js and your internet connection.
  exit /b %NPM_EXIT%
)

echo.
echo Local setup completed.
echo Run run-local.cmd to open the website.
exit /b 0
