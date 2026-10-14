<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Generated\EmptyState;

use Polyspec\Template\PreparedExecution;
use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\RuntimeBindings;
use Polyspec\Template\Render\RuntimeEnvironment;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\Value\MapValue;

final class GeneratedExecution implements PreparedExecution
{
    public function __construct(
        private readonly string $target,
        private readonly Assign $assign,
        private readonly Definitions $definitions,
        private readonly MapValue $rootData,
        private readonly array $env,
        private readonly RuntimeEnvironment $services,
        private readonly ?string $html,
    ) {
    }

    public function render(): string
    {
        $context = new Context($this->services, $this->rootData, $this->env, $this->target);
        $runtime = new RuntimeBindings($context);
        $scope = new Scope();
        $context->enter($this->target, null, null);
        try {
            if ($this->html !== null) {
                $context->write($this->html);
            } else {
                GeneratedTemplates::render(
                    $this->target,
                    $this->assign,
                    $this->definitions,
                    $context,
                    $runtime,
                    $this->rootData,
                    $scope,
                );
            }

            return $context->output();
        } finally {
            $context->leave();
        }
    }
}
