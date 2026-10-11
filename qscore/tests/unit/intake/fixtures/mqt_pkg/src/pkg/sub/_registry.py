"""Registry reached through a relative import, as in MQT Bench's benchmarks package."""

REGISTERED: list[str] = []


def register_benchmark(name):
    def wrap(fn):
        REGISTERED.append(name)
        return fn

    return wrap
