@echo off
rem Personal Blocker: one-click updater. Runs a temp copy of itself so the update can safely replace this file.
if /i not "%~1"=="--run" (
  copy /y "%~f0" "%TEMP%\pb-update.cmd" >nul
  call "%TEMP%\pb-update.cmd" --run "%~dp0"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~2update.ps1"
echo.
pause
