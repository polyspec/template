<?php

declare(strict_types=1);

namespace Polyspec\Showcase\Adapter\Php;

use Polyspec\Showcase\Adapter\DefineEntry;
use Polyspec\Showcase\Adapter\RenderAdapter;
use Polyspec\Showcase\Adapter\RenderRequest;
use Polyspec\Showcase\Adapter\RepeatResult;
use Polyspec\Showcase\Adapter\Scenario;
use Polyspec\Template\AstProgram;
use Polyspec\Template\Engine;
use Polyspec\Template\PreparedRender;
use RuntimeException;

/** The PHP adapter of the showcase render contract (packages/compiler/interface.json, showcaseAdapter). */
final class Adapter implements RenderAdapter
{
    private Engine $engine;

    public function __construct(private readonly string $root)
    {
        $program = getenv('SHOWCASE_EXECUTION_MODE') === 'generated'
            ? Inputs::generatedProgram($root)
            : new AstProgram(Inputs::artifactLoader($root));
        $this->engine = new Engine($program);
    }

    public function loadScenario(): Scenario
    {
        $metadata = Inputs::objectValue(Inputs::readJson($this->root, 'scenario.json'), 'scenario.json');
        $environment = is_file($this->root . '/env.json')
            ? Inputs::environmentValue(Inputs::readJson($this->root, 'env.json'))
            : null;

        return new Scenario(
            Inputs::stringField($metadata, 'target'),
            Inputs::objectValue(Inputs::readJson($this->root, 'data.json'), 'data.json'),
            Inputs::defineValue(Inputs::readJson($this->root, 'define.json')),
            $environment,
        );
    }

    public function buildRequest(Scenario $scenario): RenderRequest
    {
        return new RenderRequest($scenario->target, $scenario->assign, $scenario->define, $scenario->env);
    }

    public function render(RenderRequest $request): string
    {
        return $this->prepare($request)->render();
    }

    public function renderTwice(RenderRequest $request): RepeatResult
    {
        return new RepeatResult($this->render($request), $this->render($request));
    }

    /**
     * The prepared render of a request. It is no operation of the contract, whose operations are the public methods
     * that check-showcase-contract compares with the manifest; the benchmark of the prepared mode of php.php binds a
     * closure to the class to call it.
     */
    private function prepare(RenderRequest $request): PreparedRender
    {
        $define = [];
        foreach ($request->define->entries() as [$id, $entry]) {
            if (!$entry instanceof DefineEntry) {
                throw new RuntimeException('define.' . $id . ' has an invalid entry');
            }
            if ($entry->template === null) {
                $define[$id] = ['html' => $entry->html];
                continue;
            }
            $define[$id] = ['template' => $entry->template];
            if ($entry->data !== null) {
                $define[$id]['data'] = $entry->data;
            }
        }
        $options = ['define' => $define];
        if ($request->env !== null) {
            $options['env'] = Output::environment($request);
        }

        return $this->engine->prepare($request->target, $request->assign, $options);
    }
}
