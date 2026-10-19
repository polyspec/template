<!-- doc-id: packages-template-php-ext-readme -->
<!-- source-sha256: 46f94ec3f4abc903e933dc170768538c18e3ce0deb500b2f23bd8e2227be82ea -->
# polyspec_template PHP 확장

[English](README.md).

C로 독립 구현해 템플릿을 렌더하는 PHP 확장이다. 클래스 `Polyspec\Template\Native\Engine`, `Polyspec\Template\Native\BoundMap`, `Polyspec\Template\Native\TemplateError`를 등록한다. 동작은 `docs/spec/`의 명세가 정의하는 동작이며, PHP 구현 `packages/php`와 `tests/cases`의 적합성 케이스가 그것을 정한다.

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

## 렌더

```php
use Polyspec\Template\Native\Engine;
use Polyspec\Template\Native\TemplateError;

$engine = new Engine('templates');
$engine->register('greet', fn (array $args, array $env) => 'Hello, ' . $args[0]);

try {
    $assign = ['title' => 'Home'];
    echo $engine->render('layout', $assign, [
        'define' => ['layout' => 'layout.tpl', 'content' => ['template' => 'pages/home.tpl']],
        'env' => ['timezone' => '+09:00', 'now' => time()],
    ]);
} catch (TemplateError $error) {
    error_log($error->getErrorCode() . ' at ' . $error->getErrorLine() . ':' . $error->getErrorCol());
}
```

## API

| 멤버 | 설명 |
| --- | --- |
| `new Engine(?string $root, array $options)` | 엔진을 생성한다. `$root`는 로더 루트 디렉터리다. `$options`는 `delimiters`와 `limits`를 받는다. |
| `Engine::parse(string $source, string $name, array $options): array` | 템플릿 하나를 파싱해 AST를 중첩 배열로 반환한다. |
| `Engine::parseToJson(string $source, string $name, array $options): string` | 템플릿 하나를 파싱해 AST를 JSON 텍스트로 반환한다. |
| `Engine::analyze(string $source, string $name, array $options): array` | 템플릿 하나를 한 번 파싱해 `ast`, 받아들인 `tags`(`start`, `end`, `echo`, `kind`, `bodyStart`, `bodyEnd`), EDT-8 `tokens`(`start`, `end`, `kind`)를 반환하며, PHP 패키지의 `AstProgram::analyze`와 같다. 오프셋은 앞의 바이트 순서 표시를 뺀 UTF-8 바이트 오프셋이다. `Polyspec\Template\Native\NativeAnalyzer`가 이를 PHP 패키지의 포매터 `Polyspec\Template\Format\Formatter::format($source, $options, new NativeAnalyzer())`에 넘기므로 포맷 규칙은 한 곳에만 정의된다. |
| `$engine->register(string $name, callable $function): void` | 호스트 함수 `fn(array $args, array $env): mixed`를 등록한다. |
| `$engine->registerClass(string $class, string $method, callable $function): void` | 논리 클래스 함수 `Class::method`를 `fn(array $args, array $env): mixed`로 등록한다. |
| `$engine->render(string $name, mixed $assign, array $options): string` | PHP assign 데이터로 템플릿을 렌더한다. 배열, `stdClass`, `JsonSerializable` 값은 템플릿 값이 되고, 그 밖의 객체는 공개 속성과 메서드가 보이는 인스턴스로 유지된다(VAL-14, RT-60). `$options`는 `define`과 `env`를 받는다. |
| `BoundMap::bind(mixed $value)`, `BoundMap::merge(mixed $first, mixed $second)` | `bind`는 데이터를 한 번 검사하고 `Polyspec\Template\Native\BoundMap`을 반환한다. null과 `[]`는 빈 bound map이다. `merge`는 두 bound map을 합치며, `$second`의 항목이 같은 key를 가진 `$first`의 항목을 바꾼다. `render`는 bound map을 `$assign`과 정의 `data`로 받고 다시 binding하지 않는다. `renderJson`은 bound map을 받지 않는다. 다른 위치에서, 그리고 PHP package의 bound map은 모든 위치에서 `E_DATA_UNSUPPORTED_TYPE`으로 실패한다(VAL-22). class는 final이고 instance로 만들거나 clone하거나 unserialize할 수 없다. 오류에는 template과 위치가 없다(ERR-14). |
| `$engine->renderJson(string $name, string $assign, ?string $define, ?string $env): string` | assign 데이터, 템플릿 define, 환경을 JSON 텍스트로 받아 템플릿을 렌더한다. |
| `TemplateError` | `\Exception`을 상속한다. `getErrorCode()`, `getTemplate()`, `getErrorLine()`, `getErrorCol()`, `getOffset()`, `getEnd()`, `toArray()`. |

