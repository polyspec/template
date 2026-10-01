{:l = [1, 2]}{:m = ['k' => 'v']}{= mutate(l, m, items)}{= json(l) | raw}|{= json(m) | raw}|{= json(items) | raw}
