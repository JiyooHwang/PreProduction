@echo off
chcp 65001 >nul
title 샷 브레이크다운 시작

echo ================================================
echo   샷 브레이크다운 - 업데이트 + 시작
echo ================================================
echo.

REM 프로젝트 폴더로 이동 (경로 다르면 아래 줄 수정)
cd /d E:\Claude\preproduction
if errorlevel 1 (
    echo [에러] 프로젝트 폴더를 찾을 수 없습니다.
    echo E:\Claude\preproduction 폴더가 있는지 확인하세요.
    echo.
    echo 다른 위치에 설치했다면 이 .bat 파일을 메모장으로 열어
    echo 'cd /d E:\Claude\preproduction' 줄을 본인 경로로 수정하세요.
    pause
    exit /b 1
)

echo [1/3] GitHub에서 최신 코드 받는 중...
echo ------------------------------------------------
git pull origin main
if errorlevel 1 (
    echo.
    echo [경고] git pull 실패. 인터넷 또는 git 설정 확인.
    echo 일단 기존 코드로 계속 진행합니다.
    echo.
    timeout /t 3 >nul
)
echo.

echo [2/3] Docker Desktop 확인 중...
echo ------------------------------------------------
docker info >nul 2>&1
if errorlevel 1 (
    echo [에러] Docker Desktop 이 켜져 있지 않습니다.
    echo 시작 메뉴에서 'Docker Desktop' 실행 후 1~2분 기다린 뒤 다시 시도하세요.
    pause
    exit /b 1
)
echo Docker OK
echo.

echo [3/3] 컨테이너 빌드 + 시작...
echo ------------------------------------------------
echo 처음 실행 또는 코드 변경 시: 5~15분 소요
echo 그 외:                       1~2분 소요
echo.
echo ================================================
echo  완료되면 브라우저에서 다음 주소 접속:
echo    http://localhost:3000
echo.
echo  외부 공유용 주소는 로그에서 'trycloudflare.com'
echo  으로 끝나는 줄을 찾으세요.
echo.
echo  종료하려면 이 창에서 Ctrl + C 누르세요.
echo ================================================
echo.

docker compose --profile demo up --build

echo.
echo ================================================
echo  컨테이너가 종료되었습니다.
echo  아무 키나 누르면 창이 닫힙니다.
echo ================================================
pause >nul
