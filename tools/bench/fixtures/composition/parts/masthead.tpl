<header class="masthead">
<a class="brand" href="/">{= site.name}</a>
<nav>
{@ link = site.navigation}
<a href="{= link.href}"{? link.current} class="current"{/}>{= link.label}</a>
{/}
</nav>
</header>
