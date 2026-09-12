<section class="report">
<h1>{= report.title | upper}</h1>
<p class="generated">{= date(now(), 'Y-m-d H:i:s P')}</p>
<table>
{@ entry = report.entries}
<tr>
  <td>{= entry.name | truncate(12)}</td>
  <td>{= entry.amount | number(2)}</td>
  <td>{= entry.count | number}</td>
  <td>{= date(entry.at, 'Y-m-d')}</td>
  <td>{= date(entry.at, 'D, j M Y H:i')}</td>
  <td><a href="/search?q={= entry.name | url}&amp;kind={= entry.kind | url}">link</a></td>
  <td>{= entry.tags | join(', ')}</td>
  <td>{= entry.name | replace('-', ' ') | trim}</td>
  <td>{= slice(entry.tags, 0, 2) | join('/')}</td>
</tr>
{/}
</table>
<script type="application/json" id="state">{= json(report)}</script>
<p class="sum">{= report.total | number(2, '.', ' ')}</p>
<p class="keys">{= keys(report.index) | join(',')}</p>
<p class="sorted">{= sort(report.names) | join(',')}</p>
</section>
