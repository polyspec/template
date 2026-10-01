<ul>
{@ item = items | slice(0, 10)}
  <li>{= item.name}{? item.index_ == 0} first{:? item.last_} last{:}{/}</li>
{:}
  <li>none</li>
{/}
</ul>
{:total = 0}{:count++}{:total += item.price * 2}
{+ parts/head.tpl}{+ "a  b.tpl"}
{# head "parts/head.tpl" title no:item.index_}
{?# contents}<main>{# contents}</main>{:}<main class="empty"></main>{/}
{:x = 1}{@ row = rows}{= row}{/}
