<table class="rows">
<thead>
<tr><th>#</th><th>Name</th><th>Owner</th><th>State</th><th>Note</th></tr>
</thead>
<tbody>
{@ row = rows}
<tr class="row{? row.first_} first{/}{? row.last_} last{/}" data-index="{= row.index_}">
  <td class="index">{= row.index_ + 1}/{= row.size_}</td>
  <td class="name">{= row.name}</td>
  <td class="owner">{= row.owner}</td>
  <td class="state {= row.state}">{? row.state == 'open'}Open{:? row.state == 'held'}Held{:}Closed{/}</td>
  <td class="note">{= row.note}</td>
</tr>
{:}
<tr class="empty"><td colspan="5">No rows.</td></tr>
{/}
</tbody>
</table>
