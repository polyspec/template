<article>
<h1>{= page.title}</h1>
{@ section = page.sections}
<section id="{= section.id}">
<h2>{= section.heading}</h2>
{@ paragraph = section.paragraphs}
<p>{= paragraph}</p>
{/}
</section>
{:}
<p class="empty">No sections.</p>
{/}
</article>
