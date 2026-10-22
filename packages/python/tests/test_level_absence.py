"""RT-55: the Python library exposes no generated-program class and no source-compiler operation.

The generated programs of the Python target come from the build compiler, so the package keeps none of these names.
"""

import unittest

import polyspec.template as template


class LevelAbsence(unittest.TestCase):
    def test_the_library_exports_no_generated_program_or_source_compiler_operation(
        self,
    ):
        for name in ("GeneratedProgram", "encodeArtifact", "emitArtifact"):
            self.assertFalse(hasattr(template, name), name)
