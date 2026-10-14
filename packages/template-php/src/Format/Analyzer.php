<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

use Polyspec\Template\TemplateError;

/**
 * The parser that the formatter reads: one implementation of the specification, such as the parser of this package
 * or the native parser of the PHP extension.
 */
interface Analyzer
{
    /**
     * Parses a template source and returns its AST, the accepted tags and the EDT-8 tokens of their parts, with UTF-8
     * byte offsets after a leading byte order mark.
     *
     * @param array{delimiters?: string} $options
     * @return array{ast: array<string, mixed>, tags: list<array{start: int, end: int, kind: string, bodyStart: int, bodyEnd: int}>, tokens: list<array{start: int, end: int, kind: string}>}
     * @throws TemplateError when the source does not parse
     * @throws \InvalidArgumentException when the delimiters option is not a delimiter pair
     */
    public function analyze(string $source, string $name, array $options): array;

    /**
     * Parses a template source and returns its AST.
     *
     * @param array{delimiters?: string} $options
     * @return array<string, mixed>
     * @throws TemplateError when the source does not parse
     */
    public function parse(string $source, string $name, array $options): array;
}
