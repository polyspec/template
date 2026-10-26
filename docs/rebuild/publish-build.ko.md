<!-- doc-id: rebuild-publish-build -->
<!-- source-sha256: 26b8c96dc86106caec4ea2815ef920cd56f632fc96c5a2d7d1c08953760ca526 -->
# 재구현 기록: publish-build

[English](publish-build.md)

판정: **맞는 도구가 없다.** repository는 build 산출물의 게시를 직접 구현한다. 2026-10-20에 측정했다.

## 대상

- `scripts/publish-build.mts`

## 요구

검사는 build가 만드는 실행 파일과 공유 라이브러리(Go와 Rust 명령줄 인터페이스, PHP 확장)를 실행한다. cargo는 build할 때마다 `target/release/<binary>`를 다시 link하고 go build는 출력을 다시 쓰므로, 아무것도 바뀌지 않아도 build마다 새 파일이 생긴다. macOS는 새 실행 파일을 처음 실행할 때 검사한다(부하가 큰 machine에서 Rust 명령에 29.8 s가 걸려 적합성 호출의 10 s 제한을 넘겼다).

| 항목 | 요구 |
|---|---|
| P1 | build의 byte가 대상과 같으면 대상 파일을 유지한다 |
| P2 | byte가 바뀌면 rename으로 대상을 교체하므로 읽는 쪽은 없거나 반쯤 쓴 파일을 보지 않는다 |
| P3 | build의 mode가 대상의 mode가 된다 |
| P4 | Node.js 밖의 도구 없이 repository의 모든 platform에서 실행된다 |

## 평가한 도구

| 도구 | 판정 |
|---|---|
| `install -C -S` (BSD, macOS) | 내용이 다를 때만 임시 파일과 rename으로 복사하지만(P1, P2) `-S`와 `-C`는 BSD `install`에만 있다. coreutils의 `install`에는 `-S`가 없고 Windows에는 없다(P4) |
| `rsync --checksum` | 같은 파일을 건너뛰고 임시 파일로 쓰지만(P1, P2) 모든 platform에 있지 않다(P4) |
| `cp -u`, `cmake -E copy_if_different` | 앞의 것은 시각을 비교하고 뒤의 것은 CMake가 필요하며 둘 다 rename하지 않는다(P2, P4) |
| `write-file-atomic` (npm) | 임시 파일과 rename으로 쓰지만(P2) 받은 내용을 그대로 쓰고 비교하지 않는다(P1) |

## 맞는 도구가 없는 이유

Node.js만으로 모든 platform에서 P1과 P2를 함께 만족하는 도구가 하나도 없다. script는 `node:fs`(`readFileSync` 비교, 임시 이름으로 `copyFileSync`, `chmodSync`, `renameSync`) 20줄이다.

## 재검토 조건

`write-file-atomic`이나 repository 생태계의 도구가 같은 내용을 건너뛰게 되거나, cargo와 go build가 바뀌지 않은 출력을 새 파일 없이 게시하면 다시 검토한다.
