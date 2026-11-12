<!DOCTYPE html>
<html lang="{= meta.lang}">
<head>
{:og_image = meta.og_image ?? links.assets + '/og.png'}
<title>{= title | default(meta.site)}</title>
{+ parts/head.tpl}
</head>
<body>
<script nonce="{= nonce}">
var page = {= json(page) | raw};
$(function () { init({ debug: false }); });
</script>
{?# content}
<main>{# content}</main>
{:}
<main class="empty">No content</main>
{/}
{# parts/footer.tpl links year:date(now(), 'Y')}
</body>
</html>
