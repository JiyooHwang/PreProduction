# PreProduction — 애니메이션 샷 브레이크다운 도구

영상을 업로드하면 자동으로 컷을 분할하고 각 샷을 Gemini Vision으로 분석해 **팀 공유용
Excel 샷 리스트**를 만들어 주는 사내 웹 앱입니다. 장편/시리즈 애니메이션 프리프로덕션을
위해 설계되었습니다.

## 두 가지 사용 방법

| 방식 | 적합 상황 | 셋업 |
|------|---------|------|
| **A. 웹 앱 (추천)** | 팀 10명이 사내에서 같이 사용 | Docker Compose 한 방 |
| **B. CLI** | 본인 PC에서 단독 작업 | `pip install -e .` |

---

## A. 웹 앱 (사내 서버에 배포)

### 출력 화면

- Google 계정으로 로그인 → 프로젝트 생성 → 영상 업로드
- 분석 진행률 실시간 표시 (한 영상당 동시 2건 큐잉)
- 샷 테이블에서 **인라인 편집** (대사/비고 등 직접 수정)
- 썸네일 임베딩된 **Excel 다운로드**

### 시스템 요구사항

- 사내 PC 1대 (Windows / macOS / Linux 무관)
- Docker Desktop 설치
- 사내 LAN에서 해당 PC IP 접근 가능
- 회사 Google Workspace 도메인 (또는 그냥 일반 Google 계정도 가능)

### 1. 사전 준비 — Google OAuth 클라이언트 생성

1. <https://console.cloud.google.com> 접속 → 새 프로젝트 생성
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. **Authorized redirect URIs** 에 다음 추가:
   ```
   http://<사내_서버_IP>:3000/api/auth/callback/google
   http://localhost:3000/api/auth/callback/google
   ```
5. 발급된 **Client ID**, **Client secret** 저장

### 2. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 편집:

```env
POSTGRES_PASSWORD=임의의_긴_문자열

GOOGLE_CLIENT_ID=발급받은_클라이언트_ID
GOOGLE_CLIENT_SECRET=발급받은_시크릿
ALLOWED_EMAIL_DOMAIN=company.com   # 회사 도메인 (선택)

# 사내 IP로 변경 (예: 192.168.0.50)
NEXTAUTH_URL=http://192.168.0.50:3000
PUBLIC_API_URL=http://192.168.0.50:8000
CORS_ORIGINS=http://192.168.0.50:3000

# 임의의 긴 랜덤 문자열 (예: openssl rand -base64 32)
NEXTAUTH_SECRET=long_random_string

MAX_CONCURRENT_JOBS=2
```

### 3. 실행

```bash
docker compose up -d --build
```

브라우저에서 `http://<사내_서버_IP>:3000` 접속 → Google 로그인.

### 4. 팀원이 처음 할 일

1. Google 계정으로 로그인
2. **설정 → Gemini API 키** 입력
   - <https://aistudio.google.com> 에서 본인 계정으로 무료 키 발급
   - 무료 한도: 일 1,500회 (시리즈 한 화 ≒ 200~400컷이라 여유)
3. **새 프로젝트 만들기** → 영상 업로드 → 자동 분석 → Excel 다운로드

### 운영 팁

- 동시 작업 수는 `MAX_CONCURRENT_JOBS` 로 조절 (PC 사양에 따라 1~3)
- 영상은 분석 완료 후 자동 삭제 (DB에 메타데이터만 남음)
- 썸네일은 `storage` 볼륨에 영구 보관 (Docker volume)
- 로그 확인: `docker compose logs -f backend`
- 중지/재시작: `docker compose down` / `docker compose up -d`

---

## B. CLI 단독 사용

웹 앱 없이 본인 PC에서 단독으로 영상을 처리할 때 사용합니다.

### 설치 (Windows)

1. Python 3.10+ 설치 (PATH 등록)
2. FFmpeg 설치 ([gyan.dev](https://www.gyan.dev/ffmpeg/builds/) → `C:\ffmpeg\bin` PATH 등록)
3. 프로젝트 셋업:

   ```powershell
   python -m venv .venv
   .venv\Scripts\activate
   pip install -e .
   ```

4. `.env` 작성:

   ```env
   GEMINI_API_KEY=발급받은_키
   ```

### 사용법

```powershell
shotbreakdown video.mp4 --output output\ep01 --threshold 27 --csv
```

| 옵션 | 설명 |
|------|------|
| `--output`, `-o` | 출력 디렉토리 |
| `--threshold`, `-t` | 컷 감지 민감도 (낮을수록 더 많이) |
| `--skip-analysis` | AI 분석 생략 |
| `--csv` | CSV도 추가 출력 |

---

## 출력 항목

| 컷# | 시작-끝 (TC) | 길이(초/프레임) | 썸네일 | 샷사이즈 | 카메라 무빙 | 캐릭터 | 배경 | 액션/연기 | 대사 | FX | 비고 |
|-----|---|---|---|---|---|---|---|---|---|---|---|

- **자동(Gemini)**: 샷사이즈 / 카메라 무빙 / 캐릭터 / 배경 / 액션-연기 / FX
- **수동**: 대사 — 웹에서 인라인 편집 또는 Excel에서 입력 (Whisper STT 연동 예정)

## 컷 감지 튜닝

| 상황 | 권장 threshold |
|------|---------------|
| 일반 컷 | 27 (기본값) |
| 디졸브가 많은 작품 | 22~25 |
| 액션이 격렬한 컷 | 30~32 |

## 아키텍처

```
┌─────────────────────────────┐
│  Next.js (frontend)         │  Google 로그인, 업로드, 진행률, 샷 편집
│  port 3000                  │
└─────────────┬───────────────┘
              │ HTTP + Bearer(Google ID Token)
┌─────────────▼───────────────┐
│  FastAPI (backend)          │  /api/projects, /api/shots, /api/me
│  port 8000                  │  + 백그라운드 작업 워커 N개
└──┬──────────────┬───────────┘
   │              │
┌──▼─────┐   ┌────▼─────────────┐
│ Postgres │   │ shotbreakdown    │  PySceneDetect + FFmpeg + Gemini
│         │   │  (코어 라이브러리)  │
└─────────┘   └──────────────────┘
```

코어 로직(`shotbreakdown/`)은 UI에 의존하지 않으므로 CLI와 웹 앱이 동일한 파이프라인을
공유합니다.

## 디렉토리 구조

```
PreProduction/
├── shotbreakdown/        # 코어 라이브러리 (CLI + 백엔드 공용)
├── backend/              # FastAPI 백엔드
│   ├── app/
│   └── Dockerfile
├── frontend/             # Next.js 프런트
│   ├── src/
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 향후 계획

- [ ] Whisper STT로 대사 자동 입력
- [ ] Claude Vision provider (`ANTHROPIC_API_KEY` 등록 시 자동 활성화)
- [ ] 작품별 캐릭터 사전 등록 (캐스팅 매핑)
- [ ] 샷 리스트 버전 관리 / 변경 이력

## 라이선스

내부용.
