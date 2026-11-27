@echo off
setlocal EnableExtensions
set "VARA_TABLETOP_SCRIPT=%~dp0scripts\open-tabletop.ps1"
if exist "%VARA_TABLETOP_SCRIPT%" goto found
if not defined VARA_TABLETOP_PROJECT goto documents
set "VARA_TABLETOP_SCRIPT=%VARA_TABLETOP_PROJECT%\scripts\open-tabletop.ps1"
if exist "%VARA_TABLETOP_SCRIPT%" goto found
:documents
set "VARA_TABLETOP_SCRIPT=%USERPROFILE%\Documents\Vara-DnD\.task-tools\tabletop-prototype\scripts\open-tabletop.ps1"
if exist "%VARA_TABLETOP_SCRIPT%" goto found
set "VARA_TABLETOP_SCRIPT=%USERPROFILE%\Documents\Vara-DnD\scripts\open-tabletop.ps1"
if exist "%VARA_TABLETOP_SCRIPT%" goto found
echo Could not find the installed Vara tabletop prototype.
echo Open this launcher from the prototype checkout, or set VARA_TABLETOP_PROJECT.
if /I "%~1"=="--locate" exit /b 1
echo.
pause
exit /b 1
:found
if /I "%~1"=="--locate" goto locate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%VARA_TABLETOP_SCRIPT%" %*
set "VARA_TABLETOP_LAUNCH_EXIT=%ERRORLEVEL%"
if "%VARA_TABLETOP_LAUNCH_EXIT%"=="0" exit /b 0
echo.
echo The tabletop could not start. Copy the error above before closing this window.
echo.
pause
exit /b %VARA_TABLETOP_LAUNCH_EXIT%
:locate
echo "%VARA_TABLETOP_SCRIPT%"
exit /b 0
