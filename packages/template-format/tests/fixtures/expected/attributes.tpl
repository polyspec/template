<tr id="post-{= post.id}"{? post.id == highlight} class="new"{/}>
  <button class="chip{? sort == 'title'} current{/}" hy-set='sort="title"'>Title</button>
  <button hy-set="large={? large}false{:}true{/}">Size</button>
  <a href="/board?page={= n}"{? n == page} class="current"{/}>{= n}</a>
</tr>
