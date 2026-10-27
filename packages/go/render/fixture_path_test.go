package render

import "testing"

// The vector runner must discover its input after moving between module packages.
func TestExpressionFixtureDiscovery(t *testing.T) {
	cases := expressionFixtures(t)
	if len(cases) == 0 {
		t.Fatal("the expression fixture has no vectors")
	}
	seen := make(map[string]bool)
	for _, item := range cases {
		if item.Name == "" || seen[item.Name] {
			t.Fatalf("empty or repeated vector name %q", item.Name)
		}
		seen[item.Name] = true
	}
}
