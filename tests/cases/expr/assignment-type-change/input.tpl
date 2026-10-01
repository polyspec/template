{:a = []}{= json(a) | raw}|{:a = ['k' => 1]}{= json(a) | raw}|{:a = 'x'}{= a}|{:b = []}{@ i = range(1, 2)}{:b = ['k' => b]}{/}{= json(b) | raw}|{:c = 1}{? true}{:c = 'y'}{/}{= c}
