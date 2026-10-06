# 태블릿에서 Codex로 개발하기

GitHub 저장소 `Yongdre/superstaja`에서 이 프로젝트를 받을 수 있습니다. 루트 폴더 하나에 슈퍼스타자(KBO·MLB)와 Best Pitcher(KBO·MLB)가 모두 들어 있습니다.

## 클라우드 환경 연결

ChatGPT 웹 또는 데스크톱의 `Work in → Cloud → Select environment → Create environment`에서 `Yongdre/superstaja`를 선택합니다. 저장소의 최신 `main`을 사용하고, 작업 폴더는 저장소 루트로 둡니다.

환경 설치에 필요한 내용:

```text
Node.js 24
pnpm 11.19.0
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

pnpm이 설치돼 있지 않은 환경에서는 `npm install --global pnpm@11.19.0`으로 설치합니다. 백엔드, 데이터베이스, 별도 API 키는 필요하지 않습니다. 설치·검증을 마치고 환경을 Publish하면 태블릿 ChatGPT 앱의 Codex에서 해당 환경을 선택할 수 있습니다.

## 게임 미리보기

```bash
pnpm dev:cloud
```

클라우드 환경에서 **5174 포트의 미리보기 URL**을 여세요. 그 주소의 `/superstaja/`와 `/best-pitcher/`에서 게임을 실행합니다. 태블릿의 `127.0.0.1`은 태블릿 자신을 가리키므로 PC에서 쓰던 localhost 링크를 사용하지 않습니다.

## 이어서 작업할 때

태블릿과 PC에서 같은 클라우드 작업을 열면 그 작업의 파일 상태를 이어갈 수 있습니다. 다른 작업에서 수정한 소스를 쓰려면 변경 사항을 커밋하고 GitHub에 반영한 뒤 최신 저장소를 사용하세요. 프로젝트 구조와 기존 게임 동작은 루트 `AGENTS.md`에 정리돼 있습니다.

게임의 자동 저장은 브라우저에 있습니다. PC에서 플레이하던 기록은 게임의 **저장 / 불러오기 → JSON 내보내기**로 파일을 보관하고, 새 기기·주소에서 **JSON 가져오기**로 불러옵니다. 개인 게임 세이브는 GitHub에 넣지 않습니다.

공식 안내: https://learn.chatgpt.com/docs/environments/cloud-environments
