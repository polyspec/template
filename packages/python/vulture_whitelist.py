"""The code of the package that vulture reports as unused although a consumer of the code uses it.

A name stands bare and an attribute or method stands as an attribute of `_`, as vulture reads a whitelist.
"""

# unittest discovers the TestCase classes of tests/test_*.py by their base class and runs their test_* methods.
TokenClasses
Parsing
Expressions
Functions
ValuesAndErrors
CommandLine
CompilerInterface
JoinTokens
Fixtures
Format
SameTree
Indentation
HtmlError
SafetyInvariant
FunctionContract
ObjectCalls
Loading
Concurrency
BoundData
ArtifactRuntime
ArtifactStore
LevelAbsence
RequestPath
Utf8Length
PublicSource
PublicAnalysis

# unittest runs the test method that the constructor of a case of tests/cases.py names, run_case, and of a vector of
# tests/test_expr_fixtures.py, run_vector, and reads shortDescription of a test for its report.
_.run_case
_.run_vector
_.shortDescription

# unittest calls load_tests of a test module to build its suite (the load_tests protocol).
load_tests

# The templates of tests/test_object_calls.py read the field label of the host object and call its method
# status_label; the method _private is the one that a template must not reach.
_.label
_.status_label
_._private
