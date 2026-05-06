# 🎬 PreProduction 샷 브레이크다운 설치 가이드

영상을 업로드하면 AI가 자동으로 컷을 분석해주는 도구입니다.
이 가이드를 따라하면 **본인 컴퓨터에 설치**해서 사용할 수 있어요.

> ⏱ **예상 소요 시간**: 1~2시간 (처음만, 다음부턴 1분이면 켜짐)
> 🖥 **운영체제**: Windows 10/11
> 💪 **권장 사양**: RAM 8GB 이상, 여유 디스크 10GB

---

## 📋 전체 흐름

```
1. 프로그램 3개 설치 (Docker, Git, 메모장)
2. Gemini API 키 발급 (무료)
3. 프로젝트 다운로드 및 설정
4. 실행
5. 사이트 접속
```

---

## 🛠 1단계: 필수 프로그램 설치

### 1-1. Docker Desktop (필수)

영상 분석에 필요한 환경을 한 번에 띄워주는 도구예요.

**다운로드**: https://www.docker.com/products/docker-desktop/

설치 시 주의사항:
- "Use WSL 2 instead of Hyper-V" **체크 권장**
- 설치 후 **재부팅** 필요할 수 있음
- 재부팅 후 **시작 메뉴 → Docker Desktop 실행**
- 작업 표시줄에 🐋 (고래) 아이콘 나타날 때까지 1~2분 대기

> ⚠️ **WSL 설치 안내가 뜨면**: 안내대로 설치 후 재부팅. 자세한 건 회사 IT 또는 본인이 설치한 동료에게 물어보세요.

### 1-2. Git for Windows (필수)

코드를 다운받는 도구입니다.

**다운로드**: https://git-scm.com/download/win

설치 시 옵션은 **모두 기본값**으로 두세요. "Next" 만 계속 누르면 됩니다.

설치 확인: PowerShell 열고:
```powershell
git --version
```
→ `git version 2.xx.x` 나오면 OK

---

## 🔑 2단계: Gemini API 키 발급 (무료)

영상의 각 컷을 AI가 분석할 때 쓰는 키예요. **무료**입니다.

### 발급 방법

1. https://aistudio.google.com/apikey 접속
2. **Google 계정으로 로그인**
3. **"Create API key"** 클릭
4. 생성된 키를 **메모장에 복사**해두기 (`AIzaSy...` 로 시작하는 긴 문자열)

> 💡 **이 키는 본인만 알아야 합니다.** 다른 사람한테 공유 X.

### 무료 한도
- 분당 15회 요청
- 일일 1,000회 요청
- → 영상 1개 분석 = 약 24~30회 요청 → 하루에 영상 30~40개 분석 가능

---

## 📥 3단계: 프로젝트 다운로드

### 3-1. 작업 폴더 만들기

PowerShell 열고:
```powershell
cd C:\
mkdir Claude
cd Claude
```

> 💡 다른 위치도 OK. 예: `D:\Project` 등.

### 3-2. 코드 다운로드

```powershell
git clone https://github.com/jiyoohwang/preproduction.git
cd preproduction
```

성공하면:
```
Cloning into 'preproduction'...
Receiving objects: 100% ...
```

---

## ⚙️ 4단계: 설정 파일 만들기

### 4-1. `.env` 파일 생성

```powershell
copy .env.example .env
```

### 4-2. `.env` 파일 수정

```powershell
notepad .env
```

메모장이 열리면 다음 항목들을 찾아서 수정하세요:

#### 필수 수정
```
DEMO_MODE=true
GEMINI_API_KEY=여기에_본인_API키_붙여넣기
GEMINI_REQUEST_INTERVAL=2
```

#### 예시 (실제 키 모양)
```
DEMO_MODE=true
GEMINI_API_KEY=AIzaSyABC123XYZ_yourActualKeyHere
GEMINI_REQUEST_INTERVAL=2
```

> ⚠️ **주의**:
> - `=` 양옆 띄어쓰기 ❌
> - 키 양쪽에 따옴표 ❌
> - 그냥 `GEMINI_API_KEY=AIzaSy...` 이대로

저장 (`Ctrl + S`) 후 메모장 닫기.

---

## 🚀 5단계: 실행

### 5-1. Docker Desktop 켜져 있는지 확인

작업 표시줄에 🐋 아이콘이 떠있어야 함. 없으면 시작 메뉴에서 Docker Desktop 실행.

### 5-2. PowerShell에서 실행

```powershell
docker compose --profile demo up --build
```

> ⏱ **처음 실행 시 5~15분** 소요. 인터넷에서 이미지 다운로드 + 빌드. 커피 ☕ 한 잔 하세요.

### 5-3. 완료 신호

다음 메시지들이 나오면 준비 완료:

```
✓ Container preproduction-postgres-1   Running
✓ Container preproduction-backend-1    Running
✓ Container preproduction-frontend-1   Running
✓ Container preproduction-tunnel-1     Running
```

그리고 박스로 둘러싸인 부분에:
```
┌────────────────────────────────────────────┐
│ Your quick Tunnel has been created!         │
│ https://랜덤단어.trycloudflare.com          │
└────────────────────────────────────────────┘
```

