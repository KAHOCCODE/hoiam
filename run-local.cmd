@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0"
node "%PROJECT_ROOT%scripts\run-local.js"
exit /b %ERRORLEVEL%
