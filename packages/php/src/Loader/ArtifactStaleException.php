<?php

declare(strict_types=1);

namespace Polyspec\Template\Loader;

/**
 * The failure of an artifact that is missing or stale (RT-56): its manifest or one of its files is absent, or a file
 * does not match its digest. It is the one failure that a build fixes, so AstProgram::loadOrRefresh rebuilds on it
 * under "true" and on nothing else.
 */
final class ArtifactStaleException extends \RuntimeException
{
}
