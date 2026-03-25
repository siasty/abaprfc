"""
pytest configuration: installs mock_pyrfc as the 'pyrfc' module before
any test imports, so src/py/*.py never tries to load the real SAP library.
"""
import sys
import os

# Make src/py importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../src/py'))

# Install mock before anything else touches pyrfc
sys.path.insert(0, os.path.dirname(__file__))
import mock_pyrfc
sys.modules['pyrfc'] = mock_pyrfc  # type: ignore
