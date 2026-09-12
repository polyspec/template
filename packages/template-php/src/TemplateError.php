<?php

declare(strict_types=1);

namespace Polyspec\Template;

/**
 * Error object as defined in docs/spec/errors.md.
 */
final class TemplateError extends \RuntimeException
{
    /**
     * Creates an error from its fields. The names avoid the properties of the base exception.
     */
    public function __construct(
        public readonly string $errorCode,
        public readonly string $template,
        public readonly int $errorLine,
        public readonly int $errorCol,
        public readonly int $offset,
        public readonly int $end,
        string $message,
    ) {
        parent::__construct($message);
    }

    /**
     * Creates an error located at a byte span of a template whose line index is known.
     *
     * @param list<int>|null $lines
     */
    public static function at(string $code, string $template, ?array $lines, int $start, int $end, string $message): self
    {
        if ($lines === null) {
            return new self($code, $template, 0, 0, $start, $end, $message);
        }
        [$line, $col] = Source::position($lines, $start);

        return new self($code, $template, $line, $col, $start, $end, $message);
    }

    /**
     * Creates an error with no source position.
     */
    public static function withoutPosition(string $code, string $template, string $message): self
    {
        return new self($code, $template, 0, 0, 0, 0, $message);
    }

    /**
     * @return array{code: string, template: string, line: int, col: int, offset: int, end: int, message: string}
     */
    public function toArray(): array
    {
        return [
            'code' => $this->errorCode,
            'template' => $this->template,
            'line' => $this->errorLine,
            'col' => $this->errorCol,
            'offset' => $this->offset,
            'end' => $this->end,
            'message' => $this->getMessage(),
        ];
    }
}
