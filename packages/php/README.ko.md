<!-- doc-id: packages-template-php-readme -->
<!-- source-sha256: a489f47c3618fadb4b45338709535005617efb9e33f83505cf3624ab4bc4313b -->
# polyspec/template

[English](README.md).

템플릿 언어의 PHP 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. `mbstring` 확장을 가진 PHP 8.4 이상이 필요하다.

## 설치

```sh
composer require polyspec/template
```

## 렌더

```php
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\FilesystemLoader;

$program = new AstProgram(new FilesystemLoader('templates'));
$program->register('greet', fn (array $args): string => 'Hello, ' . $args[0]);
$engine = new Engine($program);
$assign = ['title' => 'Home'];
$html = $engine->render('layout', $assign, [
    'define' => ['layout' => ['template' => 'layout.tpl'], 'content' => ['template' => 'pages/home.tpl']],
    'env' => ['timezone' => '+09:00', 'now' => time()],
]);
```

assign 데이터는 PHP 배열 또는 `Polyspec\Template\Value\Json::parse()`가 만든 값이다. PHP 배열은 `array_is_list()`가 참이면 list, 아니면 map이다. 정수 키는 문자열 키가 된다.

## 파싱

```php
use Polyspec\Template\Ast;
use Polyspec\Template\AstProgram;

$ast = AstProgram::parse(file_get_contents('layout.tpl'), 'layout.tpl');
$json = Ast::toJson($ast);
```

파싱된 템플릿은 `render()`에 전달하거나 `ArrayLoader`에 저장할 수 있다.

## API

| 멤버 | 설명 |
| --- | --- |
| `AstProgram::parse(string $source, string $name, array $options = [])` | 템플릿 하나를 AST(중첩 배열)로 파싱한다. `$options['delimiters']`가 구분자를 선택한다. |
| `AstProgram::decodeTemplate(string $json)` | AST JSON 텍스트를 opis/json-schema로 패키지가 `resources/ast.schema.json`으로 가진 `contracts/schema/ast.schema.json`에 대해 검증해 `parse`가 반환하는 배열로 읽는다. 스키마가 거부한 JSON은 `path`가 잘못된 노드의 JSON Pointer인 `AstDecodeError`로, JSON이 아닌 텍스트는 `JsonException`으로 실패한다(AST-10). |
| `AstProgram::analyze(string $source, string $name, array $options = [])` | 템플릿 하나를 한 번 파싱해 `ast`, 받아들인 `tags`(`kind`, `start`, `end`, `bodyStart`, `bodyEnd`), 태그의 모든 부분에 대한 EDT-8 `tokens`(`start`, `end`, `kind`)를 반환한다. 오프셋은 앞의 바이트 순서 표시를 뺀 UTF-8 바이트 오프셋이다. |
| `AstProgram::analyzePrefix(string $source, string $name, array $options = [])` | 두 PHP SDK는 받아들인 `tags`·`tokens`와 첫 파서 오류를 `error`로 반환하며 성공하면 null이다. 잘못된 UTF-8과 구분자 옵션은 예외를 던진다. 성공한 부분 분석 결과는 `ast`(Go는 `AST`)에 완전한 AST도 제공하며 파서 오류가 있으면 해당 필드는 null 또는 네이티브 부재 값이다. |
| `Formatter::format(string $source, array $options = [], Analyzer $analyzer = new PackageAnalyzer())` | `Polyspec\Template\Format`: 태그 안의 공백과 줄 들여쓰기를 정리하고, 텍스트를 담은 `FormatResult` 또는 `FormatError`(`reason`은 `parse`, `invariant`, `html`, 그리고 `code`, `line`, `col`, `message`)를 반환한다. 옵션은 `name`, `delimiters`, `range`, `indent`(공백 묶음 또는 탭 하나, 기본은 공백 두 칸, null이면 모든 줄의 들여쓰기를 유지), `templateBlocks`(`indent` 또는 `flat`)이다. 결과는 span을 뺀 AST(줄을 들여쓸 때는 줄 들여쓰기도 뺀 AST)가 같을 때만 반환되며, 다시 포맷해도 바뀌지 않는다. `Analyzer`는 PHP 확장의 파서 같은 다른 파서를 제공한다. |
| `new AstProgram(?LoaderInterface $loader = null, array $options = [])` | AST program을 생성한다. 옵션: `functions`, `limits`, `delimiters`. |
| `new Engine(Program $program)` | AST 또는 generated program 하나에 위임하는 engine을 생성한다. |
| `$engine->render(string|array $target, mixed $assign = [], array $options = [])` | 템플릿 이름 또는 파싱된 템플릿을 렌더한다. `$assign`은 변수를 담고 옵션은 `define`, `env`다. 바인딩은 VAL-13을 따른다. closure와 리소스는 `E_DATA_UNSUPPORTED_TYPE`, 유효한 UTF-8이 아닌 키는 `E_DATA_INVALID_UTF8`, 64단계보다 깊게 중첩된 list와 map은 `E_DATA_DEPTH`이다. 호출자의 class scope와 무관하게 객체의 public 프로퍼티와 method만 보인다. |
| `BoundMap::bind(mixed $value)`, `BoundMap::merge(mixed $first, mixed $second)` | `bind`는 데이터를 한 번 검사하고 `BoundMap`을 반환한다. null과 `[]`는 빈 bound map이다. `merge`는 두 bound map을 합치며, `$second`의 항목이 같은 key를 가진 `$first`의 항목을 바꾼다. `render`와 `prepare`는 bound map을 `$assign`과 정의 `data`로 받고 다시 binding하지 않는다. 다른 위치에서, 그리고 PHP extension의 bound map은 모든 위치에서 `E_DATA_UNSUPPORTED_TYPE`으로 실패한다(VAL-22). class는 final이고 instance로 만들거나 clone하거나 unserialize할 수 없다. 오류에는 template과 위치가 없다(ERR-14). |
| generated PHP program | Compiler는 `--php-namespace` 또는 `compileFiles`의 `phpNamespace` 옵션이 정한 namespace에 class마다 PSR-4 파일 하나로 generated program을 쓴다. `composer.json`의 `autoload.psr-4`에서 namespace를 출력 directory에 대응시키고 `new \\Your\\Namespace\\GeneratedProgram($runtime)`로 만든다. |
| `$astProgram->register(string $name, callable $fn)` | 호스트 함수 `fn(array $args, array $env): mixed`를 등록한다. 인자는 VAL-21 형태다. number는 `float`, safe 문자열은 `string`, list는 list 배열, map은 항목 순서의 배열, native object는 원본 PHP 객체다. |
| `ArrayLoader`, `FilesystemLoader` | 메모리 로더와 파일시스템 로더. 로더가 던진 예외는 렌더를 `E_LOAD_FAILED`로 실패시키며, `FilesystemLoader`는 읽을 수 없는 일반 파일에 대해 예외를 던진다. |
| `Json::parse(string $bytes)` | assign 데이터용 순서 보존 JSON 파서. 하나의 JSON 문서가 아닌 텍스트는 `E_DATA_INVALID_JSON`을 가진 `BindError`다. |
| `TemplateError` | `errorCode`, `template`, `errorLine`, `errorCol`, `offset`, `end`와 `toArray()`를 가진 예외. |
| `SafeString` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
packages/cli/php/bin/template.php parse [--root DIR] [--delimiters OC] FILE
packages/cli/php/bin/template.php render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE
packages/cli/php/bin/template.php tokens [--root DIR] [--delimiters OC] FILE
packages/cli/php/bin/template.php format [--indent none|tab|N] [--delimiters OC] FILE
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. `tokens`는 EDT-8 토큰을 `[start, end, type]` JSON으로 출력한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다. `format`은 포맷된 텍스트를 줄바꿈을 덧붙이지 않고 출력한다(들여쓰기 단위는 공백 `N`칸(1~8), `tab`, 또는 모든 줄의 들여쓰기를 유지하는 `none`이며 기본은 공백 두 칸). 포맷 오류는 stderr에 `{"reason","code","line","col","message"}`를 출력하고 상태 2로 종료한다.

