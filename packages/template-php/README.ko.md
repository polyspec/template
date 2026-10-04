# polyspec/template

[English](README.md).

템플릿 언어의 PHP 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. `mbstring` 확장을 가진 PHP 8.2 이상이 필요하다.

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
| `new AstProgram(?LoaderInterface $loader = null, array $options = [])` | AST program을 생성한다. 옵션: `functions`, `limits`, `delimiters`. |
| `new Engine(Program $program)` | AST 또는 generated program 하나에 위임하는 engine을 생성한다. |
| `$engine->render(string|array $target, mixed $assign = [], array $options = [])` | 템플릿 이름 또는 파싱된 템플릿을 렌더한다. `$assign`은 변수를 담고 옵션은 `define`, `env`다. 바인딩은 VAL-14를 따른다. closure와 리소스는 `E_DATA_UNSUPPORTED_TYPE`, 유효한 UTF-8이 아닌 키는 `E_DATA_INVALID_UTF8`, 64단계보다 깊게 중첩된 list와 map은 `E_DATA_DEPTH`이다. 호출자의 class scope와 무관하게 객체의 public 프로퍼티와 method만 보인다. |
| `BoundMap::bind(mixed $value)`, `BoundMap::merge(mixed $first, mixed $second)` | `bind`는 데이터를 한 번 검사하고 `BoundMap`을 반환한다. null과 `[]`는 빈 bound map이다. `merge`는 두 bound map을 합치며, `$second`의 항목이 같은 key를 가진 `$first`의 항목을 바꾼다. `render`와 `prepare`는 bound map을 `$assign`과 정의 `data`로 받고 다시 binding하지 않는다. 다른 위치에서, 그리고 PHP extension의 bound map은 모든 위치에서 `E_DATA_UNSUPPORTED_TYPE`으로 실패한다(VAL-22). class는 final이고 instance로 만들거나 clone하거나 unserialize할 수 없다. 오류에는 template과 위치가 없다(ERR-14). |
| generated PHP program | Compiler는 `--php-namespace` 또는 `compileSource`의 `phpNamespace` 옵션이 정한 namespace에 generated program을 선언한다. `new \\Your\\Namespace\\GeneratedProgram($runtime)`로 만든다. |
| `$astProgram->register(string $name, callable $fn)` | 호스트 함수 `fn(array $args, array $env): mixed`를 등록한다. 인자는 VAL-21 형태다. number는 `float`, safe 문자열은 `string`, list는 list 배열, map은 항목 순서의 배열, native object는 원본 PHP 객체다. |
| `ArrayLoader`, `FilesystemLoader` | 메모리 로더와 파일시스템 로더. 로더가 던진 예외는 렌더를 `E_LOAD_FAILED`로 실패시키며, `FilesystemLoader`는 읽을 수 없는 일반 파일에 대해 예외를 던진다. |
| `Json::parse(string $bytes)` | assign 데이터용 순서 보존 JSON 파서. 하나의 JSON 문서가 아닌 텍스트는 `E_DATA_INVALID_JSON`을 가진 `BindError`다. |
| `TemplateError` | `errorCode`, `template`, `errorLine`, `errorCol`, `offset`, `end`와 `toArray()`를 가진 예외. |
| `SafeString` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
php bin/template.php parse FILE [--root DIR] [--delimiters OC]
php bin/template.php render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
## 개발

```sh
composer install
vendor/bin/pint --test
vendor/bin/phpunit
```

테스트는 `tests/`에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.
