<tr id="post-{= post.id}"{? post.id == highlight} class="new"{/}>
  <td>{= date(post.created_at, 'Y-m-d') | escape}</td>
</tr>
