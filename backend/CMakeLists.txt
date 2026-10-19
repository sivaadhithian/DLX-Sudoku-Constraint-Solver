cmake_minimum_required(VERSION 3.16)
project(dlx_sudoku_solver LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Always put binaries in build/bin, even with multi-config generators (MSVC, Xcode).
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
foreach(cfg DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${cfg} ${CMAKE_BINARY_DIR}/bin)
endforeach()

if(MSVC)
  add_compile_options(/W4)
else()
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

add_library(dlx_core STATIC src/dancing_links.cpp src/sudoku_solver.cpp)
target_include_directories(dlx_core PUBLIC include)

add_executable(sudoku_solver src/main.cpp)
target_link_libraries(sudoku_solver PRIVATE dlx_core)

enable_testing()
add_executable(test_sudoku ../tests/test_sudoku.cpp)
target_link_libraries(test_sudoku PRIVATE dlx_core)
target_compile_definitions(test_sudoku PRIVATE
  TEST_CASES_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../tests/test_cases.txt")
add_test(NAME sudoku_tests COMMAND test_sudoku)