접근자는 `\Exception`이 final로 선언한 `getCode()`, `getLine()`, `getFile()`을 피한다. `getMessage()`는 명세의 메시지를 반환한다.

`render`와 `renderJson`은 명세의 바인딩 규칙을 적용한다. 크기가 2^53 − 1보다 큰 숫자는 정수든 실수든 `E_DATA_NUMBER_RANGE`이고(VAL-2), 유효한 UTF-8이 아닌 배열 키나 프로퍼티 이름은 `E_DATA_INVALID_UTF8`, closure와 리소스는 `E_DATA_UNSUPPORTED_TYPE`, 순환 구조를 포함해 64단계보다 깊게 중첩된 list와 map은 `E_DATA_DEPTH`이다(VAL-20). 호스트 함수, class 함수, method는 PHP AST 런타임과 같은 인자를 받는다(VAL-21). number는 `float`, safe 문자열은 `string`, list는 list 배열, map은 10진 정수 키가 정수 키가 되는 항목 순서의 배열, native object는 원본 PHP 객체다(VAL-18). 두 native object는 같은 PHP 객체일 때 같다(EXP-39). 하나의 JSON 문서가 아닌 JSON 텍스트는 `E_DATA_INVALID_JSON`이고, 존재하지만 읽을 수 없는 템플릿 파일은 `E_LOAD_FAILED`이다. 호출자의 class scope와 무관하게 public 프로퍼티와 method만 보이며(VAL-19), `__get`과 `__call`은 참조하지 않는다. 실패한 중첩 render처럼 호스트 코드의 템플릿 오류는 그대로 호출자에게 전달되고, 호스트 코드의 그 밖의 예외는 `E_RUNTIME_HOST_FUNCTION`이다(FUN-46).

`src/polyspec_template.stub.php`는 정적 분석용 시그니처를 담으며 런타임에 로드되지 않는다.

## 명령줄

```sh
php -d extension=var/build/polyspec_template.so vendor/bin/template-ext.php parse [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template-ext.php render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template-ext.php tokens [--root DIR] [--delimiters OC] FILE
php -d extension=var/build/polyspec_template.so vendor/bin/template-ext.php format [--indent none|tab|N] [--delimiters OC] FILE
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. `tokens`는 EDT-8 토큰을 `[start, end, type]` JSON으로 출력한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다. 명령 `bin/template-ext.php`는 PHP 패키지 `polyspec/template`의 것이고, 그 Composer proxy는 `vendor/bin/template-ext.php`다. 그 명령(`Polyspec\Template\Cli\CommandLine`)은 네이티브 엔진을 런타임으로 쓰는 그 패키지의 `Polyspec\Template\Native\NativeRuntime` 위에서 실행된다. `format`은 PHP 패키지의 포매터를 네이티브 분석 위에서 실행해 포맷된 텍스트를 출력한다. 포맷 오류는 stderr에 `{"reason","code","line","col","message"}`를 출력하고 상태 2로 종료한다.

패키지는 C 확장뿐이다. Composer는 `php-ext` type의 패키지를 설치하지 않고 PIE는 확장만 빌드해 설치하므로, 패키지는 PHP class도 명령도 갖지 않는다. Composer로 `polyspec/template`을 요구하고 PIE로 확장을 설치한 프로젝트는 둘 다 갖는다. 패키지는 자기 lock을 갖지 않는다. 이 저장소에서는 발행하지 않는 root `composer.json`이 `tests/`의 test를 map하고, root에서 실행한 `composer install`이 `polyspec/template`을 root `vendor/`에 설치한다.

## 테스트

```sh
make template-test-ext
```

`make template-test-ext`는 `make build-php`로 root `vendor/`를 설치하고, 명령줄 인터페이스로 적합성 케이스를 실행하고, `tests/`의 스위트를 `node_modules/@polyspec/kit/dist/run-tests.mjs phpunit --php-extension`으로 PHPUnit에서 실행한다. 이것은 빌드된 라이브러리를 로드하고 각 test를 경과 시간과 함께 출력한다. 단위 테스트의 템플릿은 `tests/templates`에 있다.
