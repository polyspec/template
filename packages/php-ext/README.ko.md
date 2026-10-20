<!-- doc-id: packages-template-php-ext-readme -->
<!-- source-sha256: 68a64b4f4aa7802deaeb6884ad73fe0ab90c3529a655a9dbe2fe3dcbf805c026 -->
# polyspec_template PHP 확장

[English](README.md).

C로 독립 구현해 템플릿을 렌더하는 PHP 확장이다. 라이브러리의 클래스를 그 이름으로 등록하며(S10), 그 클래스의 API는 `packages/php`의 README가 문서화한다. 동작은 `docs/spec/`의 명세가 정의하는 동작이며, PHP 구현 `packages/php`와 `tests/cases`의 적합성 케이스가 그것을 정한다.

## 빌드

source, `config.m4`, stub `polyspec_template.stub.php`는 `src/`에 있다. 빌드에는 C 컴파일러와, 확장을 로드할 PHP 8.4 이상의 phpize와 php-config가 필요하다.

```sh
make ext
```

`make ext`는 `scripts/build-php-extension.mts`를 실행한다. 이 script는 임시 디렉터리에서 모든 컴파일러 경고를 오류로 하여 phpize, configure, make로 확장을 빌드하고, 공유 라이브러리를 저장소의 `var/build/polyspec_template.so`에 게시한다. source와 PHP build가 바뀌지 않았으면 아무것도 빌드하지 않고, `PATH`의 php-config와 php가 같은 PHP가 아니면 실패한다. `php.ini`의 `extension` 설정이나 명령줄의 `-d extension=<경로>`로 로드한다.

```sh
php -d extension=var/build/polyspec_template.so -r 'var_dump(extension_loaded("polyspec_template"));'
```

package는 Composer type `php-ext`와 build path `src`를 가지므로, PIE가 빌드해서 PIE를 실행하는 PHP에 설치한다. 손으로 빌드할 때는 `src`에서 같은 단계를 실행한다.

```sh
cd src && phpize && ./configure && make
```

PHP build의 gen_stub.php가 stub에서 `src/polyspec_template_arginfo.h`를 만들며, 이 header는 commit된다. stub을 바꾼 뒤에는 `make ext-arginfo`가 header를 다시 만들고, header가 stub과 맞지 않는 동안 빌드는 실패한다.

`src/polyspec_template.stub.php`는 정적 분석용 시그니처를 담으며 런타임에 로드되지 않는다.

## 명령줄

```sh
php -d extension=var/build/polyspec_template.so vendor/bin/template.php parse [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template.php render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template.php tokens [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template.php format [--indent none|tab|N] [--delimiters OC] FILE
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. `tokens`는 EDT-8 토큰을 `[start, end, type]` JSON으로 출력한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다. 명령은 PHP 패키지 `polyspec/template`의 `bin/template.php`이고, 그 Composer proxy는 `vendor/bin/template.php`다. PHP가 `-d extension=`으로 확장을 로드하면 그 명령(`Polyspec\Template\Cli\CommandLine`)은 확장이 라이브러리의 이름으로 등록한 class 위에서 실행된다. `format`은 PHP 패키지의 포매터를 확장의 분석 위에서 실행해 포맷된 텍스트를 출력한다. 포맷 오류는 stderr에 `{"reason","code","line","col","message"}`를 출력하고 상태 2로 종료한다.

패키지는 C 확장뿐이다. Composer는 `php-ext` type의 패키지를 설치하지 않고 PIE는 확장만 빌드해 설치하므로, 패키지는 PHP class도 명령도 갖지 않는다. Composer로 `polyspec/template`을 요구하고 PIE로 확장을 설치한 프로젝트는 둘 다 갖는다. 패키지는 자기 lock을 갖지 않는다. 이 저장소에서는 발행하지 않는 root `composer.json`이 `tests/`의 test를 map하고, root에서 실행한 `composer install`이 `polyspec/template`을 root `vendor/`에 설치한다.

## 테스트

```sh
make template-test-ext
```

`make template-test-ext`는 `make build-php`로 root `vendor/`를 설치하고, 명령줄 인터페이스로 적합성 케이스를 실행하고, `tests/`의 스위트를 `node_modules/@polyspec/kit/dist/run-tests.mjs phpunit --php-extension`으로 PHPUnit에서 실행한다. 이것은 빌드된 라이브러리를 로드하고 각 test를 경과 시간과 함께 출력한다. 단위 테스트의 템플릿은 `tests/templates`에 있다.
