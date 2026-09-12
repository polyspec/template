<?php

declare(strict_types=1);

use Polyspec\Template\PreparedExecution;
use Polyspec\Template\PreparedRender;
use Polyspec\Template\Program;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeBindings;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\Value\Bind;
use Polyspec\Template\Value\BindError;
use Polyspec\Template\Value\MapValue;

final class Assign { public function __construct(
public readonly string $page
) {} }
final class Input_layout_tpl { public function __construct() {} }
final class DefinitionData_layout_tpl { public function __construct() {} }
final class Definition { public function __construct(public readonly ?string $template = null, public readonly ?string $html = null, public readonly mixed $data = null) {} }
final class Definitions { public function __construct(public ?Definition $content = null, public ?Definition $layout = null) {} }
final class ArtifactManifest { public function __construct(public readonly int $schema, public readonly string $mode, public readonly string $target, public readonly string $entry, public readonly string $sourceDigest, public readonly string $typeDigest, public readonly string $contractDigest, public readonly array $files) {} }
const GENERATED_RECORDS_SCHEMA = 'e30=';
const GENERATED_ASSIGN_SCHEMA = 'eyJwYWdlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9fQ==';
const GENERATED_DEFINITION_SCHEMA = 'eyJjb250ZW50Ijp7ImZpZWxkIjoiY29udGVudCIsInRhcmdldCI6bnVsbCwiaHRtbCI6dHJ1ZSwiY2xhc3MiOm51bGwsImlucHV0Ijp7fX0sImxheW91dCI6eyJmaWVsZCI6ImxheW91dCIsInRhcmdldCI6ImxheW91dC50cGwiLCJodG1sIjpmYWxzZSwiY2xhc3MiOiJEZWZpbml0aW9uRGF0YV9sYXlvdXRfdHBsIiwiaW5wdXQiOnt9fX0=';
function generated_schema(string $encoded): array { static $schemas = []; return $schemas[$encoded] ??= json_decode(base64_decode($encoded, true), true, flags: JSON_THROW_ON_ERROR); }
function generated_bind_type(mixed $value, array $type, string $path): mixed { if ($value === null) { if (($type['optional'] ?? false) || $type['kind'] === 'null' || $type['kind'] === 'any') return null; throw new InvalidArgumentException($path . ' is required'); } if ($type['kind'] === 'any') return $value; if (in_array($type['kind'], ['string', 'number', 'boolean'], true)) { $valid = $type['kind'] === 'string' ? is_string($value) : ($type['kind'] === 'number' ? (is_float($value) || is_int($value)) : is_bool($value)); if (!$valid) throw new InvalidArgumentException($path . ' has an invalid type'); return $type['kind'] === 'number' ? (float) $value : $value; } if ($type['kind'] === 'list') { if (!is_array($value)) throw new InvalidArgumentException($path . ' is not a list'); return array_map(fn ($item, $index) => generated_bind_type($item, $type['item'], $path . '[' . $index . ']'), $value, array_keys($value)); } if ($type['kind'] === 'map') { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not a map'); $result = new MapValue(); foreach ($value->entries() as $key => $item) $result->set((string) generated_bind_type($key, $type['key'], $path . '.key'), generated_bind_type($item, $type['value'], $path . '.' . $key)); return $result; } if ($type['kind'] === 'record') { $records = generated_schema(GENERATED_RECORDS_SCHEMA); return generated_bind_record($value, $records[$type['name']], $type['name'], $path); } throw new InvalidArgumentException($path . ' has an unknown generated type'); }
function generated_bind_record(mixed $value, array $fields, string $class, string $path): object { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not an object'); $arguments = []; foreach ($fields as $name => $type) { if (!$value->has($name)) { if (!($type['optional'] ?? false)) throw new InvalidArgumentException($path . '.' . $name . ' is required'); continue; } $arguments[$name] = generated_bind_type($value->get($name), $type, $path . '.' . $name); } return new $class(...$arguments); }
function generated_bind_assign(mixed $value): array { $root = Bind::map($value); return [generated_bind_record($root, generated_schema(GENERATED_ASSIGN_SCHEMA), Assign::class, 'assign'), $root]; }
function generated_bind_definitions(array $input): array { $value = Bind::map($input); $arguments = []; $targets = []; $specs = generated_schema(GENERATED_DEFINITION_SCHEMA); foreach ($value->entries() as $id => $raw) { $spec = $specs[$id] ?? null; if ($spec === null) throw new InvalidArgumentException('define.' . $id . ' is not declared'); if (is_string($raw)) { if ($spec['target'] === null || $raw !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $arguments[$spec['field']] = new Definition(template: $spec['target']); $targets[$id] = ['target' => $spec['target']]; continue; } if (!$raw instanceof MapValue) throw new InvalidArgumentException('define.' . $id . ' is not an object'); $template = $raw->get('template'); $html = $raw->get('html'); $data = $raw->get('data'); if (is_string($html)) { if (!$spec['html'] || $raw->has('template') || $raw->has('data')) throw new InvalidArgumentException('define.' . $id . ' has an invalid html entry'); $arguments[$spec['field']] = new Definition(html: $html); $targets[$id] = ['target' => null, 'html' => $html]; continue; } if (!is_string($template) || $spec['target'] === null || $template !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $boundData = null; if ($raw->has('data')) { if ($data === []) $data = new MapValue(); if (!$data instanceof MapValue) throw new InvalidArgumentException('define.' . $id . '.data is not an object'); $values = []; foreach ($spec['input'] as $name => $type) { if ($data->has($name)) { $values['has_' . $name] = true; $values[$name] = generated_bind_type($data->get($name), $type, 'define.' . $id . '.data.' . $name); } } $class = $spec['class']; $boundData = new $class(...$values); } $arguments[$spec['field']] = new Definition(template: $spec['target'], data: $boundData); $targets[$id] = ['target' => $spec['target']]; } return [new Definitions(...$arguments), $targets]; }
function generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }
function generated_map(array $items): MapValue { $result = new MapValue(); foreach ($items as $item) { if ($item['spread']) { foreach ($item['value']->entries() as $key => $value) $result->set($key, $value); } else $result->set((string) $item['key'], $item['value']); } return $result; }
function generated_env(mixed $input): array { if ($input === null) $input = []; if (!is_array($input)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env is not an object'); $timezone = $input['timezone'] ?? 'Z'; $now = $input['now'] ?? (float) time(); if (!is_string($timezone)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string'); if (!is_int($now) && !is_float($now)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number'); return ['timezone' => $timezone, 'now' => (float) $now]; }

function render_layout_tpl(Assign $assign, Definitions $definitions, Input_layout_tpl $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void {
    $frame = new Frame("layout.tpl", [0,26,39,51,55,99,103,111], $rootData);

    $context->at($frame, [0,26]); $context->write("<main class=\"empty-page\">\n");
    if ($definitions->content !== null) {
            $definition = $definitions->content;
            if ($definition?->html === null) throw $runtime->error($frame, [39,50], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
            $context->at($frame, [39,50]); $context->write($definition->html);
    } else {
            $context->at($frame, [55,99]); $context->write("<p class=\"empty\">No content definition.</p>\n");
    }
    $context->at($frame, [103,111]); $context->write("</main>\n");
}
function render_template(string $target, Assign $assign, Definitions $definitions, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void { switch ($target) {
        case "layout.tpl": render_layout_tpl($assign, $definitions, new Input_layout_tpl(), $context, $runtime, $rootData, $scope); return;
        default: throw $context->fail('E_LOAD_NOT_FOUND', null, null, 'template ' . $target . ' does not exist');
} }
final class GeneratedExecution implements PreparedExecution { public function __construct(private readonly string $target, private readonly Assign $assign, private readonly Definitions $definitions, private readonly MapValue $rootData, private readonly array $env, private readonly RuntimeEnvironment $services, private readonly ?string $html) {} public function render(): string { $context = new Context($this->services, $this->rootData, $this->env, $this->target); $runtime = new RuntimeBindings($context); $scope = new Scope(); $context->enter($this->target, null, null); try { if ($this->html !== null) $context->write($this->html); else render_template($this->target, $this->assign, $this->definitions, $context, $runtime, $this->rootData, $scope); return $context->output(); } finally { $context->leave(); } } }
final class GeneratedProgram implements Program { public readonly RuntimeEnvironment $runtime; public function __construct(?RuntimeEnvironment $runtime = null) { $this->runtime = $runtime ?? new RuntimeEnvironment(); } public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender { if (!is_string($target)) throw new InvalidArgumentException('generated target must be a template name'); [$typedAssign, $rootData] = generated_bind_assign($assign); [$definitions, $targets] = generated_bind_definitions($options['define'] ?? []); $resolved = $targets[$target] ?? null; $targetName = $resolved['target'] ?? $target; $html = $resolved['html'] ?? null; return new PreparedRender(new GeneratedExecution($targetName, $typedAssign, $definitions, $rootData, generated_env($options['env'] ?? []), $this->runtime, $html)); } public function render(string|array $target, mixed $assign = [], array $options = []): string { return $this->prepare($target, $assign, $options)->render(); } }
