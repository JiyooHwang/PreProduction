# PreProduction — 애니메이션 샷 브레이크다운 도구

영상을 업로드하면 자동으로 컷을 분할하고 각 샷을 Gemini Vision으로 분석해
**팀 공유용 Excel 샷 리스트**를 만들어 주는 로컬 CLI 도구입니다.

장편/시리즈 애니메이션 프리프로덕션을 위해 설계되었습니다.

## 출력 항목

| 컷# | 시작-끝 (TC) | 길이(초/프레임) | 썸네일 | 샷사이즈 | 카메라 무빙 | 캐릭터 | 배경 | 액션/연기 | 대사 | FX | 비고 |
|-----|---|---|---|---|---|---|---|---|---|---|---|

- **자동**: 컷 번호 / TC / 길이 / 썸네일 / 샷사이즈 / 카메라 무빙 / 캐릭터 / 배경 / 액션-연기 / FX
- **수동(현재)**: 대사 — Excel에서 직접 입력 (Whisper STT 연동 예정)

## 시스템 요구사항

- Windows 10/11 (macOS, Linux도 동작)
- Python 3.10 이상
- FFmpeg (PATH 등록 필요)
- Gemini API 키 (무료 발급 가능)

## 설치 (Windows)

### 1. Python 설치

[python.org](https://www.python.org/downloads/) 에서 3.10 이상 설치.
설치 시 **"Add Python to PATH"** 체크.

### 2. FFmpeg 설치

1. <https://www.gyan.dev/ffmpeg/builds/> 에서 `ffmpeg-release-essentials.zip` 다운로드
2. 압축 해제 후 `C:\ffmpeg` 폴더로 이동
3. `C:\ffmpeg\bin` 을 시스템 환경변수 **Path** 에 추가
4. 새 PowerShell 창에서 확인:
   ```powershell
   ffmpeg -version
   ```

### 3. 프로젝트 셋업

```powershell
git clone <레포 주소>
cd PreProduction

# 가상환경
python -m venv .venv
.venv\Scripts\activate

# 패키지 설치
pip install -e .
```

### 4. Gemini API 키 발급 및 설정

1. <https://aistudio.google.com> 접속 (개인 Google 계정)
2. **Get API key** → 새 키 생성 (무료, 결제 정보 불필요)
3. `.env.example` 을 `.env` 로 복사 후 키 입력:
   ```env
   GEMINI_API_KEY=발급받은_키
   GEMINI_MODEL=gemini-2.0-flash
   ```

> 무료 tier 한도: 분당 ~15회, 일일 ~1,500회. 시리즈 한 화(200~400컷) 처리 가능.

## 사용법

### 기본 실행

```powershell
shotbreakdown path\to\video.mp4
```

또는

```powershell
python -m shotbreakdown path\to\video.mp4
```

### 옵션

```powershell
shotbreakdown video.mp4 ^
  --output output\ep01 ^
  --threshold 27 ^
  --provider gemini ^
  --csv
```

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--output`, `-o` | 출력 디렉토리 | `output` |
| `--threshold`, `-t` | 컷 감지 민감도 (낮을수록 더 많이) | `27` |
| `--skip-analysis` | AI 분석 생략 (컷+썸네일만) | off |
| `--provider`, `-p` | 비전 provider | `gemini` |
| `--csv` | Excel과 함께 CSV도 출력 | off |

### 출력물

```
output/
├── 영상이름_shotlist.xlsx     # 메인 결과 (썸네일 임베딩)
├── 영상이름_shotlist.csv      # --csv 옵션 시
└── frames/
    ├── shot_0001_thumb.jpg
    ├── shot_0001_start.jpg    # AI 분석 시
    ├── shot_0001_mid.jpg
    └── shot_0001_end.jpg
```

## 컷 감지가 잘 안 될 때

- **컷이 너무 적게 잡힘** → `--threshold 22` 처럼 값을 낮춤
- **디졸브가 무시됨** → `--threshold 18` 까지 낮춰 시도
- **컷이 너무 많이 잡힘 (액션씬)** → `--threshold 32` 처럼 값을 높임

애니메이션은 보통 27이 무난하지만, 작품 스타일에 따라 한 번 튜닝하면 됩니다.

## 아키텍처

```
shotbreakdown/
├── models.py          # Shot / ShotAnalysis 데이터 모델
├── detect.py          # PySceneDetect 컷 감지
├── extract.py         # FFmpeg 프레임 추출
├── timecode.py        # TC 변환
├── pipeline.py        # 컷→프레임→분석 파이프라인
├── export.py          # Excel/CSV 출력
├── cli.py             # Typer CLI
└── providers/
    ├── base.py        # VisionProvider 추상 인터페이스
    └── gemini.py      # Gemini 구현
```

코어 로직은 UI에 의존하지 않으므로, 향후 **FastAPI + Next.js 웹 앱**으로
전환할 때 `pipeline.build_shot_list()` 를 그대로 재사용할 수 있습니다.

## 향후 계획

- [ ] Whisper STT로 대사 자동 입력
- [ ] Claude Vision provider (`ANTHROPIC_API_KEY` 환경에서 자동 활성화)
- [ ] FastAPI 백엔드 + Next.js 업로드 UI
- [ ] SQLite → Postgres 마이그레이션 (팀 공동 작업용)
- [ ] 캐릭터 이름 사전 등록 (작품별 캐스팅 매핑)

## 라이선스

내부용.
