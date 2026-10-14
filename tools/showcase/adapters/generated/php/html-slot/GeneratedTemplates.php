<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\HtmlSlot;

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

    private static function renderLayoutTpl(
        Assign $assign,
        Definitions $definitions,
        InputLayoutTpl $input,
        Context $context,
        RuntimeBindings $runtime,
        MapValue $rootData,
        Scope $scope,
    ): void {
        $frame = new Frame('layout.tpl', [0, 25, 46, 58, 69], $rootData);
        $context->at($frame, [0, 29]);
        $context->write(('<section class="notice">' . "\n" . '<h1>'));
        $context->at($frame, [29, 40]);
        $context->write($runtime->escape($assign->heading, $frame, [32, 39]));
        $context->at($frame, [40, 46]);
        $context->write(('</h1>' . "\n"));
        $definition = $definitions->content;
        if ($definition?->html === null) {
            throw $runtime->error($frame, [46, 57], 'E_RUNTIME_BLOCK_UNDEFINED', 'define content is not registered');
        }
        $context->at($frame, [46, 57]);
        $context->write($definition->html);
        $context->at($frame, [58, 69]);
        $context->write(('</section>' . "\n"));
    }
}
