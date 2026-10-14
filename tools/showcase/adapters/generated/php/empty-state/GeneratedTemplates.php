<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\EmptyState;

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
        $frame = new Frame('layout.tpl', [0, 26, 39, 51, 55, 99, 103, 111], $rootData);
        $context->at($frame, [0, 26]);
        $context->write(('<main class="empty-page">' . "\n"));
        if ($definitions->content !== null) {
            $definition = $definitions->content;
            if ($definition?->html === null) {
                throw $runtime->error(
                    $frame,
                    [39, 50],
                    'E_RUNTIME_BLOCK_UNDEFINED',
                    'define content is not registered',
                );
            }
            $context->at($frame, [39, 50]);
            $context->write($definition->html);
        } else {
            $context->at($frame, [55, 99]);
            $context->write(('<p class="empty">No content definition.</p>' . "\n"));
        }
        $context->at($frame, [103, 111]);
        $context->write(('</main>' . "\n"));
    }
}
