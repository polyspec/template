<?php

declare(strict_types=1);

namespace Polyspec\Template\Format;

/**
 * The `format` command of the conformance command line (CNF-4): `format FILE [--indent none|tab|N] [--delimiters OC]`.
 *
 * It prints the formatted text without adding a newline and returns 0, prints a format error as the JSON
 * {"reason","code","line","col","message"} on standard error and returns 2, and returns 1 on a usage error.
 */
final class FormatCommand
{
    public const USAGE = 'format FILE [--indent none|tab|N] [--delimiters OC]';

    /**
     * @param list<string> $arguments FILE and the options
     * @param resource $stdout
     * @param resource $stderr
     */
    public static function run(string $program, array $arguments, Analyzer $analyzer, $stdout, $stderr): int
    {
        $usage = static function (string $message) use ($program, $stderr): int {
            fwrite($stderr, "{$program}: {$message}\nusage: {$program} " . self::USAGE . "\n");

            return 1;
        };
        $file = $arguments[0] ?? null;
        if ($file === null) {
            return $usage('FILE is required');
        }
        $options = ['name' => $file];
        $rest = array_slice($arguments, 1);
        for ($index = 0; $index < count($rest); $index += 2) {
            $flag = $rest[$index];
            $value = $rest[$index + 1] ?? null;
            if ($flag === '--indent') {
                if ($value === 'none') {
                    $options['indent'] = null;
                } elseif ($value === 'tab') {
                    $options['indent'] = "\t";
                } elseif ($value !== null && preg_match('/^[1-8]$/D', $value) === 1) {
                    $options['indent'] = str_repeat(' ', (int) $value);
                } else {
                    return $usage('--indent requires a number from 1 to 8, tab or none');
                }
            } elseif ($flag === '--delimiters') {
                if ($value === null || mb_strlen($value, 'UTF-8') !== 2) {
                    return $usage('--delimiters requires two characters');
                }
                $options['delimiters'] = $value;
            } else {
                return $usage("unknown option {$flag}");
            }
        }
        $source = is_file($file) ? file_get_contents($file) : false;
        if ($source === false) {
            return $usage("cannot read {$file}");
        }
        $result = Formatter::format($source, $options, $analyzer);
        if ($result->error !== null) {
            fwrite($stderr, json_encode($result->error->toArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));

            return 2;
        }
        fwrite($stdout, (string) $result->text);

        return 0;
    }
}
