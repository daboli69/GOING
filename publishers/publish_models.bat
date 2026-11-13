@echo off
setlocal
cd /d "%~dp0.."
rem Publishes the NFL and NBA ensemble outputs to GOING. Safe to run as often as you like:
rem nothing is pushed unless the forecasts changed. Output of the latest run: publishers\last_publish.log
python "%~dp0publish_models.py" --push > "%~dp0last_publish.log" 2>&1
exit /b %errorlevel%
