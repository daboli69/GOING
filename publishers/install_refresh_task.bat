@echo off
rem Registers "GOING site refresh": every hour at :20, start a site refresh if GitHub's own schedule has not run one.
rem Run once. To remove it later: schtasks /Delete /TN "GOING site refresh" /F
schtasks /Create /F /TN "GOING site refresh" /SC HOURLY /MO 1 /ST 00:20 /TR "wscript.exe \"%~dp0run_refresh_hidden.vbs\""
if errorlevel 1 (echo Could not create the task.& exit /b 1)
echo Created "GOING site refresh". It runs hourly at :20 while this PC is on and you are signed in.