---

## 🎬 6단계: 사이트 접속해서 사용

### 본인이 사용 (가장 빠름)
브라우저에서:
```
http://localhost:3000
```

### 다른 사람한테 보여주기 (외부 공유)
위에서 받은 `https://xxx.trycloudflare.com` 주소를 카톡/메일로 공유.

> ⚠️ **다른 사람이 보려면 본인 PC가 켜져 있어야 함**

---

## 🛑 종료 방법

PowerShell 창에서:
```
Ctrl + C
```

→ 모든 컨테이너가 자동으로 멈춥니다.

---

## 🔄 다음에 다시 사용할 때 (1분이면 켜짐)

```powershell
cd C:\Claude\preproduction
docker compose --profile demo up
```

> 💡 **`--build` 안 붙여도 됨**. 두 번째부터는 빌드된 이미지 그대로 씀.

---

## 🆙 코드 업데이트 (가끔)

새 기능이 추가됐을 때:

```powershell
cd C:\Claude\preproduction
git pull origin main
docker compose --profile demo up --build
```

---

## 🚨 자주 묻는 질문 / 문제 해결

### Q1. PowerShell에서 `git: 'git' 용어가 인식되지 않습니다` 에러
→ Git 설치 후 **PowerShell 재시작** 필요. 새 창 열고 다시 시도.

### Q2. Docker compose 실행 시 `Cannot connect to docker daemon` 에러
→ Docker Desktop이 안 켜져 있어요. 시작 메뉴에서 실행 후 1~2분 대기.

### Q3. 사이트가 `http://localhost:3000` 에서 안 떠요
- Docker 4개 컨테이너 모두 `Running` 인지 확인
- 1~2분 더 기다려보기 (시작 시간)
- 브라우저 강력 새로고침 `Ctrl + Shift + R`

### Q4. 분석 도중 "분석 실패: 429" 에러
- Gemini 무료 한도 초과 (분당 15회)
- `.env` 의 `GEMINI_REQUEST_INTERVAL` 을 `4` 로 늘리기
- 또는 다음 날 시도 (일일 한도 리셋)

### Q5. 영상 업로드 시 "Application failed to respond"
- 영상이 너무 큼. 100MB 이하로 압축 시도 (HandBrake 등)
- 5분 이하 클립으로 자르기

### Q6. 컷 감지가 부정확
- 사이트의 **컷 감지 민감도** 값 조절
- 디졸브 많은 영상: `22~24`
- 액션 격렬한 영상: `30~32`
- 기본값: `27`

### Q7. 터널 주소가 매번 바뀌어요
→ 정상이에요. `Ctrl+C` 후 다시 켤 때마다 새 주소 생성됩니다. 외부 공유 시 새 주소를 매번 알려야 해요.

### Q8. 노트북 닫으면 사이트 꺼져요
→ 정상이에요. PC가 꺼져있는 동안엔 사이트도 꺼집니다. 외부에서 24시간 접속 가능하게 하려면 호스팅 서비스(Railway, Render 등) 필요.

---

## 💡 사용 팁

### 빠른 분석 팁
- 영상을 **1080p나 720p로 압축**해서 올리기 (HandBrake 무료 도구)
- 5분 이내 클립으로 자르기
- `.env` 의 `GEMINI_REQUEST_INTERVAL=2` 로 설정

### 분석 결과
- 결과는 표(Table)로 표시
- **Excel 다운로드** 버튼으로 엑셀 파일 받기
- 각 컷의 메모는 직접 수정 가능

### 종료 시 주의
- PowerShell 창을 **닫지 마세요** (실수로 종료됨)
- 작업 끝나면 `Ctrl + C` 로 정상 종료
- 강제 종료해도 데이터는 안 사라짐 (DB volume에 저장됨)

---

## 📞 도움 필요할 때

설치하다가 막히면:
1. 어느 단계에서 막혔는지 (1~5단계 중)
2. 어떤 에러 메시지가 떴는지 (스크린샷)
3. PC 환경 (Windows 10? 11? 사양?)

이 3가지 정보와 함께 **이미 설치한 동료**에게 물어보세요.

---

## ✅ 설치 완료 체크리스트

- [ ] Docker Desktop 설치 + 실행 (🐋 아이콘 있음)
- [ ] Git 설치 (`git --version` 작동)
- [ ] Gemini API 키 발급 (메모장에 복사해둠)
- [ ] `git clone` 으로 프로젝트 다운로드
- [ ] `.env` 파일에 본인 API 키 입력
- [ ] `docker compose --profile demo up --build` 실행
- [ ] `http://localhost:3000` 접속 성공
- [ ] 영상 업로드 후 분석 결과 확인

8개 다 체크되면 설치 완료! 🎉

---

## 🔗 관련 링크

- **GitHub 저장소**: https://github.com/jiyoohwang/preproduction
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- **Git for Windows**: https://git-scm.com/download/win
- **Gemini API 키 발급**: https://aistudio.google.com/apikey
- **HandBrake (영상 압축)**: https://handbrake.fr/

---

**즐거운 작업 되세요!** 🎬✨
