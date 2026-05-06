@echo off
chcp 65001 >nul
title 샷 브레이크다운 중지

echo ================================================
echo   샷 브레이크다운 - 중지
echo ================================================
echo.

cd /d E:\Claude\preproduction
if errorlevel 1 (
    echo [에러] 프로젝트 폴더를 찾을 수 없습니다.
    pause
    exit /b 1
)

echo 컨테이너 중지 중...
docker compose --profile demo down

echo.
echo ================================================
echo  중지 완료. 사이트 꺼졌습니다.
echo  아무 키나 누르면 창이 닫힙니다.
echo ================================================
pause >nul
