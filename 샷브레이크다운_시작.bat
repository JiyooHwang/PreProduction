@echo off
chcp 65001 >nul
title ShotBreakdown - Start

cd /d E:\Claude\preproduction
if errorlevel 1 (
    echo [ERROR] Project folder not found.
    echo E:\Claude\preproduction folder must exist.
    echo If installed elsewhere, edit this .bat file
    echo and change the cd path on line 4.
    pause
    exit /b 1
)

echo ================================================
echo   ShotBreakdown - Update + Start
echo ================================================
echo.

echo [1/3] Pulling latest code from GitHub...
echo ------------------------------------------------
rem 현재 체크아웃된 브랜치 그대로 pull (브랜치별 개발 지원)
git pull
if errorlevel 1 (
    echo.
    echo [WARN] git pull failed. Using existing code.
    timeout /t 3 >nul
)
echo.

echo [2/3] Checking Docker Desktop...
echo ------------------------------------------------
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop is not running.
    echo Start Docker Desktop from Start Menu, wait 1-2 min, retry.
    pause
    exit /b 1
)
echo Docker OK
echo.

echo [3/3] Building and starting containers...
echo ------------------------------------------------
echo First time / code changed: 5-15 min
echo Otherwise: 1-2 min
echo.
echo ================================================
echo  When ready, open in browser:
echo    http://localhost:3000
echo.
echo  External URL: see "외부공유주소_보기.bat"
echo.
echo  To stop: press Ctrl + C in this window
echo ================================================
echo.

docker compose --profile demo up --build

echo.
echo ================================================
echo  Containers stopped.
echo  Press any key to close this window.
echo ================================================
pause >nul
