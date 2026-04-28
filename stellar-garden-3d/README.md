# 별먼지 정원

SQLite에 저장된 별 기록을 Three.js 3D 궤도 정원으로 보여주는 작은 토이 프로젝트입니다. 새 별을 심으면 DB에 저장되고, 화면의 별 목록과 3D 씬이 함께 갱신됩니다.

## 실행

```bash
npm install
npm run build
npm start
```

기본 포트는 `4877` 입니다.

## Docker Compose

```bash
docker compose up --build
```

## 검증

```bash
npm run build
npm run verify
```

검증 스크립트는 임시 서버를 띄운 뒤 API CRUD, 데스크톱/모바일 렌더링, Three.js 캔버스 픽셀 신호를 확인합니다.

## 데이터

SQLite 파일은 `data/stellar-garden.sqlite`에 생성됩니다. 처음 실행하면 샘플 별 다섯 개가 자동으로 들어갑니다.
