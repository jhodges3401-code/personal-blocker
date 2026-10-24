@echo off
rem One-time: puts an "Update Personal Blocker" shortcut on your desktop.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'),'Update Personal Blocker.lnk')); $s.TargetPath='%~dp0Update Personal Blocker.cmd'; $s.WorkingDirectory='%~dp0'; $s.Save(); Write-Host 'Shortcut created on your desktop.'"
pause
