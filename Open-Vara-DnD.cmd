@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-local.ps1" %*
if errorlevel 1 (
    echo.
    echo Press any key to close this window.
    pause >nul
    exit /b 1
)
exit /b 0
