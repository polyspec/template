<?php

declare(strict_types=1);

// A consumer of the PHP extension: its seven public names must resolve through the stub.

use Polyspec\Template\BoundMap;
use Polyspec\Template\DefineInput;
use Polyspec\Template\Engine;
use Polyspec\Template\Environment;
use Polyspec\Template\FsLoader;

use function Polyspec\Template\bind;
use function Polyspec\Template\merge;

function probe(Environment $environment, DefineInput $input, FsLoader $loader): BoundMap
{
    $engine = new Engine();
    $first = bind('value');

    return merge($first, $first);
}
