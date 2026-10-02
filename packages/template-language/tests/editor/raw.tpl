<!-- {{?# head}} -->
<head>{# head "parts/head.tpl" title}</head>
<!-- {{/}} -->
<body>
<pre>
  {= code}
</pre>
<script>
  const data = {= json(data) | raw};
</script>
</body>
