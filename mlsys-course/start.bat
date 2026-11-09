@echo off
rem Starts the course on http://127.0.0.1:8765 (needs Python 3).
cd /d "%~dp0"
where py >nul 2>nul && (py -3 serve.py %* & goto :eof)
python serve.py %*
