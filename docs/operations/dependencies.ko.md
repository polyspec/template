<!-- doc-id: docs-operations-dependencies -->
<!-- source-sha256: 7499b64039db6c98556a76e034bf8cfd01c9246a4ac7fdfe3723db44d0321017 -->
# 의존성 정책

[English](/operations/dependencies).

선언한 runtime 범위를 지원하는 최신 안정 release를 사용한다. "최신"은 의존성을 고르거나 올릴 때 알려진 최신 안정 release를 뜻하며, 실행할 때마다 registry를 조회하는 것이 아니다. Prerelease는 이 규칙을 충족하지 않는다. 모든 lock file은 release 입력이다. 의존성의 최신 여부와 고정의 근거는 review로 판단하며, 어떤 검사도 registry를 조회하지 않는다.

## 범위

Registry 의존성은 registry가 해석하는 직접 의존성이다. 루트 `package.json`의 `dependencies`나 `devDependencies` 항목, 또는 `config/dependency-policy.json`이 정한 Composer manifest의 `require`나 `require-dev` 항목이다. 의존성을 선언하는 npm manifest는 루트 `package.json` 하나다. 루트는 모든 package의 개발 도구를 가지며, `packages/`의 package는 runtime 의존성만 선언한다. `file:`, `link:`, `workspace:` 의존성은 이 저장소의 package이고, `php`, `ext-*`, `lib-*`, `composer-*`는 platform 요구 사항이다. 어떤 registry도 이들을 해석하지 않으므로 "최신 안정"은 이들에게 의미가 없다.

## 예외

이전 안정 release는 `config/dependency-policy.json`에 기록한다. 각 항목은 manifest(루트 `package.json` 또는 Composer manifest)로 지정한 registry 의존성, 재현한 비호환성, 고정을 해제할 조건, 그 조건을 보호하는 test를 기록한다.

이 정책은 도구뿐 아니라 지원 runtime에도 적용한다. Test 의존성이 package가 지원한다고 선언한 runtime보다 새 버전을 요구할 수 없다. Composer manifest는 `config.platform.php`를 `config/dependency-policy.json`의 `composerPlatforms`가 선언하는 kit PHP pin의 platform인 `8.4.1`으로 지정해 lockfile을 해석한다. CI는 PHP package와 확장을 PHP 8.4에서 검사한다.

## Python lock: `make python-lock-check`

`make python-lock-check`는 `config/dependency-policy.json`의 `pythonLocks`에 있는 각 lock, `packages/python/pylock.toml`을 그 source인 `packages/python/pyproject.toml`과 `packages/python/constraints.txt`와 대조한다.

Version 변경은 한 순서를 따른다. 호환성과 보안 조건을 먼저 정하고 npm이나 Composer로 manifest와 lock을 함께 갱신한 뒤 변경된 package test와 문서 build, clean-checkout release gate를 실행한다. Build가 통과해도 알려진 취약점이나 설명 없는 구버전 고정을 허용하지 않는다.
