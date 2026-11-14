@echo off
REM Orange installer for Windows (cmd)
echo Installing Orange...
py -m pip install --user --upgrade "%~dp0." || python -m pip install --user --upgrade "%~dp0."
py -m orange install || python -m orange install
echo.
echo Close this window and open a new cmd, then type: orange
