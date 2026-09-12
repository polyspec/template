# polyspec/template

[English](README.md).

템플릿 언어의 PHP 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. `mbstring` 확장을 가진 PHP 8.2 이상이 필요하다.

## 설치

```sh
composer require polyspec/template
```

## 렌더

```php
use Polyspec\Template\Engine;
use Polyspec\Template\Loader\FilesystemLoader;

$engine = new Engine(new FilesystemLoader('templates'));
$engine->register('greet', fn (array $args): string => 'Hello, ' . $args[0]);
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
use Polyspec\Template\Engine;

$ast = Engine::parse(file_get_contents('layout.tpl'), 'layout.tpl');
$json = Ast::toJson($ast);
```

파싱된 템플릿은 `render()`에 전달하거나 `ArrayLoader`에 저장할 수 있다.

## API

| 멤버 | 설명 |
| --- | --- |
| `Engine::parse(string $source, string $name, array $options = [])` | 템플릿 하나를 AST(중첩 배열)로 파싱한다. `$options['delimiters']`가 구분자를 선택한다. |
| `new Engine(?LoaderInterface $loader = null, array $options = [])` | 엔진을 생성한다. 옵션: `functions`, `limits`, `delimiters`. |
| `$engine->render(string|array $target, mixed $assign = [], array $options = [])` | 템플릿 이름 또는 파싱된 템플릿을 렌더한다. `$assign`은 변수를 담고 옵션은 `define`, `env`다. |
| `$engine->register(string $name, callable $fn)` | 호스트 함수 `fn(array $args, array $env): mixed`를 등록한다. |
| `ArrayLoader`, `FilesystemLoader` | 메모리 로더와 파일시스템 로더. |
| `Json::parse(string $bytes)` | assign 데이터용 순서 보존 JSON 파서. |
| `TemplateError` | `errorCode`, `template`, `errorLine`, `errorCol`, `offset`, `end`와 `toArray()`를 가진 예외. |
| `SafeString` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
php bin/template.php parse FILE [--root DIR] [--delimiters OC] [--legacy-wrappers true]
php bin/template.php render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] [--legacy-wrappers true]
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
## 개발

```sh
composer install
vendor/bin/pint --test
vendor/bin/phpunit
```

테스트는 `tests/`에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.
