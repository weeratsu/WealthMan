@echo off
chcp 65001 >nul
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
where python >nul 2>nul
if %errorlevel%==0 (
    python parse_investments.py %*
) else (
    py parse_investments.py %*
)
set RC=%errorlevel%
echo.
if %RC%==0 ( echo Done. ) else ( echo ** Error occurred ^(code %RC%^) - see log above ** )
echo.
echo Closing automatically...
timeout /t 3 >nul
endlocal
