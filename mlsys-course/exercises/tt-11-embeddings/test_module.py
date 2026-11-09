"""Runs the module's own unit tests against YOUR implementation in embeddings.py.

Each test_unit_* function from the module becomes one unittest case, so you can watch
them turn green one by one. Run:  python3 -m unittest -v test_module
"""
import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "_deps"))
os.environ.setdefault("MPLBACKEND", "Agg")

MODULE_NAME = "tinytorch.core.embeddings"
TESTS = ['test_unit_embedding_init', 'test_unit_embedding', 'test_unit_embedding_backward', 'test_unit_positional_encoding_init', 'test_unit_positional_encoding', 'test_unit_sinusoidal_table', 'test_unit_sinusoidal_embeddings', 'test_unit_emblayer_init', 'test_unit_complete_embedding_system']


def load_learner_module():
    spec = importlib.util.spec_from_file_location(MODULE_NAME, os.path.join(HERE, "embeddings.py"))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[MODULE_NAME] = mod
    spec.loader.exec_module(mod)
    return mod


try:
    with redirect_stdout(io.StringIO()):
        MOD = load_learner_module()
    LOAD_ERROR = None
except Exception as e:  # a syntax error should read as a failed test, not a crash
    MOD, LOAD_ERROR = None, e


class ModuleTests(unittest.TestCase):
    pass


def make(name):
    def case(self):
        if LOAD_ERROR is not None:
            self.fail("embeddings.py could not be imported: %r" % (LOAD_ERROR,))
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                getattr(MOD, name)()
        except NotImplementedError as e:
            self.fail("%s: a part you still need to write was called (%s)" % (name, e))
        except AssertionError as e:
            self.fail("%s: %s\n%s" % (name, e, buf.getvalue()[-1500:]))
    case.__name__ = name
    return case


for _n in TESTS:
    setattr(ModuleTests, _n, make(_n))

if __name__ == "__main__":
    unittest.main(verbosity=2)
