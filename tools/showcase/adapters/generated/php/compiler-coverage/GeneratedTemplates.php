<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\CompilerCoverage;

use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeBindings;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\Value\MapValue;

final class GeneratedTemplates
{
    public static function render(string $target, Assign $assign, Definitions $definitions, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void
    {
        switch ($target) {
            case 'layout.tpl':
                self::renderLayoutTpl($assign, $definitions, new InputLayoutTpl(), $context, $runtime, $rootData, $scope);
                return;
            default:
                throw $context->fail('E_LOAD_NOT_FOUND', null, null, 'template ' . $target . ' does not exist');
        }
    }

    private static function renderCardTpl(Assign $assign, Definitions $definitions, InputCardTpl $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void
    {
        $frame = new Frame('card.tpl', [0, 30], $rootData);
        $scope->locals->set('label', $input->label);
        $context->at($frame, [0, 16]);
        $context->write('<p class="card">');
        $context->at($frame, [16, 25]);
        $context->write($runtime->escape($scope->lookup($frame, 'label'), $frame, [19, 24]));
        $context->at($frame, [25, 30]);
        $context->write(('</p>' . "\n"));
    }

    private static function renderLayoutTpl(Assign $assign, Definitions $definitions, InputLayoutTpl $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void
    {
        $frame = new Frame('layout.tpl', [0, 29, 66, 76, 100, 137, 191, 268, 305, 392, 463, 468, 483, 563, 567, 582, 586, 592, 608, 655, 684, 695], $rootData);
        $scope->locals->set('values', $runtime->depth(GeneratedRuntime::list([['spread' => false, 'value' => 0], ['spread' => true, 'value' => $runtime->listSpread($assign->numbers, $frame, [16, 26])]]), $frame, [12, 27]));
        $scope->locals->set('merged', $runtime->depth(GeneratedRuntime::map([['spread' => true, 'value' => $runtime->mapSpread($assign->lookup, $frame, [42, 51])], ['spread' => false, 'key' => 'z', 'value' => 'Z']]), $frame, [41, 64]));
        $context->at($frame, [66, 80]);
        $context->write(('<section>' . "\n" . '<h1>'));
        $context->at($frame, [80, 94]);
        $context->write($runtime->escape($assign->page?->title, $frame, [83, 93]));
        $context->at($frame, [94, 119]);
        $context->write(('</h1>' . "\n" . '<p class="escaped">'));
        $context->at($frame, [119, 132]);
        $context->write($runtime->escape($assign->dangerous, $frame, [122, 131]));
        $context->at($frame, [132, 156]);
        $context->write(('</p>' . "\n" . '<p class="logical">'));
        $context->at($frame, [156, 171]);
        $context->write($runtime->escape(($runtime->truthy($assign->flag) && $runtime->truthy('x')), $frame, [159, 170]));
        $context->at($frame, [171, 172]);
        $context->write('|');
        $context->at($frame, [172, 186]);
        $context->write($runtime->escape(($runtime->truthy(false) || $runtime->truthy(2)), $frame, [175, 185]));
        $context->at($frame, [186, 219]);
        $context->write(('</p>' . "\n" . '<p class="empty-truthiness">'));
        $context->at($frame, [219, 241]);
        $context->write($runtime->escape(($runtime->truthy($assign->empty_list) && $runtime->truthy($assign->flag)), $frame, [222, 240]));
        $context->at($frame, [241, 242]);
        $context->write('|');
        $context->at($frame, [242, 263]);
        $context->write($runtime->escape(($runtime->truthy($assign->empty_map) && $runtime->truthy($assign->flag)), $frame, [245, 262]));
        $context->at($frame, [263, 271]);
        $context->write(('</p>' . "\n" . '<p>'));
        $context->at($frame, [271, 284]);
        $context->write($runtime->escape($runtime->index($scope->lookup($frame, 'values'), 1, $frame, [274, 283]), $frame, [274, 283]));
        $context->at($frame, [284, 285]);
        $context->write('|');
        $context->at($frame, [285, 300]);
        $context->write($runtime->escape($runtime->index($scope->lookup($frame, 'merged'), 'z', $frame, [288, 299]), $frame, [288, 299]));
        $context->at($frame, [300, 305]);
        $context->write(('</p>' . "\n"));
        if ($runtime->truthy(($runtime->truthy($assign->flag) && $runtime->truthy($runtime->binary('==', $assign->page?->title, 'Guide', $frame, [316, 337]))))) {
            $context->at($frame, [338, 362]);
            $context->write('<strong>matched</strong>');
        } else {
            $context->at($frame, [365, 388]);
            $context->write('<strong>missed</strong>');
        }
        $context->at($frame, [391, 395]);
        $context->write(("\n" . '<p>'));
        $context->at($frame, [395, 418]);
        $context->write($runtime->escape(($runtime->truthy($assign->flag) ? 'yes' : 'no'), $frame, [398, 417]));
        $context->at($frame, [418, 419]);
        $context->write('|');
        $context->at($frame, [419, 429]);
        $context->write($runtime->escape($runtime->binary('+', $runtime->unary('-', 1, $frame, [422, 424]), 3, $frame, [422, 428]), $frame, [422, 428]));
        $context->at($frame, [429, 430]);
        $context->write('|');
        $context->at($frame, [430, 458]);
        $context->write($runtime->escape($runtime->call('default', ['', 'fallback'], $frame, [433, 457]), $frame, [433, 457]));
        $context->at($frame, [458, 468]);
        $context->write(('</p>' . "\n" . '<ul>' . "\n"));
        $row_entries = $runtime->entries($assign->rows, $frame, [468, 585]);
        $row_size = count($row_entries);
        $row_last_index = $row_size - 1;
        $row_had = $scope->locals->has('row');
        $row_previous = $scope->locals->get('row');
        foreach ($row_entries as $row_index => [$row_key, $row_value]) {
            $scope->locals->set('row', $row_value);
            $row_stack = $scope->loops['row'] ?? [];
            $row_stack[] = ['index_' => (float) $row_index, 'size_' => (float) $row_size, 'first_' => $row_index === 0, 'last_' => $row_index === $row_last_index, 'key_' => $row_key, 'value_' => $row_value];
            $scope->loops['row'] = $row_stack;
            $context->iterations++;
            $runtime->limit('iteration', $context->iterations, $frame, [468, 585]);
            $context->at($frame, [483, 487]);
            $context->write('<li>');
            $context->at($frame, [487, 501]);
            $context->write($runtime->escape($scope->loopMeta('row')['index_'], $frame, [490, 500]));
            $context->at($frame, [501, 502]);
            $context->write('/');
            $context->at($frame, [502, 515]);
            $context->write($runtime->escape($scope->loopMeta('row')['size_'], $frame, [505, 514]));
            $context->at($frame, [515, 516]);
            $context->write(':');
            $context->at($frame, [516, 528]);
            $context->write($runtime->escape($scope->lookup($frame, 'row')?->name, $frame, [519, 527]));
            $context->at($frame, [528, 529]);
            $context->write(':');
            $context->at($frame, [529, 543]);
            $context->write($runtime->escape($scope->loopMeta('row')['first_'], $frame, [532, 542]));
            $context->at($frame, [543, 544]);
            $context->write(':');
            $context->at($frame, [544, 557]);
            $context->write($runtime->escape($scope->loopMeta('row')['last_'], $frame, [547, 556]));
            $context->at($frame, [557, 563]);
            $context->write(('</li>' . "\n"));
            $row_stack = $scope->loops['row'];
            array_pop($row_stack);
            if ($row_stack === []) {
                unset($scope->loops['row']);
            } else {
                $scope->loops['row'] = $row_stack;
            }
        }
        if ($row_had) {
            $scope->locals->set('row', $row_previous);
        } else {
            $scope->locals->remove('row');
        }
        if ($row_size === 0) {
            $context->at($frame, [567, 582]);
            $context->write(('<li>empty</li>' . "\n"));
        }
        $context->at($frame, [586, 592]);
        $context->write(('</ul>' . "\n"));
        $context->enter('partial.tpl', $frame, [592, 607]);
        try {
            self::renderPartialTpl($assign, $definitions, new InputPartialTpl(values: $scope->lookup($frame, 'values')), $context, $runtime, $rootData, $scope);
        } finally {
            $context->leave();
        }
        if ($definitions->content !== null) {
            $context->at($frame, [620, 634]);
            $context->write('<p>defined</p>');
        } else {
            $context->at($frame, [637, 651]);
            $context->write('<p>missing</p>');
        }
        $context->at($frame, [654, 655]);
        $context->write("\n");
        $definition = $definitions->content;
        if ($definition === null) {
            throw $runtime->error($frame, [655, 683], 'E_RUNTIME_BLOCK_UNDEFINED', 'define content is not registered');
        }
        if ($definition?->html !== null) {
            $context->at($frame, [655, 683]);
            $context->write($definition->html);
        } else {
            if ($definition?->data !== null && !($definition->data instanceof DefinitionDataCardTpl)) {
                throw $runtime->error($frame, [655, 683], 'E_RUNTIME_TYPE', 'generated definition content data has an invalid type');
            }
            $input = new InputCardTpl(label: ($definition?->data !== null && $definition->data->has_label ? $definition->data->label : throw $runtime->error($frame, [655, 683], 'E_RUNTIME_TYPE', 'generated input card.tpl.label is missing')));
            if ($definition?->data !== null) {
                if ($definition->data->has_label) {
                    $input->label = $definition->data->label;
                }
            }
            $input->label = $assign->page?->title;
            $blockScope = new Scope();
            $context->enter('card.tpl', $frame, [655, 683]);
            try {
                self::renderCardTpl($assign, $definitions, $input, $context, $runtime, $rootData, $blockScope);
            } finally {
                $context->leave();
            }
        }
        $context->at($frame, [684, 695]);
        $context->write(('</section>' . "\n"));
    }

    private static function renderPartialTpl(Assign $assign, Definitions $definitions, InputPartialTpl $input, Context $context, RuntimeBindings $runtime, MapValue $rootData, Scope $scope): void
    {
        $frame = new Frame('partial.tpl', [0, 38], $rootData);
        $scope->locals->set('values', $input->values);
        $context->at($frame, [0, 20]);
        $context->write('<p class="included">');
        $context->at($frame, [20, 33]);
        $context->write($runtime->escape($runtime->index($scope->lookup($frame, 'values'), 2, $frame, [23, 32]), $frame, [23, 32]));
        $context->at($frame, [33, 38]);
        $context->write(('</p>' . "\n"));
    }
}
