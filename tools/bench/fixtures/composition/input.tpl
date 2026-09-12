<!DOCTYPE html>
<html lang="{= site.lang}">
<head>
{+ parts/head.tpl}
</head>
<body>
{# parts/masthead.tpl site}
{?# content}
<main>{# content}</main>
{:}
<main class="empty">No content.</main>
{/}
{# parts/footer.tpl site year:site.year}
</body>
</html>
