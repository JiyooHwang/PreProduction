# PreProduction — 애니메이션 샷 브레이크다운 도구

영상을 업로드하면 자동으로 컷을 분할하고 각 샷을 Gemini Vision으로 분석해 **팀 공유용
Excel 샷 리스트**를 만들어 주는 사내 웹 앱입니다. 장편/시리즈 애니메이션 프리프로덕션을
위해 설계되었습니다.

## 사용 방법

| 방식 | 적합 상황 | 셋업 |
|------|---------|------|
| **A. 클라우드 배포 (Railway) — 팀 데모/리뷰용** | 여러 명이 링크 하나로 바로 확인 | GitHub 연결 + 환경변수 |
| **B. 사내 서버 (Docker Compose) — 정식 운영용** | 회사 PC에 띄워 LAN 공유 | `docker compose up -d` |
| **C. CLI 단독** | 본인 PC에서 혼자 작업 | `pip install -e .` |

---

## A. Railway 클라우드 배포 (팀 공유용)

URL 하나로 팀 전원이 즉시 사용. 무료 크레딧으로 데모 충분.

### 1. 사전 준비

- GitHub에 이 레포가 푸시되어 있어야 함 (이미 main 브랜치에 있음)
- Railway 계정 — <https://railway.app> (GitHub 로그인)
- 결제수단 등록 (무료 크레딧 한도 내에선 청구 안 됨)
- Google Cloud Console 계정 (OAuth 클라이언트 발급용)

### 2. Railway에 PostgreSQL + 두 개 서비스 만들기

1. Railway 대시보드에서 **New Project → Deploy from GitHub repo** → 이 레포 선택
2. 자동 생성되는 서비스를 **삭제**하고 (그냥 시작점으로 쓰는 게 편함), 다음 3개를 차례로 추가:

#### 2-1. PostgreSQL

- **+ New → Database → Add PostgreSQL**
- 자동으로 `DATABASE_URL` 변수가 발급됨. 다른 서비스에서 참조 가능.

#### 2-2. Backend 서비스

- **+ New → GitHub Repo** → 이 레포 선택
- 서비스 이름: `backend`
- **Settings → Source**:
  - **Root Directory**: `/` (기본)
  - **Dockerfile Path**: `backend/Dockerfile`
- **Settings → Networking → Generate Domain** 클릭 → 백엔드 URL 받음
  (예: `backend-production-xxxx.up.railway.app`)
- **Variables** 탭에서 다음 등록:
  ```
  DATABASE_URL = ${{Postgres.DATABASE_URL}}
  GOOGLE_CLIENT_ID = (3단계에서 발급)
  ALLOWED_EMAIL_DOMAIN = company.com  (선택, 비우면 모든 Google 계정 허용)
  STORAGE_DIR = /app/storage
  UPLOAD_DIR = /app/uploads
  MAX_CONCURRENT_JOBS = 2
  CORS_ORIGINS = https://(프런트 URL — 4단계 이후 채움)
  ```

#### 2-3. Frontend 서비스

- **+ New → GitHub Repo** → 같은 레포 다시 선택
- 서비스 이름: `frontend`
- **Settings → Source**:
  - **Root Directory**: `frontend`
  - **Dockerfile Path**: `Dockerfile`
- **Settings → Networking → Generate Domain** 클릭 → 프런트 URL 받음
- **Variables** 탭에서 다음 등록:
  ```
  NEXTAUTH_URL = https://(프런트 URL)
  NEXTAUTH_SECRET = (openssl rand -base64 32 으로 생성한 긴 랜덤 문자열)
  GOOGLE_CLIENT_ID = (3단계에서 발급)
  GOOGLE_CLIENT_SECRET = (3단계에서 발급)
  ALLOWED_EMAIL_DOMAIN = company.com  (선택)
  NEXT_PUBLIC_API_URL = https://(백엔드 URL)
  ```
- 마지막 변수는 **빌드 타임에 박힙니다**. 백엔드 URL이 바뀌면 frontend를 재빌드 해야 합니다.

### 3. Google OAuth 클라이언트 발급

1. <https://console.cloud.google.com> → 프로젝트 생성/선택
2. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. **Authorized JavaScript origins**:
   ```
   https://(프런트 Railway URL)
   ```
5. **Authorized redirect URIs**:
   ```
   https://(프런트 Railway URL)/api/auth/callback/google
   ```
6. 발급된 **Client ID / Client Secret** 을 Railway 백엔드/프런트 변수에 입력
7. Backend의 `CORS_ORIGINS` 도 프런트 URL로 채움
8. Railway에서 **두 서비스 모두 Redeploy** 트리거

### 4. 첫 접속

1. 프런트 Railway URL 접속 → **Google 로그인**
2. 회사 도메인 계정으로 로그인 (도메인 제한 설정한 경우)
3. 우측 상단 **설정 → Gemini API 키** 입력
   - <https://aistudio.google.com> 에서 본인 계정으로 무료 키 발급
4. **새 프로젝트 만들기 → 영상 업로드 → 분석 → Excel 다운로드**

### 5. 팀에 공유

프런트 Railway URL을 슬랙/카톡에 공유. 각자 Google 로그인 + 본인 Gemini 키 등록 후 사용.

### 운영 메모

- **무료 크레딧**: 월 $5 정도. 트래픽 작은 데모는 충분. 24시간 상시 운영하면 한 달 후 부족할 수 있음.
- **썸네일 보관**: Railway 컨테이너는 재배포 시 휘발됨. 영구 보관하려면 Backend 서비스에 **Volume** 을 마운트해 `/app/storage` 에 연결 (Railway → Backend → Settings → Volumes).
- **영상 업로드 한도**: Railway 프록시 기본값으로는 큰 영상이 막힐 수 있음. 데모용으로는 5분 이내 클립 권장. 장편 풀길이는 사내 서버(B 옵션) 추천.
- **로그 보기**: Railway 대시보드의 각 서비스 → Logs 탭

### 사내 서버로 이주 (운영 전환)

데모가 OK면 같은 코드를 옵션 B (사내 PC + Docker Compose) 로 옮겨서 운영하면 됩니다.
큰 영상 처리는 사내 LAN이 압도적으로 빠릅니다.

---

## B. 사내 서버 (Docker Compose)

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

## C. CLI 단독 사용

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
