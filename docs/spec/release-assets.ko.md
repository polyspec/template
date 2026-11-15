<!-- doc-id: spec-release-assets -->
<!-- source-sha256: 05f3fb3c9dc2dece356f64a587eff7290744eb43f2b16a1a913c636c483c4f5f -->
# Release asset workflow

[English](release-assets.md).

`.github/workflows/assets.yml`의 `platform` job은 native platform마다 Go static library, Python wheel, npm platform
package를 한 번 만든다. Matrix는 명시적인 include 행 세 개만 갖는다. `linux-x64-gnu`는 `ubuntu-26.04`,
`linux-arm64-gnu`는 `ubuntu-26.04-arm`, `darwin-arm64`는 `macos-15`에서 실행한다. PHP setup이나 extension build는 하지 않는다.

독립적인 `php` job은 같은 platform-runner 쌍과 `config/toolchain.json`의 `phpExtension.minors` 각각을 조합한
명시적인 include 행만 갖는다. 각 행은 `platform`, `runner`, `php`를 선언하며 추가 axis, exclude 규칙이나 inline
build로 선언된 여섯 build를 늘리거나 숨기지 않는다. `runs-on`은 `matrix.runner`를 선택한다. 각 matrix는
`fail-fast: false`를 사용해 다른 행의 실패가 진단 결과를 취소하지 않게 한다.

각 PHP 행은 선택한 ref의 전체 history를 checkout하고 잠긴 package를 bootstrap하며 Rust와 잠긴 crate를 설치하고
release recipe를 쓰고 선언한 LLVM을 설치한다. Build 전에 조건부 release check를 실행한다. Pin한 setup-php action
하나가 tools와 coverage 없이 `matrix.php`를 선택한 뒤 정확히 한 번
<code v-pre>make release-php-ext PHP=php EXPECTED_PHP_MINOR=${{ matrix.php }}</code>를 실행한다. Expected minor는 recipe의 필수 입력이다.
실행 중인 PHP와 그 설정은 compile 전에 이 값과 일치해야 한다. 다른 job의 PHP setup은 이 job의 PHP version을 증명하지 않는다.

각 PHP 행은 `var/release/assets/`만 <code v-pre>assets-php-${{ matrix.platform }}-${{ matrix.php }}</code>로 upload한다. PHP가 아닌
행은 <code v-pre>assets-${{ matrix.platform }}</code>, 독립 npm job은 `assets-npm`을 쓴다. 각 build command의 소유 job은 하나다.
추가되거나 빠지거나 중복된 소유자, 잘못된 runner나 minor, build 뒤의 setup, 충돌하는 artifact 이름은 workflow의
unit owner에서 실패한다. Setup, 준비, build, upload는 `!cancelled()` guard를 유지하며 release check는
`inputs.release`도 요구한다. 각 job은 실행하는 모든 tool과 잠긴 입력을 소유한다.

이 계약은 T28.60에서 계획했다. 현재 workflow는 아직 `platform`에서 PHP minor를 차례로 바꾼다. 설치된 generated
release recipe는 아직 `EXPECTED_PHP_MINOR`를 강제하지 않는다. 이 guard가 있는 recipe 채택과 native CI 실행은
별도의 검증 gate로 남아 있다. Source workflow 시험은 native release build를 증명하지 않는다.
