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
final class Page { public function __construct(public readonly string $title) {} }
final class Row { public function __construct(public readonly string $name) {} }
final class Slot { public function __construct(public readonly ?string $template = null, public readonly ?string $html = null) {} }
final class Assign { public function __construct(
public readonly bool $flag,
public readonly string $dangerous,
public readonly array $empty_list,
public readonly MapValue $empty_map,
public readonly Page $page,
public readonly array $numbers,
public readonly MapValue $lookup,
public readonly array $rows
) {} }
final class Input_card_tpl { public function __construct(public string $label) {} }
final class Input_layout_tpl { public function __construct() {} }
final class Input_partial_tpl { public function __construct(public array $values) {} }
final class DefinitionData_card_tpl { public function __construct(public bool $has_label = false, public ?string $label = null) {} }
final class DefinitionData_layout_tpl { public function __construct() {} }
final class DefinitionData_partial_tpl { public function __construct(public bool $has_values = false, public ?array $values = null) {} }
final class Definition { public function __construct(public readonly ?string $html = null, public readonly mixed $data = null) {} }
final class Definitions { public function __construct(public readonly ?Definition $content = null, public readonly ?Definition $layout = null) {} }
final class ArtifactManifest { public function __construct(public readonly int $schema, public readonly string $mode, public readonly string $target, public readonly string $entry, public readonly string $sourceDigest, public readonly string $typeDigest, public readonly string $contractDigest, public readonly array $files) {} }
const GENERATED_RECORDS_SCHEMA = 'eyJQYWdlIjp7InRpdGxlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9fSwiUm93Ijp7Im5hbWUiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX19LCJTbG90Ijp7InRlbXBsYXRlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6dHJ1ZX0sImh0bWwiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjp0cnVlfX19';
const GENERATED_ASSIGN_SCHEMA = 'eyJmbGFnIjp7ImtpbmQiOiJib29sZWFuIiwib3B0aW9uYWwiOmZhbHNlfSwiZGFuZ2Vyb3VzIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9LCJlbXB0eV9saXN0Ijp7ImtpbmQiOiJsaXN0IiwiaXRlbSI6eyJraW5kIjoic3RyaW5nIiwib3B0aW9uYWwiOmZhbHNlfSwib3B0aW9uYWwiOmZhbHNlfSwiZW1wdHlfbWFwIjp7ImtpbmQiOiJtYXAiLCJrZXkiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX0sInZhbHVlIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9LCJvcHRpb25hbCI6ZmFsc2V9LCJwYWdlIjp7ImtpbmQiOiJyZWNvcmQiLCJuYW1lIjoiUGFnZSIsIm9wdGlvbmFsIjpmYWxzZX0sIm51bWJlcnMiOnsia2luZCI6Imxpc3QiLCJpdGVtIjp7ImtpbmQiOiJudW1iZXIiLCJvcHRpb25hbCI6ZmFsc2V9LCJvcHRpb25hbCI6ZmFsc2V9LCJsb29rdXAiOnsia2luZCI6Im1hcCIsImtleSI6eyJraW5kIjoic3RyaW5nIiwib3B0aW9uYWwiOmZhbHNlfSwidmFsdWUiOnsia2luZCI6InN0cmluZyIsIm9wdGlvbmFsIjpmYWxzZX0sIm9wdGlvbmFsIjpmYWxzZX0sInJvd3MiOnsia2luZCI6Imxpc3QiLCJpdGVtIjp7ImtpbmQiOiJyZWNvcmQiLCJuYW1lIjoiUm93Iiwib3B0aW9uYWwiOmZhbHNlfSwib3B0aW9uYWwiOmZhbHNlfX0=';
const GENERATED_DEFINITION_SCHEMA = 'eyJjb250ZW50Ijp7ImZpZWxkIjoiY29udGVudCIsInRhcmdldCI6ImNhcmQudHBsIiwiaHRtbCI6dHJ1ZSwiY2xhc3MiOiJEZWZpbml0aW9uRGF0YV9jYXJkX3RwbCIsImlucHV0Ijp7ImxhYmVsIjp7ImtpbmQiOiJzdHJpbmciLCJvcHRpb25hbCI6ZmFsc2V9fX0sImxheW91dCI6eyJmaWVsZCI6ImxheW91dCIsInRhcmdldCI6ImxheW91dC50cGwiLCJodG1sIjpmYWxzZSwiY2xhc3MiOiJEZWZpbml0aW9uRGF0YV9sYXlvdXRfdHBsIiwiaW5wdXQiOnt9fX0=';
function generated_schema(string $encoded): array { static $schemas = []; return $schemas[$encoded] ??= json_decode(base64_decode($encoded, true), true, flags: JSON_THROW_ON_ERROR); }
function generated_bind_type(mixed $value, array $type, string $path): mixed { if ($value === null) { if (($type['optional'] ?? false) || $type['kind'] === 'null' || $type['kind'] === 'any') return null; throw new InvalidArgumentException($path . ' is required'); } if ($type['kind'] === 'any') return $value; if (in_array($type['kind'], ['string', 'number', 'boolean'], true)) { $valid = $type['kind'] === 'string' ? is_string($value) : ($type['kind'] === 'number' ? (is_float($value) || is_int($value)) : is_bool($value)); if (!$valid) throw new InvalidArgumentException($path . ' has an invalid type'); return $type['kind'] === 'number' ? (float) $value : $value; } if ($type['kind'] === 'list') { if (!is_array($value)) throw new InvalidArgumentException($path . ' is not a list'); return array_map(fn ($item, $index) => generated_bind_type($item, $type['item'], $path . '[' . $index . ']'), $value, array_keys($value)); } if ($type['kind'] === 'map') { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not a map'); $result = new MapValue(); foreach ($value->entries() as $key => $item) $result->set((string) generated_bind_type($key, $type['key'], $path . '.key'), generated_bind_type($item, $type['value'], $path . '.' . $key)); return $result; } if ($type['kind'] === 'record') { $records = generated_schema(GENERATED_RECORDS_SCHEMA); return generated_bind_record($value, $records[$type['name']], $type['name'], $path); } throw new InvalidArgumentException($path . ' has an unknown generated type'); }
function generated_bind_record(mixed $value, array $fields, string $class, string $path): object { if (!$value instanceof MapValue) throw new InvalidArgumentException($path . ' is not an object'); $arguments = []; foreach ($fields as $name => $type) { if (!$value->has($name)) { if (!($type['optional'] ?? false)) throw new InvalidArgumentException($path . '.' . $name . ' is required'); continue; } $arguments[$name] = generated_bind_type($value->get($name), $type, $path . '.' . $name); } return new $class(...$arguments); }
function generated_bind_assign(mixed $value): array { $root = Bind::map($value); return [generated_bind_record($root, generated_schema(GENERATED_ASSIGN_SCHEMA), Assign::class, 'assign'), $root]; }
function generated_bind_definitions(array $input): array { $value = Bind::map($input); $arguments = []; $targets = []; $specs = generated_schema(GENERATED_DEFINITION_SCHEMA); foreach ($value->entries() as $id => $raw) { $spec = $specs[$id] ?? null; if ($spec === null) throw new InvalidArgumentException('define.' . $id . ' is not declared'); if (is_string($raw)) { if ($spec['target'] === null || $raw !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $arguments[$spec['field']] = new Definition(); $targets[$id] = ['target' => $spec['target']]; continue; } if (!$raw instanceof MapValue) throw new InvalidArgumentException('define.' . $id . ' is not an object'); $template = $raw->get('template'); $html = $raw->get('html'); $data = $raw->get('data'); if (is_string($html)) { if (!$spec['html'] || $raw->has('template') || $raw->has('data')) throw new InvalidArgumentException('define.' . $id . ' has an invalid html entry'); $arguments[$spec['field']] = new Definition(html: $html); $targets[$id] = ['target' => null, 'html' => $html]; continue; } if (!is_string($template) || $spec['target'] === null || $template !== $spec['target']) throw new InvalidArgumentException('define.' . $id . ' has an invalid template'); $boundData = null; if ($raw->has('data')) { if ($data === []) $data = new MapValue(); if (!$data instanceof MapValue) throw new InvalidArgumentException('define.' . $id . '.data is not an object'); $values = []; foreach ($spec['input'] as $name => $type) { if ($data->has($name)) { $values['has_' . $name] = true; $values[$name] = generated_bind_type($data->get($name), $type, 'define.' . $id . '.data.' . $name); } } $class = $spec['class']; $boundData = new $class(...$values); } $arguments[$spec['field']] = new Definition(data: $boundData); $targets[$id] = ['target' => $spec['target']]; } return [new Definitions(...$arguments), $targets]; }
function generated_list(array $items): array { $result = []; foreach ($items as $item) { if ($item['spread']) array_push($result, ...$item['value']); else $result[] = $item['value']; } return $result; }
function generated_map(array $items): MapValue { $result = new MapValue(); foreach ($items as $item) { if ($item['spread']) { foreach ($item['value']->entries() as $key => $value) $result->set($key, $value); } else $result->set((string) $item['key'], $item['value']); } return $result; }
function generated_env(mixed $input): array { if ($input === null) $input = []; if (!is_array($input)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env is not an object'); $timezone = $input['timezone'] ?? 'Z'; $now = $input['now'] ?? (float) time(); if (!is_string($timezone)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string'); if (!is_int($now) && !is_float($now)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number'); return ['timezone' => $timezone, 'now' => (float) $now]; }

function render_card_tpl(Assign $assign, Definitions $definitions, Input_card_tpl $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void {
    $frame = new Frame("card.tpl", [0,30], $rootData);
    $scope->locals->set("label", $input->label);
    $context->at($frame, [0,16]); $context->write("<p class=\"card\">");
    $context->at($frame, [16,25]); $context->write($runtime->escape($scope->lookup($frame, "label"), $frame, [19,24]));
    $context->at($frame, [25,30]); $context->write("</p>\n");
}
function render_layout_tpl(Assign $assign, Definitions $definitions, Input_layout_tpl $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void {
    $frame = new Frame("layout.tpl", [0,27,62,72,96,133,187,264,301,388,459,464,479,559,563,578,582,588,604,651,680,691], $rootData);

    $scope->locals->set("values", generated_list([['spread' => false, 'value' => 0], ['spread' => true, 'value' => $assign->numbers]]));
    $scope->locals->set("merged", generated_map([['spread' => true, 'value' => $assign->lookup], ['spread' => false, 'key' => "z", 'value' => "Z"]]));
    $context->at($frame, [62,76]); $context->write("<section>\n<h1>");
    $context->at($frame, [76,90]); $context->write($runtime->escape($assign->page?->title, $frame, [79,89]));
    $context->at($frame, [90,115]); $context->write("</h1>\n<p class=\"escaped\">");
    $context->at($frame, [115,128]); $context->write($runtime->escape($assign->dangerous, $frame, [118,127]));
    $context->at($frame, [128,152]); $context->write("</p>\n<p class=\"logical\">");
    $context->at($frame, [152,167]); $context->write($runtime->escape(($runtime->truthy($assign->flag) && $runtime->truthy("x")), $frame, [155,166]));
    $context->at($frame, [167,168]); $context->write("|");
    $context->at($frame, [168,182]); $context->write($runtime->escape(($runtime->truthy(false) || $runtime->truthy(2)), $frame, [171,181]));
    $context->at($frame, [182,215]); $context->write("</p>\n<p class=\"empty-truthiness\">");
    $context->at($frame, [215,237]); $context->write($runtime->escape(($runtime->truthy($assign->empty_list) && $runtime->truthy($assign->flag)), $frame, [218,236]));
    $context->at($frame, [237,238]); $context->write("|");
    $context->at($frame, [238,259]); $context->write($runtime->escape(($runtime->truthy($assign->empty_map) && $runtime->truthy($assign->flag)), $frame, [241,258]));
    $context->at($frame, [259,267]); $context->write("</p>\n<p>");
    $context->at($frame, [267,280]); $context->write($runtime->escape($runtime->index($scope->lookup($frame, "values"), 1), $frame, [270,279]));
    $context->at($frame, [280,281]); $context->write("|");
    $context->at($frame, [281,296]); $context->write($runtime->escape($runtime->index($scope->lookup($frame, "merged"), "z"), $frame, [284,295]));
    $context->at($frame, [296,301]); $context->write("</p>\n");
    if ($runtime->truthy(($runtime->truthy($assign->flag) && $runtime->truthy($runtime->binary("==", $assign->page?->title, "Guide", $frame, [312,333]))))) {
        $context->at($frame, [334,358]); $context->write("<strong>matched</strong>");    } else {
        $context->at($frame, [361,384]); $context->write("<strong>missed</strong>");
    }
    $context->at($frame, [387,391]); $context->write("\n<p>");
    $context->at($frame, [391,414]); $context->write($runtime->escape(($runtime->truthy($assign->flag) ? "yes" : "no"), $frame, [394,413]));
    $context->at($frame, [414,415]); $context->write("|");
    $context->at($frame, [415,425]); $context->write($runtime->escape($runtime->binary("+", $runtime->unary("-", 1, $frame, [418,420]), 3, $frame, [418,424]), $frame, [418,424]));
    $context->at($frame, [425,426]); $context->write("|");
    $context->at($frame, [426,454]); $context->write($runtime->escape($runtime->call("default", ["", "fallback"], $frame, [429,453]), $frame, [429,453]));
    $context->at($frame, [454,464]); $context->write("</p>\n<ul>\n");
    $row_entries = $runtime->entries($assign->rows, $frame, [464,581]);
    $row_had = $scope->locals->has("row");
    $row_previous = $scope->locals->get("row");
    foreach ($row_entries as $row_index => [$row_key, $row_value]) {
        $scope->locals->set("row", $row_value);
        $row_size = count($row_entries);
        $row_first = $row_index === 0;
        $row_last = $row_index + 1 === count($row_entries);
        $context->iterations++;
        $runtime->limit('iteration', $context->iterations, $frame, [464,581]);
            $context->at($frame, [479,483]); $context->write("<li>");
            $context->at($frame, [483,497]); $context->write($runtime->escape($row_index, $frame, [486,496]));
            $context->at($frame, [497,498]); $context->write("/");
            $context->at($frame, [498,511]); $context->write($runtime->escape($row_size, $frame, [501,510]));
            $context->at($frame, [511,512]); $context->write(":");
            $context->at($frame, [512,524]); $context->write($runtime->escape($scope->lookup($frame, "row")?->name, $frame, [515,523]));
            $context->at($frame, [524,525]); $context->write(":");
            $context->at($frame, [525,539]); $context->write($runtime->escape($row_first, $frame, [528,538]));
            $context->at($frame, [539,540]); $context->write(":");
            $context->at($frame, [540,553]); $context->write($runtime->escape($row_last, $frame, [543,552]));
            $context->at($frame, [553,559]); $context->write("</li>\n");
    }
    if ($row_had) $scope->locals->set("row", $row_previous); else $scope->locals->remove("row");
    if (count($row_entries) === 0) {
            $context->at($frame, [563,578]); $context->write("<li>empty</li>\n");
    }
    $context->at($frame, [582,588]); $context->write("</ul>\n");
    $context->enter("partial.tpl", $frame, [588,603]);
    try { render_partial_tpl($assign, $definitions, new Input_partial_tpl(values: $scope->lookup($frame, "values")), $context, $runtime, $rootData, $scope); } finally { $context->leave(); }
    if ($definitions->content !== null) {
            $context->at($frame, [616,630]); $context->write("<p>defined</p>");
    } else {
            $context->at($frame, [633,647]); $context->write("<p>missing</p>");
    }
    $context->at($frame, [650,651]); $context->write("\n");
    $definition = $definitions->content;
    if ($definition === null) throw $runtime->error($frame, [651,679], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
    if ($definition?->html !== null) {
        $context->at($frame, [651,679]); $context->write($definition->html);
    } else {
        if ($definition?->data !== null && !($definition->data instanceof DefinitionData_card_tpl)) throw $runtime->error($frame, [651,679], 'E_RUNTIME_TYPE', "generated definition content data has an invalid type");
        $input = new Input_card_tpl(label: ($definition?->data !== null && $definition->data->has_label ? $definition->data->label : throw $runtime->error($frame, [651,679], 'E_RUNTIME_TYPE', "generated input card.tpl.label is missing")));
        if ($definition?->data !== null) {
            if ($definition->data->has_label) $input->label = $definition->data->label;
        }
        $input->label = $assign->page?->title;
        $blockScope = new Scope();
        $context->enter("card.tpl", $frame, [651,679]);
        try { render_card_tpl($assign, $definitions, $input, $context, $runtime, $rootData, $blockScope); } finally { $context->leave(); }
    }
    $context->at($frame, [680,691]); $context->write("</section>\n");
}
function render_partial_tpl(Assign $assign, Definitions $definitions, Input_partial_tpl $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void {
    $frame = new Frame("partial.tpl", [0,38], $rootData);
    $scope->locals->set("values", $input->values);
    $context->at($frame, [0,20]); $context->write("<p class=\"included\">");
    $context->at($frame, [20,33]); $context->write($runtime->escape($runtime->index($scope->lookup($frame, "values"), 2), $frame, [23,32]));
    $context->at($frame, [33,38]); $context->write("</p>\n");
}
function render_template(string $target, Assign $assign, Definitions $definitions, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void { switch ($target) {
        case "layout.tpl": render_layout_tpl($assign, $definitions, new Input_layout_tpl(), $context, $runtime, $rootData, $scope); return;
        default: throw $context->fail('E_LOAD_NOT_FOUND', null, null, 'template ' . $target . ' does not exist');
} }
final class GeneratedExecution implements PreparedExecution { public function __construct(private readonly string $target, private readonly Assign $assign, private readonly Definitions $definitions, private readonly MapValue $rootData, private readonly array $env, private readonly RuntimeEnvironment $services, private readonly ?string $html) {} public function render(): string { $context = new Context($this->services, $this->rootData, $this->env, $this->target); $runtime = new RuntimeBindings($context); $scope = new Scope(); $context->enter($this->target, null, null); try { if ($this->html !== null) $context->write($this->html); else render_template($this->target, $this->assign, $this->definitions, $context, $runtime, $this->rootData, $scope); return $context->output(); } finally { $context->leave(); } } }
final class GeneratedProgram implements Program { public readonly RuntimeEnvironment $runtime; public function __construct(?RuntimeEnvironment $runtime = null) { $this->runtime = $runtime ?? new RuntimeEnvironment(); } public function prepare(string|array $target, mixed $assign = [], array $options = []): PreparedRender { if (!is_string($target)) throw new InvalidArgumentException('generated target must be a template name'); [$typedAssign, $rootData] = generated_bind_assign($assign); [$definitions, $targets] = generated_bind_definitions($options['define'] ?? []); $resolved = $targets[$target] ?? null; $targetName = $resolved['target'] ?? $target; $html = $resolved['html'] ?? null; return new PreparedRender(new GeneratedExecution($targetName, $typedAssign, $definitions, $rootData, generated_env($options['env'] ?? []), $this->runtime, $html)); } public function render(string|array $target, mixed $assign = [], array $options = []): string { return $this->prepare($target, $assign, $options)->render(); } }
