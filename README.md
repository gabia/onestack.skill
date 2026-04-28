# Onestack Skill

Onestack Skill은 Agent가 로컬에서 개발한 프로젝트를 Dokploy 기반 Onestack 배포 환경으로 배포하고 운영할 수 있도록 돕는 스킬입니다. 프로젝트 분석, Dokploy CLI 준비, 리소스 생성, 환경 변수 설정, 배포 실행, 상태 확인까지의 반복 작업을 일관된 흐름으로 처리하도록 안내합니다.

기본 Dokploy 콘솔 URL:

```bash
http://211.47.74.86:3000
```

## 언제 사용하나

다음과 같은 요청을 처리할 때 이 스킬을 사용합니다.

- 로컬 프로젝트를 Onestack/Dokploy에 배포, 재배포, 게시
- Dokploy 애플리케이션, Compose 서비스, 데이터베이스 생성 또는 설정
- 도메인, 포트, 빌드 타입, 환경 변수 구성
- 배포 상태, 배포 이력, Traefik 설정, Compose 변환 결과 확인
- 에이전트가 로컬 코딩 프로젝트를 자동으로 배포 가능한 상태까지 정리

## 구성

- `.agents/skills/onestack/SKILL.md`: 스킬의 핵심 규칙과 배포 워크플로우
- `.agents/skills/onestack/references/dokploy-cli.md`: Dokploy CLI 명령 예시와 운영 체크리스트
- `.agents/skills/onestack/scripts/inspect_project.mjs`: 로컬 프로젝트 구조를 분석하고 Dokploy 리소스 추천 정보를 JSON으로 출력
- `.agents/skills/onestack/scripts/bootstrap_dokploy.sh`: Dokploy CLI 설치/검증 및 API 인증 보조 스크립트
- `.agents/skills/onestack.skill`: 배포 가능한 스킬 아카이브

## 빠른 시작

프로젝트 루트에서 대상 프로젝트를 먼저 분석합니다.

```bash
node .agents/skills/onestack/scripts/inspect_project.mjs .
```

Dokploy CLI를 설치 또는 확인하고 API 접근을 검증합니다.

```bash
DOKPLOY_URL=http://211.47.74.86:3000 DOKPLOY_API_KEY="$DOKPLOY_API_KEY" \
  bash .agents/skills/onestack/scripts/bootstrap_dokploy.sh
```

Dokploy 리소스를 생성하거나 수정해야 할 때는 CLI 참조 문서를 확인합니다.

```bash
sed -n '1,220p' .agents/skills/onestack/references/dokploy-cli.md
```

## 기본 배포 흐름

1. `inspect_project.mjs`로 프로젝트의 Git 상태, 프레임워크, Dockerfile, Compose 파일, 환경 파일을 확인합니다.
2. Git 원격 저장소, 현재 브랜치, 커밋 푸시 상태를 확인합니다.
3. `bootstrap_dokploy.sh`로 Dokploy CLI와 인증 상태를 준비합니다.
4. Dokploy 프로젝트와 `production` 환경을 검색하고, 없으면 생성합니다.
5. 프로젝트 구조에 따라 Compose, Dockerfile, static, nixpacks, railpack 중 적절한 리소스 타입과 빌드 방식을 선택합니다.
6. 소스 저장소, 빌드 설정, 환경 변수, 도메인, 포트를 구성합니다.
7. `dokploy application deploy` 또는 `dokploy compose deploy`로 배포합니다.
8. 리소스 상세와 배포 이력을 다시 조회해 결과를 검증합니다.

## 안전 원칙

- API 키, DB 비밀번호, `.env` 값, 시크릿이 포함된 명령 전체를 출력하지 않습니다.
- 애플리케이션, 데이터베이스, 도메인, 볼륨, 배포 리소스 삭제는 명시적 승인 없이는 수행하지 않습니다.
- Dokploy는 원격 소스 기준으로 배포하므로, 배포 전 미커밋 또는 미푸시 변경 사항을 반드시 확인합니다.
- 가능하면 `dokploy ... --json`을 사용해 명령 결과를 안정적으로 파싱합니다.
- 인증 정보가 없으면 임의로 만들지 않고, 사용자에게 API 키 제공 또는 콘솔에서 생성하는 절차를 안내합니다.
