<?php

declare(strict_types=1);

namespace Polyspec\Template;

use Polyspec\Template\Render\Context;
use Polyspec\Template\Render\Frame;
use Polyspec\Template\Render\Renderer;
use Polyspec\Template\Render\Scope;
use Polyspec\Template\Value\MapValue;

/** Prepared AST interpreter execution. */
final class AstPreparedExecution implements PreparedExecution
{
    /** Creates an AST execution from normalized request state. */
    public function __construct(
        private readonly AstProgram $engine,
        private readonly MapValue $rootData,
        /** @var array<string, array{template: string, data: MapValue|null}|array{html: string}> */
        private readonly array $registry,
        /** @var array{timezone: string, now: float} */
        private readonly array $env,
        private readonly string $targetName,
        /** @var array{ast: array<string, mixed>, lines: list<int>|null} */
        private readonly array $template,
    ) {
    }

    /** Interprets the prepared AST with fresh execution state. */
    public function render(): string
    {
        $context = new Context($this->engine, $this->rootData, $this->env, $this->targetName);
        $context->registry = $this->registry;
        $context->enter($this->targetName, null, null);
        (new Renderer($context, $this->engine))->renderNodes(
            $this->template['ast']['body'],
            new Frame($this->template['ast']['name'], $this->template['lines'], $this->rootData),
            new Scope(),
        );

        return $context->output();
    }
}
