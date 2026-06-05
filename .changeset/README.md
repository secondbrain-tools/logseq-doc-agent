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

The project is configured with a local script and a GitHub Action:

1.  **Local Release Script**: `npm run release` - Use this to version, tag, and push in one go.
2.  **GitHub Release Action** (`release.yml`): Triggers automatically when you push stable tags starting with `v*`.

### Workflow:

1.  **Develop**: Run `npx changeset` and commit the fragments.
2.  **Release**: When you are ready to publish, run:
    ```bash
    npm run release
    ```
    This script will:
    - Update `package.json` and `CHANGELOG.md` (via `changeset version`).
    - Commit the changes.
    - Create a local `vX.Y.Z` tag.
    - **Push** everything to GitHub.
3.  **Action**: The GitHub Action will detect the new tag, build the project, and create the GitHub Release.

## History

The full history of changes can be found in [CHANGELOG.md](../CHANGELOG.md).
