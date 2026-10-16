@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ============================================
echo   WealthMan - REBUILD (full scan)
echo ============================================
echo.
echo REBUILD mode: re-reading ALL PDFs (root + every year folder)
echo (PDF password: taken from DIME_PDF_PW env var or config.json; else you will be prompted)
echo.
where python >nul 2>nul
if %errorlevel%==0 (
    python parse_investments.py rebuild
) else (
    py parse_investments.py rebuild
)
set RC=%errorlevel%
echo.
if %RC%==0 ( echo Done. ) else ( echo ** Error occurred ^(code %RC%^) - see log above ** )
echo.
echo Closing automatically...
timeout /t 3 >nul
endlocal
