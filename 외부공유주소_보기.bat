@echo off
chcp 65001 >nul
title 외부 공유 주소 보기

echo ================================================
echo   외부 공유 주소 (Cloudflare 터널)
echo ================================================
echo.

cd /d E:\Claude\preproduction
if errorlevel 1 (
    echo [에러] 프로젝트 폴더를 찾을 수 없습니다.
    pause
    exit /b 1
)

echo 터널 주소 검색 중...
echo ------------------------------------------------
docker compose logs tunnel | findstr "trycloudflare"
echo ------------------------------------------------
echo.
echo 위에 나온 'https://...trycloudflare.com' 주소를
echo 외부 사용자에게 공유하세요.
echo.
echo 주소가 안 보이면:
echo   1. 샷브레이크다운_시작.bat 가 켜져 있는지 확인
echo   2. 켜진 후 1~2분 기다렸다가 다시 시도
echo.
pause
