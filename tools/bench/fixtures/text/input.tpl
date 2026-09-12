<!DOCTYPE html>
<html lang="{= site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{= page.title}</title>
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/layout.css">
</head>
<body class="page">
<header class="masthead">
  <a class="brand" href="/">{= site.name}</a>
  <nav class="primary">
    <a href="/docs">Documentation</a>
    <a href="/guide">Guide</a>
    <a href="/support">Support</a>
  </nav>
</header>
<main class="content">
  <article>
    <h1>{= page.title}</h1>
    <p class="lead">{= page.lead}</p>
    <p>The specification defines the lexical rules, the tag grammar, the expression language,
    the data model, the built-in functions, the runtime, the abstract syntax tree, the errors
    and the conformance suite. Each document carries rule identifiers that the fixtures cite.</p>
    <p>An implementation reads a template source, produces an abstract syntax tree and renders
    that tree against render data. The output is a string. The engine does not write to the
    render data and does not execute host code from a template.</p>
    <h2>Rules</h2>
    <p>A tag starts at an open delimiter that is followed by horizontal whitespace and a sigil,
    or by an identifier and an assignment operator. Every other open delimiter is text. After a
    tag has started, a syntax error in its body ends the parse.</p>
    <p>A line that holds only tags and whitespace is removed from the output. An echo tag never
    makes a line standalone. A tag that spans several lines forms a group with every line it
    covers.</p>
    <h2>Values</h2>
    <p>A value is null, a boolean, a number, a string, a list or a map. A map preserves the
    insertion order of its entries. A number is an IEEE 754 double and converts to text with the
    shortest representation that round-trips.</p>
    <p>The echo tag writes a safe string as it is. Every other value is converted to text and
    escaped by replacing the five characters that matter in HTML.</p>
    <h2>Composition</h2>
    <p>An include renders a template in the scope of the including template. A block renders a
    registry entry in an isolated context built from the render data, the entry data and the
    scope arguments of the tag.</p>
    <footer class="article-footer">
      <p>Updated {= page.updated}.</p>
    </footer>
  </article>
</main>
<footer class="site-footer">
  <p>{= site.name} &copy; {= site.year}</p>
  <p><a href="/legal">Legal</a> · <a href="/privacy">Privacy</a></p>
</footer>
</body>
</html>
