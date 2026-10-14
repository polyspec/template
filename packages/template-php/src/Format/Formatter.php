<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

use Polyspec\Template\Source;
use Polyspec\Template\TemplateError;

/**
 * Formatter entry: formats every tag and the indentation of every line, and refuses a result whose AST differs from
 * the source AST.
 */
final class Formatter
{
    private const BOM = "\xEF\xBB\xBF";

    /**
     * Formats the whitespace inside the tags of a template and the indentation of its lines. Other text outside tags,
     * comments and directives are never changed. The source and the result are parsed, and the result is returned
     * only when both ASTs are equal without their `span` fields and, when lines are indented, without the spaces and
     * tabs at the start of lines of text.
     *
     * Options: `name` (the template name of error results, `template.tpl` by default); `delimiters` (two characters,
     * LEX-22); `range` (byte offsets `start` and `end`: only tags that lie completely inside it and lines that start
     * inside it are formatted); `indent` (the indent unit, a run of spaces or one tab, two spaces by default, or null
     * to keep the indentation of every line); `templateBlocks` (`indent` by default: template blocks add a level like
     * HTML elements; `flat`: they add none).
     *
     * @param array{name?: string, delimiters?: string, range?: array{start: int, end: int}, indent?: string|null, templateBlocks?: 'indent'|'flat'} $options
     */
    public static function format(string $source, array $options = [], Analyzer $analyzer = new PackageAnalyzer()): FormatResult
    {
        $indent = array_key_exists('indent', $options) ? $options['indent'] : '  ';
        if ($indent !== null && preg_match('/^(?: +|\t)$/D', $indent) !== 1) {
            throw new \InvalidArgumentException('indent must be a run of spaces or one tab');
        }
        $templateBlocks = $options['templateBlocks'] ?? 'indent';
        if ($templateBlocks !== 'indent' && $templateBlocks !== 'flat') {
            throw new \InvalidArgumentException('templateBlocks must be indent or flat');
        }
        $name = $options['name'] ?? 'template.tpl';
        $bom = str_starts_with($source, self::BOM) ? self::BOM : '';
        $text = substr($source, strlen($bom));
        $parseOptions = isset($options['delimiters']) ? ['delimiters' => $options['delimiters']] : [];
        try {
            $analysis = $analyzer->analyze($text, $name, $parseOptions);
        } catch (TemplateError $error) {
            return FormatResult::error(new FormatError('parse', $error->errorCode, $error->errorLine, $error->errorCol, $error->getMessage()));
        } catch (\InvalidArgumentException $error) {
            return FormatResult::error(new FormatError('parse', null, 0, 0, $error->getMessage()));
        }

        $shift = strlen($bom);
        $range = isset($options['range']) ? ['start' => $options['range']['start'] - $shift, 'end' => $options['range']['end'] - $shift] : null;
        $edits = [];
        foreach ($analysis['tags'] as $tag) {
            if ($tag['kind'] === 'directive') {
                continue;
            }
            if ($range !== null && ($tag['start'] < $range['start'] || $tag['end'] > $range['end'])) {
                continue;
            }
            $tokens = array_values(array_filter($analysis['tokens'], static fn (array $token): bool => $token['start'] >= $tag['bodyStart'] && $token['end'] <= $tag['bodyEnd']));
            $body = Body::format($tag['kind'], $text, $tag['bodyStart'], $tag['bodyEnd'], $tokens);
            if ($body === null || $body === substr($text, $tag['bodyStart'], $tag['bodyEnd'] - $tag['bodyStart'])) {
                continue;
            }
            $edits[] = ['start' => $tag['bodyStart'], 'end' => $tag['bodyEnd'], 'text' => $body];
        }
        if ($indent !== null) {
            $indentation = Indent::edits($text, $analysis['tags'], $indent, $templateBlocks, $range);
            if (isset($indentation['error'])) {
                [$line, $col] = Source::position(Source::lineIndex($text), $indentation['error']['index']);

                return FormatResult::error(new FormatError('html', null, $line, $col, $indentation['error']['message']));
            }
            array_push($edits, ...$indentation['edits']);
            usort($edits, static fn (array $left, array $right): int => $left['start'] <=> $right['start']);
        }
        if ($edits === []) {
            return FormatResult::text($source, false);
        }

        $formatted = self::apply($text, $edits);
        [$line, $col] = Source::position(Source::lineIndex($text), $edits[0]['start']);
        try {
            $after = $analyzer->parse($formatted, $name, $parseOptions);
        } catch (TemplateError $error) {
            return FormatResult::error(new FormatError('invariant', null, $line, $col, 'formatted text does not parse: ' . $error->getMessage()));
        }
        $before = $analysis['ast'];
        $same = $indent === null
            ? Invariant::sameTree($before, $after)
            : Invariant::sameTree(Invariant::withoutLineIndentation($before), Invariant::withoutLineIndentation($after));
        if (!$same) {
            return FormatResult::error(new FormatError('invariant', null, $line, $col, 'formatted text parses to a different AST'));
        }

        return FormatResult::text($bom . $formatted, true);
    }

    /**
     * @param list<array{start: int, end: int, text: string}> $edits
     */
    private static function apply(string $text, array $edits): string
    {
        $output = '';
        $cursor = 0;
        foreach ($edits as $edit) {
            $output .= substr($text, $cursor, $edit['start'] - $cursor) . $edit['text'];
            $cursor = $edit['end'];
        }

        return $output . substr($text, $cursor);
    }
}
