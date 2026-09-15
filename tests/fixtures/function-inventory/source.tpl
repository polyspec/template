<script>
  const object = { value: javascriptOnly() };
  {=json_encode(payload)}
</script>
<div>{value = wrap("}")}</div>
<div>{=row->label()}</div>
<div>{=\Limepie\dt::format(timestamp, "Y-m-d")}</div>
<div>{=\Limepie\dt\format(timestamp, "Y-m-d")}</div>
<!--{=ignored()}-->
<div onclick="if (confirm('x')) { alert(1); }">{=visible()}</div>
