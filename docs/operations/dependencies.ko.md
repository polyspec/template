# 의존성 정책

[English](/operations/dependencies).

선언한 runtime 범위를 지원하는 최신 안정 release를 사용한다. Prerelease는 이 규칙을 충족하지 않는다. 모든 lock file은 release 입력이며 `make dependency-audit`는 설정한 심각도에 해당하는 알려진 JavaScript와 PHP 보안 권고를 거부한다.

이전 안정 release를 사용하려면 `config/dependency-policy.json`에 근거가 있어야 한다. 각 항목은 직접 의존성, 재현한 비호환성, 고정을 해제할 조건, 그 조건을 보호하는 test를 기록한다. `make dependency-policy-check`는 현재 안정 release를 조회하며 근거 없는 오래된 의존성, 쓸모가 없어진 근거, 존재하지 않는 직접 의존성, 불완전한 사유가 있으면 실패한다. Mutation test는 필요한 예외를 제거하고 검사기가 설명 없는 고정을 거부하는지 증명한다.

이 정책은 도구뿐 아니라 지원 runtime에도 적용한다. Test 의존성이 package가 지원한다고 선언한 runtime보다 새 버전을 요구할 수 없다. 두 Composer manifest는 `config.platform.php`를 `8.2.0`으로 지정해 lockfile을 해석하며, 정책 검사는 오래된 lock 또는 선언한 최저 버전과 다른 platform override를 거부한다. CI는 PHP package와 확장을 PHP 8.2와 현재 release 환경에서 검사한다.

Version 변경은 한 순서를 따른다. 호환성과 보안 조건을 먼저 정하고 manifest와 lock을 함께 갱신한 뒤 변경된 package test와 문서 build, 의존성 정책과 보안 권고 검사, clean-checkout release gate를 실행한다. 보안 검사가 통과해도 build 실패를 허용하지 않으며 build가 통과해도 알려진 취약점이나 설명 없는 구버전 고정을 허용하지 않는다.
