# API 환경 설정 가이드

## 개요
이 프로젝트는 환경별로 다른 API URL을 사용할 수 있도록 구성되어 있습니다.

## 환경 설정

### 지원하는 환경
- **Development**: `https://skysunny-api-dev.mayoube.co.kr`
- **Staging**: `https://skysunny-api.mayoube.co.kr`
- **Production**: `https://skysunny-api.mayoube.co.kr`

### 환경 결정 우선순위
1. `REACT_APP_ENV` 환경변수
2. URL 기반 자동 판단 (hostname에 'dev', 'localhost', 'staging' 포함 여부)
3. `NODE_ENV` 환경변수
4. 기본값: development

## 사용법

### 개발 환경에서 실행
```bash
# 기본 개발 서버 (development 환경)
npm start

# 명시적으로 development 환경으로 실행
npm run start:dev

# staging 환경으로 실행
npm run start:staging
```

### 빌드
```bash
# 기본 빌드 (staging 환경)
npm run build

# development 환경으로 빌드
npm run build:dev

# staging 환경으로 빌드
npm run build:staging

# production 환경으로 빌드
npm run build:prod
```

### 환경변수로 직접 설정
```bash
# 환경변수로 직접 API URL 설정
REACT_APP_API_BASE_URL=https://your-custom-api.com npm start

# 환경과 API URL 모두 설정
REACT_APP_ENV=production REACT_APP_API_BASE_URL=https://your-prod-api.com npm start
```

## 파일 구조
- `src/config/config.js`: 환경별 설정 관리
- `src/api/httpClient.js`: HTTP 클라이언트 (환경 설정 사용)

## 배포 시 주의사항
1. 배포 환경에 맞는 빌드 스크립트를 사용하세요
2. CI/CD 파이프라인에서 적절한 환경변수를 설정하세요
3. 프로덕션 배포 시에는 `npm run build:prod`를 사용하세요
