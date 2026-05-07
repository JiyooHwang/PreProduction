@echo off
chcp 65001 >nul
title ShotBreakdown - Stop

cd /d E:\Claude\preproduction
if errorlevel 1 (
    echo [ERROR] Project folder not found.
    pause
    exit /b 1
)

echo ================================================
echo   ShotBreakdown - Stop
echo ================================================
echo.

echo Stopping containers...
docker compose --profile demo down

echo.
echo ================================================
echo  Stopped. Site is offline.
echo  Press any key to close this window.
echo ================================================
pause >nul
