<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\ReactBoundary;

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
            case 'content.tpl':
                self::renderContentTpl(
                    $assign,
                    $definitions,
                    new InputContentTpl(),
                    $context,
                    $runtime,
                    $rootData,
                    $scope,
                );
                return;
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
        $frame = new Frame('content.tpl', [0, 41, 65, 76], $rootData);
        $context->at($frame, [0, 44]);
        $context->write(('<section data-react-island id="counter">' . "\n" . '<p>'));
        $context->at($frame, [44, 60]);
        $context->write($runtime->escape($assign->island_label, $frame, [47, 59]));
        $context->at($frame, [60, 76]);
        $context->write(('</p>' . "\n" . '</section>' . "\n"));
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
        $frame = new Frame('layout.tpl', [0, 7, 26, 38, 46], $rootData);
        $context->at($frame, [0, 11]);
        $context->write(('<main>' . "\n" . '<h1>'));
        $context->at($frame, [11, 20]);
        $context->write($runtime->escape($assign->title, $frame, [14, 19]));
        $context->at($frame, [20, 26]);
        $context->write(('</h1>' . "\n"));
        $definition = $definitions->content;
        if ($definition === null) {
            throw $runtime->error($frame, [26, 37], 'E_RUNTIME_BLOCK_UNDEFINED', 'define content is not registered');
        }
        if ($definition?->html !== null) {
            $context->at($frame, [26, 37]);
            $context->write($definition->html);
        } else {
            if ($definition?->data !== null && !($definition->data instanceof DefinitionDataContentTpl)) {
                throw $runtime->error(
                    $frame,
                    [26, 37],
                    'E_RUNTIME_TYPE',
                    'generated definition content data has an invalid type',
                );
            }
            $input = new InputContentTpl();
            $blockScope = new Scope();
            $context->enter('content.tpl', $frame, [26, 37]);
            try {
                self::renderContentTpl($assign, $definitions, $input, $context, $runtime, $rootData, $blockScope);
            } finally {
                $context->leave();
            }
        }
        $context->at($frame, [38, 46]);
        $context->write(('</main>' . "\n"));
    }
}
