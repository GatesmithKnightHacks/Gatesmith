#!/usr/bin/env bash
# Build Qiskit Aer for ROCm (gfx1100 / W7900) on the Radeon Cloud machine (13 §3.2).
#
# EXPERIMENTAL (user directive 2026-10-11, downscaled F2). No fallbacks: any failed step stops.
#
# The PyTorch ROCm image ships the ROCm *runtime* only (no HIP CMake config, no rocThrust/rocPRIM
# headers), so the build uses a self-consistent ROCm SDK installed from AMD's wheel index:
#   python3 -m venv $ROCM_VENV && $ROCM_VENV/bin/pip install \
#     --index-url https://repo.amd.com/rocm/whl/gfx110X-all/ "rocm[devel]==7.13.0"
#   $ROCM_VENV/bin/rocm-sdk init
# Build-time system packages (apt): nlohmann-json3-dev libspdlog-dev libmuparserx-dev libopenblas-dev ninja-build
#
# Usage: build_aer_rocm.sh <qiskit_aer sdist dir>    (writes the wheel to <dir>/dist/)
set -euo pipefail

SRC="${1:?usage: build_aer_rocm.sh <qiskit_aer sdist dir>}"
ROCM_VENV="${ROCM_VENV:-/root/venvs/rocm713}"
AER_ROCM_ARCH="${AER_ROCM_ARCH:-gfx1100}"
JOBS="${JOBS:-$(nproc)}"

[[ -x "$ROCM_VENV/bin/rocm-sdk" ]] || { echo "ERROR: no ROCm SDK venv at $ROCM_VENV (see header)" >&2; exit 1; }
ROCM_PATH="$("$ROCM_VENV/bin/rocm-sdk" path --root)"
[[ -f "$ROCM_PATH/include/thrust/version.h" ]] || { echo "ERROR: rocThrust headers missing under $ROCM_PATH; run rocm-sdk init" >&2; exit 1; }
export ROCM_PATH
export CMAKE_HIP_COMPILER="$ROCM_PATH/llvm/bin/clang++"
export CMAKE_CXX_COMPILER="$CMAKE_HIP_COMPILER"
export DISABLE_CONAN=ON
export QISKIT_AER_PACKAGE_NAME=qiskit-aer-gpu-rocm
export CMAKE_BUILD_PARALLEL_LEVEL="$JOBS"

# With DISABLE_CONAN, Aer calls find_package(Thrust); ROCm ships rocThrust as `rocthrust`
# (target roc::rocthrust). This shim exposes it under the name Aer looks for.
# Aer first asks for Thrust 1.9.5 EXACT, which resets Thrust_DIR, so the shim goes on
# CMAKE_PREFIX_PATH (searched again by the second, version-less find_package).
SHIM_PREFIX="$(mktemp -d)/thrust-shim"
SHIM_DIR="$SHIM_PREFIX/lib/cmake/Thrust"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/ThrustConfig.cmake" <<'CMAKE'
find_package(rocthrust REQUIRED CONFIG)
if(NOT TARGET Thrust)
  add_library(Thrust INTERFACE IMPORTED)
  target_link_libraries(Thrust INTERFACE roc::rocthrust)
endif()
set(Thrust_VERSION ${rocthrust_VERSION})
CMAKE

export CMAKE_PREFIX_PATH="$SHIM_PREFIX:$ROCM_PATH"

echo "ROCm SDK: $ROCM_PATH ($("$ROCM_PATH/bin/hipconfig" --version))"
echo "Arch: $AER_ROCM_ARCH  jobs: $JOBS"

"$ROCM_VENV/bin/pip" install -q "scikit-build>=0.17" "pybind11>2.6" cmake ninja setuptools wheel
cd "$SRC"
# rocPRIM (ROCm >= 7) requires C++17; Aer 0.17.2 pins its extension target to C++14.
# Explicit, checked source patch (recorded in the build log); fails if the line moved.
if grep -q "CXX_STANDARD 14" cmake/FindPybind11.cmake; then
  sed -i 's/CXX_STANDARD 14/CXX_STANDARD 17/' cmake/FindPybind11.cmake
  echo "PATCH: cmake/FindPybind11.cmake CXX_STANDARD 14 -> 17 (rocPRIM requirement)"
elif ! grep -q "CXX_STANDARD 17" cmake/FindPybind11.cmake; then
  echo "ERROR: no CXX_STANDARD line in cmake/FindPybind11.cmake; check the Aer version" >&2
  exit 1
fi
# Aer's src/misc/hipify.hpp defines __shfl_sync/__shfl_xor_sync as macros; HIP 7 declares
# native functions with those names in hip_bf16.h/hip_fp16.h, which then fail to parse when
# included later (via rocPRIM). Include them before the macros (include guards stop a re-parse).
HIPIFY=src/misc/hipify.hpp
if ! grep -q "qscore patch: HIP 7" "$HIPIFY"; then
  grep -q '#include "misc/gpu_static_properties.hpp"' "$HIPIFY" \
    || { echo "ERROR: unexpected $HIPIFY layout; check the Aer version" >&2; exit 1; }
  sed -i 's|#include "misc/gpu_static_properties.hpp"|&\n// qscore patch: HIP 7 declares __shfl_sync natively; parse these before the macros below.\n#include <hip/hip_fp16.h>\n#include <hip/hip_bf16.h>|' "$HIPIFY"
  echo "PATCH: $HIPIFY includes hip_fp16.h/hip_bf16.h before its __shfl_*_sync macros"
fi
# HIP 7 made warpSize a runtime value (no longer constexpr), so Aer's `#define _WS warpSize`
# breaks `__shared__ x[_WS]`. gfx1100 compiles HIP as wave32: use 32 (as Aer does for CUDA)
# and fail the device pass if it is ever compiled as wave64.
GSP=src/misc/gpu_static_properties.hpp
if grep -q "^#define _WS warpSize" "$GSP"; then
  sed -i 's|^#define _WS warpSize|// qscore patch: HIP 7 warpSize is not constexpr; gfx1100 HIP is wave32.\n#if defined(__AMDGCN_WAVEFRONT_SIZE) \&\& __AMDGCN_WAVEFRONT_SIZE != 32\n#error "qscore ROCm build assumes wave32"\n#endif\n#define _WS 32|' "$GSP"
  echo "PATCH: $GSP _WS warpSize -> 32 (wave32 guard)"
elif ! grep -q "qscore patch: HIP 7 warpSize" "$GSP"; then
  echo "ERROR: unexpected $GSP layout; check the Aer version" >&2
  exit 1
fi
rm -rf _skbuild
"$ROCM_VENV/bin/python" setup.py bdist_wheel -- \
  -DAER_THRUST_BACKEND=ROCM -DAER_ROCM_ARCH="$AER_ROCM_ARCH" -DAER_MPI=OFF -DDISABLE_CONAN=ON \
  -DCMAKE_BUILD_TYPE=Release
ls -la dist/*.whl
sha256sum dist/*.whl
