# Release Cycle & Versioning

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs. This ensures a consistent history and automates the release process via GitHub Actions.

## When to create a Changeset?

You should create a changeset for **every pull request** or **significant change** that should be reflected in the release notes.

- **Bug fixes**: Patch release.
- **New features**: Minor release.
- **Breaking changes**: Major release.

## How to create a Changeset?

1. Run the following command in your terminal:
   ```bash
   npx changeset
   ```
2. Select the type of change (patch, minor, or major) using the arrow keys and spacebar.
3. Provide a concise description of the change. This description will appear in the `CHANGELOG.md`.
4. Commit the generated `.changeset/*.md` file along with your code changes.

## Automated Release Process

The project is configured with two GitHub Actions:
1.  **Version Packages** (`version-packages.yml`): Automatically creates/updates a Pull Request with the version bump and `CHANGELOG.md` updates whenever changesets are found on `main`.
2.  **Release** (`release.yml`): Triggers when the "Version Packages" PR is merged (which creates a `v*` tag) to build and publish the release.

### Workflow:

1.  **Develop**: Run `npx changeset` and commit the fragments.
2.  **Versioning**: Merge your changes to `main`. A "Version Packages" PR will be automatically opened/updated by GitHub Actions.
3.  **Release**: When you are ready to release, **merge the "Version Packages" PR**. 
    - The action will automatically create the `vX.Y.Z` tag.
    - The `release.yml` will then build the project, create a ZIP, and publish a GitHub Release.

## History

The full history of changes can be found in [CHANGELOG.md](../CHANGELOG.md).
