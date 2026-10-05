# 의존성 정책

[English](/operations/dependencies).

선언한 runtime 범위를 지원하는 최신 안정 release를 사용한다. "최신"은 의존성을 고르거나 올릴 때, 곧 그 review 때 알려진 최신 안정 release를 뜻하며, 실행할 때마다 registry를 조회하는 것이 아니다. Prerelease는 이 규칙을 충족하지 않는다. 모든 lock file은 release 입력이다.

## 범위

Registry 의존성은 registry가 해석하는 직접 의존성이다. 루트 `package.json`의 `dependencies`나 `devDependencies` 항목, 또는 `config/dependency-policy.json`이 정한 Composer manifest의 `require`나 `require-dev` 항목이다. 의존성을 선언하는 npm manifest는 루트 `package.json` 하나다. 루트는 모든 package의 개발 도구를 가지며, `packages/`의 package는 runtime 의존성만 선언한다. `file:`, `link:`, `workspace:` 의존성은 이 저장소의 package이고, `php`, `ext-*`, `lib-*`, `composer-*`는 platform 요구 사항이다. 어떤 registry도 이들을 해석하지 않으므로 "최신 안정"은 이들에게 의미가 없고, 이들은 예외가 아니라 범위의 정의에 따라 review 밖에 있다. 그래도 gate는 이 저장소의 package를 lock과 대조한다. `package-lock.json`은 그것을 `package.json`이 적은 directory로, 그 `package.json`의 version으로 해석해야 한다.

## Review: `make dependency-review`

`make dependency-review`는 개발자 명령이다. 모든 registry 의존성의 최신 안정 release(`npm view`, `composer outdated --locked`)와 모든 lock의 보안 권고(moderate 이상의 `npm audit`, 모든 권고와 버려진 package의 `composer audit`)를 registry에 묻는다. 예외 없는 새 안정 release, 의존성이 다시 최신이 된 예외, 보안 권고마다 package, version, 새 release 또는 권고, 고치는 방법을 한 줄로 출력하고, 하나라도 있으면 실패한다. 예외로 유지하는 의존성은 그 예외의 사유와 함께 출력한다.

- `make dependency-review RECORD=1`은 review한 내용을 `config/dependency-review.json`에도 쓴다. review 시각, 모든 lock의 sha256과 보안 권고, 모든 registry 의존성의 잠긴 version과 최신 안정 version이다. registry 조회가 실패하면 기록을 바꾸지 않는다.
- `make dependency-review UPDATE=1`은 먼저 예외 없는 새 의존성을 manifest의 범위 연산자를 유지한 채 최신 안정 release로 올리고(`npm install`, `composer require --update-with-dependencies`), 보안 권고가 있는 package를 갱신한다(`npm audit fix`, `composer update --with-dependencies`). 그다음 다시 review하고 기록한다.

의존성을 고르거나 올릴 때 실행하며, manifest나 lock의 변경은 그 기록과 함께 커밋한다. 예약된 workflow `.github/workflows/dependency-review.yml`이 매일 `make dependency-review`를 실행한다. 저장소가 내보내는 version에 대한 보안 권고는 내보낸 것의 결함이 나중에 발견된 것이므로, 예약 실행이 개발자를 기다리지 않고 찾는다. 그 실패는 package, version, 권고 또는 새 release, 고치는 명령을 적으며, 고치는 일은 다른 작업과 같은 작업이다. 이것은 커밋의 gate가 아니다.

## Gate: `make dependency-policy-check`

`make dependency-audit`가 실행하는 `make dependency-policy-check`는 checkout의 file만 읽고 registry를 조회하지 않으므로, 같은 tree는 언제나 같은 결과를 낸다. 한 번 실행에 모든 발견을, 각각 어기는 규칙과 고치는 방법과 함께 한 줄씩 보고하고, 하나라도 있으면 실패한다.

- review 기록에 항목이 없는 registry 의존성이나 lock, 또는 어떤 manifest나 정책도 선언하지 않는 기록 항목
- sha256이 기록과 다른 lock, 또는 잠긴 version이 기록과 다른 의존성. lock이 review 없이 바뀌었다
- review 때 보안 권고가 있던 lock
- 예외 없이 review 때의 최신 안정 release보다 오래된 의존성, 그리고 review 때 의존성이 최신이었던 예외
- 불완전하거나 중복되거나 알 수 없는 예외
- 선언한 최저 PHP로 해석하지 않는 Composer manifest나 lock, 그리고 `COMPOSER_DISABLE_NETWORK=1`로 실행한 `composer validate --strict`가 오래되었다고 보는 lock
- 다른 directory나 version으로 잠긴 이 저장소의 package, 그리고 `package.json`과 다른 의존성을 기록한 `package-lock.json`

mutation gate `scripts/check-dependency-policy-mutation.mjs`는 의존성 file을 복사해, 검사가 예외 없는 오래된 의존성, 선언한 최저 버전과 다른 Composer platform, review 없이 바뀐 lock, 보안 권고가 있는 lock을 거부함을 증명한다. `tests/scripts/dependency-policy.test.mjs`는 gate와 review를 stub registry로 실행한다.

## 예외

이전 안정 release를 사용하려면 `config/dependency-policy.json`에 근거가 있어야 한다. 각 항목은 manifest(루트 `package.json` 또는 Composer manifest)로 지정한 registry 의존성, 재현한 비호환성, 고정을 해제할 조건, 그 조건을 보호하는 test를 기록한다.

이 정책은 도구뿐 아니라 지원 runtime에도 적용한다. Test 의존성이 package가 지원한다고 선언한 runtime보다 새 버전을 요구할 수 없다. 두 Composer manifest는 `config.platform.php`를 `8.2.0`으로 지정해 lockfile을 해석하며, gate는 오래된 lock 또는 선언한 최저 버전과 다른 platform override를 거부한다. CI는 PHP package와 확장을 PHP 8.2와 현재 release 환경에서 검사한다.

Version 변경은 한 순서를 따른다. 호환성과 보안 조건을 먼저 정하고 `make dependency-review UPDATE=1`로 manifest와 lock을 함께 갱신한 뒤 변경된 package test와 문서 build, `make dependency-audit`, clean-checkout release gate를 실행한다. Review가 통과해도 build 실패를 허용하지 않으며 build가 통과해도 알려진 취약점이나 설명 없는 구버전 고정을 허용하지 않는다.
