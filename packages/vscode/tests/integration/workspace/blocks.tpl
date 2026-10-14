<ul>
{@ item = items}
  <li class="{? item.active}on{:}off{/}">{= item.name}</li>
{:}
  <li>none</li>
{/}
</ul>
