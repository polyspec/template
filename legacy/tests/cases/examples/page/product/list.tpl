{:total = length(products)}
<h1>{= category.name | default('All')} <small>{= total | number}</small></h1>
{? total == 0}
<p class="empty">No products.</p>
{:? total > 2}
<p class="notice">Showing first 2 of {= total}.</p>
{/}
<ul class="products">
{@ product = slice(products, 0, 2)}
<li class="product{? product.first_} first{/}{? product.last_} last{/}">
{# card.tpl product no:product.index_}
</li>
{:}
<li class="empty">-</li>
{/}
</ul>