명령은 Symfony Console 애플리케이션(`Polyspec\Template\Cli\CommandLine`, 런타임 의존성 `symfony/console`)이므로 옵션은 FILE 앞에 오고, 옵션 값은 `--name value` 또는 `--name=value`로 주며, 사용법 오류는 명령의 사용법을 출력하고 상태 1로 종료한다.

PHP가 PHP 확장 `polyspec_template`을 로드하면 같은 `packages/cli/php/bin/template.php`가 그 확장 위에서 같은 명령을 실행한다. 로드는 `-d extension=var/php-ext/polyspec_template.so`로 하거나, 패키지 `polyspec/template-php-ext`에서 PIE가 빌드해 설치한 것으로 한다(`pie install polyspec/template-php-ext`). 그때 라이브러리의 class들은 같은 이름으로 등록된 확장의 class다. 확장이 없으면 같은 명령은 라이브러리의 PHP 구현으로 실행된다. 확장을 위한 다른 명령줄은 없다.

## 개발

```sh
make build-php
make test-php
make template-lint-php-format
```

패키지는 자기 lock을 갖지 않는다. 저장소에서는 root에서 실행한 `composer install`이 root `composer.json`의 `path` repository로 이 패키지와 그 의존성을 root `vendor/`에 설치하고, `make test-php`는 그 directory의 `vendor/bin/phpunit`을 패키지의 `phpunit.xml`로 실행한다.

테스트는 `tests/`에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.

두 PHP SDK는 `Source::fromBytes`와 `Source::fromText`를 공개한다. 소스는 맨 앞 BOM 하나를 제거한 검증된 UTF-8을 소유하고 `name`, `text`, `lines`, `bytes()`, `length()`를 제공한다. `byteAt`과 `span`은 네이티브 바이트 인덱스를 검증하고 `lineIndex`와 `position`은 바이트 위치를 찾는다. `error`는 바이트 오프셋으로 위치가 있는 템플릿 오류를 만든다.
