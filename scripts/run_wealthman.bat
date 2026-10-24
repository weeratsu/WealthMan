@echo off
chcp 65001 >nul
REM ---- v4 (Oct 23 2026): wait for G: (Google Drive) to mount before doing anything, so a
REM     background scheduled run that fires before Drive is ready doesn't fail on missing files.
set "_gtry=0"
:waitG
if exist "G:\" goto :gok
set /a _gtry+=1
if %_gtry% geq 18 (
  echo [%DATE% %TIME%] G: (Google Drive) not mounted - investment notes NOT processed>>"%~dp0gmount_log.txt"
  exit /b 0
)
ping -n 6 127.0.0.1 >nul
goto :waitG
:gok
setlocal
cd /d "%~dp0"
echo ============================================
echo   WealthMan - Update investment data
echo ============================================
echo.
if /i "%~1"=="rebuild" (
    echo REBUILD mode: re-reading ALL PDFs ^(root + year folders^)
) else (
    echo Normal mode: reading only NEW PDFs at the root folder
    echo ^(to re-read everything, run:  run_wealthman.bat rebuild^)
)
echo Reading confirmation-note PDFs...
echo (PDF code: pass as an arg e.g. run_wealthman.bat 12111981, or DIME_PDF_PW env var, or config.json; else prompted)
echo.
if exist "C:\Users\USER\AppData\Local\Python\pythoncore-3.14-64\python.exe" (
    "C:\Users\USER\AppData\Local\Python\pythoncore-3.14-64\python.exe" parse_investments.py %*
) else (
  where python >nul 2>nul && ( python parse_investments.py %* ) || ( py parse_investments.py %* )
)
set RC=%errorlevel%
echo.
if %RC%==0 ( echo Done. ) else ( echo ** Error occurred ^(code %RC%^) - see log above ** )
echo.
echo Closing automatically...
ping -n 4 127.0.0.1 >nul
endlocal
exit /b 0
