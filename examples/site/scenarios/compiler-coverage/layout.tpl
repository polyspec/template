{values = [0, ...numbers]}
{merged = [...lookup, 'z' => 'Z']}
<section>
<h1>{= page.title}</h1>
<p>{= values[1]}|{= merged['z']}</p>
{? flag && page.title == 'Guide'}<strong>matched</strong>{:}<strong>missed</strong>{/}
<p>{= flag ? 'yes' : 'no'}|{= -1 + 3}|{= '' | default('fallback')}</p>
<ul>
{@ row = rows}
<li>{= row.index_}/{= row.size_}:{= row.name}:{= row.first_}:{= row.last_}</li>
{:}
<li>empty</li>
{/}
</ul>
{+ partial.tpl}
{?# content}<p>defined</p>{:}<p>missing</p>{/}
{# content label:page.title}
</section>
