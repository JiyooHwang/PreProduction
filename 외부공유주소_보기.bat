@echo off
chcp 65001 >nul
title Cloudflare Tunnel URL

cd /d E:\Claude\preproduction
if errorlevel 1 (
    echo Project folder not found at E:\Claude\preproduction
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Cloudflare Tunnel - External Share URL
echo ================================================
echo.

docker compose logs tunnel | findstr "trycloudflare"

echo.
echo ================================================
echo  Copy the URL ending with trycloudflare.com
echo  trycloudflare.com URL을 복사해서 공유하세요
echo.
echo  If no URL shown / 주소가 안 보이면:
echo   1. Make sure start.bat is running
echo   2. Wait 1-2 minutes after start
echo ================================================
echo.
pause
