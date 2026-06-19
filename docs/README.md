# Aureon Project Documentation

This directory contains the canonical and historical documentation for the Aureon monolithic platform.

## Directory Structure

To maintain consistency and ease onboarding, the documentation has been organized into the following functional subdirectories:

* **[architecture/](architecture/)**: System structural overviews, DB schemas mappings, security constraints, and domain model inventory charts.
  - [arch.md](architecture/arch.md): System design architecture overview.
  - [CONTEXT.md](architecture/CONTEXT.md): System setup context and initial specs.
  - [schema.md](architecture/schema.md): Database logical schemas mapping.
  - [domain_inventory.md](architecture/domain_inventory.md): Business domains description.
  - [modules.md](architecture/modules.md): Code modularization details.
  - [execution_graph.md](architecture/execution_graph.md): Core data execution graphs.
  - [constraints.md](architecture/constraints.md): Safety, isolation, database, and security constraints.
  - [architecture_optimization_plan.md](architecture/architecture_optimization_plan.md): Long-term canonical optimization roadmap.
  - [backend_implementation_blueprint.md](architecture/backend_implementation_blueprint.md): Design-to-code mapping and service boundaries.
  - [capability_matrix.md](architecture/capability_matrix.md): Master catalog of system domains and feature status.
* **[operations/](operations/)**: Setup protocols and runtime monitoring details.
  - `runbook.md`: Production runbooks and startup checkpoints.
* **[development/](development/)**: Implementation workflows.
  - `tasks.md`: Celery task registries and schedule parameters.
* **[decisions/](decisions/)**: Architectural decisions and layout spec sheets.
  - core layout and screens specifications documents.
* **[archive/](archive/)**: Deprecated sprint plans, older implementation blueprints, migration spreadsheets, and legacy visual screen captures.
