<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ScopePrecedence;

use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\RuntimeBindings;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\Value\MapValue;

final class GeneratedTemplates
{
    public static function render(
        string $target,
        Assign $assign,
        Definitions $definitions,
        Context $context,
        RuntimeBindings $runtime,
        MapValue $rootData,
        Scope $scope,
    ): void {
        switch ($target) {
            case 'layout.tpl':
                self::renderLayoutTpl(
                    $assign,
                    $definitions,
                    new InputLayoutTpl(),
                    $context,
                    $runtime,
                    $rootData,
                    $scope,
                );
                return;
            default:
                throw $context->fail('E_LOAD_NOT_FOUND', null, null, 'template ' . $target . ' does not exist');
        }
    }

    private static function renderContentTpl(
        Assign $assign,
        Definitions $definitions,
        InputContentTpl $input,
        Context $context,
        RuntimeBindings $runtime,
        MapValue $rootData,
        Scope $scope,
    ): void {
        $frame = new Frame('content.tpl', [0, 10, 29, 64, 105, 164, 175], $rootData);
        $scope->locals->set('title', $input->title);
        $scope->locals->set('root_label', $input->root_label);
        $scope->locals->set('defined_label', $input->defined_label);
        $scope->locals->set('layout_local', $input->layout_local);
        $context->at($frame, [0, 14]);
        $context->write(('<article>' . "\n" . '<h1>'));
        $context->at($frame, [14, 23]);
        $context->write($runtime->escape($scope->lookup($frame, 'title'), $frame, [17, 22]));
        $context->at($frame, [23, 45]);
        $context->write(('</h1>' . "\n" . '<p class="root">'));
        $context->at($frame, [45, 59]);
        $context->write($runtime->escape($scope->lookup($frame, 'root_label'), $frame, [48, 58]));
        $context->at($frame, [59, 83]);
        $context->write(('</p>' . "\n" . '<p class="defined">'));
        $context->at($frame, [83, 100]);
        $context->write($runtime->escape($scope->lookup($frame, 'defined_label'), $frame, [86, 99]));
        $context->at($frame, [100, 122]);
        $context->write(('</p>' . "\n" . '<p class="local">'));
        $context->at($frame, [122, 159]);
        $context->write(
            $runtime->escape(
                $runtime->call('default', [$scope->lookup($frame, 'layout_local'), 'missing'], $frame, [125, 158]),
                $frame,
                [125, 158],
            ),
        );
        $context->at($frame, [159, 175]);
        $context->write(('</p>' . "\n" . '</article>' . "\n"));
    }

    private static function renderLayoutTpl(
        Assign $assign,
        Definitions $definitions,
        InputLayoutTpl $input,
        Context $context,
        RuntimeBindings $runtime,
        MapValue $rootData,
        Scope $scope,
    ): void {
        $frame = new Frame('layout.tpl', [0, 44, 68, 97, 108], $rootData);
        $scope->locals->set('layout_local', 'visible only in layout');
        $context->at($frame, [44, 68]);
        $context->write(('<section class="scope">' . "\n"));
        $definition = $definitions->content;
        if ($definition === null) {
            throw $runtime->error($frame, [68, 96], 'E_RUNTIME_BLOCK_UNDEFINED', 'define content is not registered');
        }
        if ($definition?->html !== null) {
            $context->at($frame, [68, 96]);
            $context->write($definition->html);
        } else {
            if ($definition?->data !== null && !($definition->data instanceof DefinitionDataContentTpl)) {
                throw $runtime->error(
                    $frame,
                    [68, 96],
                    'E_RUNTIME_TYPE',
                    'generated definition content data has an invalid type',
                );
            }
            $scoped_title = $assign->page?->title;
            $input = new InputContentTpl(
                title: $scoped_title,
                root_label: $assign->root_label,
                defined_label: $assign->defined_label,
                layout_local: null,
            );
            if ($definition?->data !== null) {
                if ($definition->data->has_title) {
                    $input->title = $definition->data->title;
                }
                if ($definition->data->has_root_label) {
                    $input->root_label = $definition->data->root_label;
                }
                if ($definition->data->has_defined_label) {
                    $input->defined_label = $definition->data->defined_label;
                }
                if ($definition->data->has_layout_local) {
                    $input->layout_local = $definition->data->layout_local;
                }
            }
            $input->title = $scoped_title;
            $blockScope = new Scope();
            $context->enter('content.tpl', $frame, [68, 96]);
            try {
                self::renderContentTpl($assign, $definitions, $input, $context, $runtime, $rootData, $blockScope);
            } finally {
                $context->leave();
            }
        }
        $context->at($frame, [97, 108]);
        $context->write(('</section>' . "\n"));
    }
}
