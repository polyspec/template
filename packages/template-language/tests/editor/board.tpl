{* The posts of the board, newest first *}
{:t = messages.board}
<div class="board-list">
<h2>{= t["list.heading"]}</h2>
{? length(posts) == 0}
<p>{= t["list.empty"]}</p>
{:? filter}
<p class="filtered">{= filter | escape}</p>
{:}
<ul>
{@ post = posts}
<li><a href="{= post.href}"{? post.id == highlight} class="new"{/}>{= post.title}</a></li>
{/}
</ul>
{/}
{+ parts/pager.tpl}
</div>
