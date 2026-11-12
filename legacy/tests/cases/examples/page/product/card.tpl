<a href="/p/{= product.seq}?ref={= 'list ' + (no + 1) | url}">
<img src="{= product.image ?? links.assets + '/no-image.png'}" alt="{= product.name}">
<strong>{= product.name}</strong>
<span class="price">{= product.price | number}</span>
{? product.tags}<em>{= product.tags | join(', ')}</em>{/}
</a>
