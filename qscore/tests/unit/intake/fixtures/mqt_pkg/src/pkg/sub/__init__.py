"""Benchmarks subpackage; its __init__ must run before the module (ChP-0037 fixture)."""

from pkg import INITIALISED

assert INITIALISED
