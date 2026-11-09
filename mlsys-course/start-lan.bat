@echo off
rem Starts the course for this computer AND your phone/tablet on the same Wi-Fi (prints a private link).
cd /d "%~dp0"
call start.bat --lan %*
