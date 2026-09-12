# polyspec_template PHP 확장

[English](README.md).

네이티브 구현으로 템플릿을 렌더하는 PHP 확장이다. 클래스 `Polyspec\Template\Native\Engine`과 `Polyspec\Template\Native\TemplateError`를 등록한다. 동작은 `docs/spec/`의 명세가 정의하는 동작이다.

## 빌드

빌드에는 Rust 1.98.1과 확장을 로드할 PHP의 개발 헤더가 필요하다.

```sh
make ext
```

공유 라이브러리는 macOS에서 `target/release/libpolyspec_template.dylib`, Linux에서 `target/release/libpolyspec_template.so`에 쓰인다. `php.ini`의 `extension` 설정이나 명령줄의 `-d extension=<경로>`로 로드한다.

```sh
php -d extension=packages/template-php-ext/target/release/libpolyspec_template.dylib -r 'var_dump(extension_loaded("polyspec_template"));'
```

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
| `$engine->register(string $name, callable $function): void` | 호스트 함수 `fn(array $args, array $env): mixed`를 등록한다. |
| `$engine->render(string $name, mixed $assign, array $options): string` | PHP assign 데이터로 템플릿을 렌더한다. `$options`는 `define`과 `env`를 받는다. |
| `$engine->renderJson(string $name, string $assign, ?string $define, ?string $env): string` | assign 데이터, 템플릿 define, 환경을 JSON 텍스트로 받아 템플릿을 렌더한다. |
| `TemplateError` | `\Exception`을 상속한다. `getErrorCode()`, `getTemplate()`, `getErrorLine()`, `getErrorCol()`, `getOffset()`, `getEnd()`, `toArray()`. |

접근자는 `\Exception`이 final로 선언한 `getCode()`, `getLine()`, `getFile()`을 피한다. `getMessage()`는 명세의 메시지를 반환한다.

`renderJson`은 assign 데이터의 숫자를 JSON 리터럴로 읽으므로 안전 범위 밖의 정수 리터럴은 보고되고 같은 크기의 실수 리터럴은 받아들여진다. `render`는 PHP 정수와 PHP 실수에 같은 규칙을 적용한다.

`stubs/polyspec_template.stub.php`는 정적 분석용 시그니처를 담으며 런타임에 로드되지 않는다.

## 명령줄

```sh
php -d extension=target/release/libpolyspec_template.dylib bin/template-ext.php parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
php -d extension=target/release/libpolyspec_template.dylib bin/template-ext.php render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
## 테스트

```sh
composer install
make test-ext
```

`make test-ext`는 명령줄 인터페이스로 적합성 케이스를 실행한 뒤 `run-tests.sh`를 실행한다. `run-tests.sh`는 빌드된 라이브러리를 로드하고 `tests/`의 스위트를 실행한다. 단위 테스트의 템플릿은 `tests/templates`에 있다.
