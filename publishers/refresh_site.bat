@echo off
setlocal
cd /d "%~dp0.."
rem Starts a site refresh unless GitHub already ran one in the last 40 minutes. Output: publishers\last_refresh.log
python "%~dp0refresh_site.py" > "%~dp0last_refresh.log" 2>&1
exit /b %errorlevel%
