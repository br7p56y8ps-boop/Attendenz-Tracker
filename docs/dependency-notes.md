# Dependency notes

## `xlsx`

The project remains pinned to `xlsx@0.18.5` because npm currently reports `0.18.5` as the latest published `xlsx` release. No newer upstream version was available to apply without changing the export library. The dependency is used by the existing spreadsheet export flow and should be revisited if the upstream package publishes a patched release or the export path is migrated to a maintained alternative.
