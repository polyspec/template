{total = 0}
{@ item = items}
{subtotal = item.price * item.quantity}
{discount = item.quantity >= 10 ? subtotal * 0.1 : 0}
{total += subtotal - discount}
<li class="{= item.quantity >= 10 ? 'bulk' : 'unit'}{? item.price > 1000} costly{/}">
  <span>{= item.label ?? item.code ?? 'unknown'}</span>
  <span>{= item.quantity} x {= item.price}</span>
  <span>{= subtotal - discount}</span>
  <span>{= item.tags.0 ?: 'none'}</span>
  <span>{= item.code | upper}</span>
  <span>{= item.label | default('-') | lower}</span>
  <span>{= (subtotal > 5000 && item.quantity < 20) || item.code in ready}</span>
  <span>{= item.index_ % 3 == 0 ? 'a' : item.index_ % 3 == 1 ? 'b' : 'c'}</span>
</li>
{/}
<p class="total">{= total}</p>
<p class="count">{= length(items)}</p>
<p class="average">{= length(items) > 0 ? total / length(items) : 0}</p>
