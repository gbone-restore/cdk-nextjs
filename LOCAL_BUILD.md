# Local Build Instructions for cdk-nextjs

This document outlines the steps to build and package cdk-nextjs locally.

## Prerequisites

- Node.js and pnpm installed
- All dependencies installed (`pnpm install`)

## Build Steps

### 1. Clean Previous Builds (Optional)

```bash
pnpm clobber
```

This removes all generated files and build artifacts. Note: This command will skip if you have uncommitted changes.

### 2. Build the Project

```bash
pnpm build
```

This command:
- Compiles TypeScript code to JavaScript in the `lib/` directory
- Bundles Lambda functions
- Runs jsii to generate construct library artifacts
- Generates API documentation
- Runs tests and linting
- Creates the initial package

**Note**: The build process may reset the version in `package.json` to "0.0.0".

### 3. Fix Version Number (if needed)

If the version was reset to "0.0.0", manually edit `package.json` to restore the correct version:

```json
"version": "0.3.9-alpha.1",
```

### 4. Create the Package Tarball

```bash
pnpm pack
```

This creates the final `.tgz` file with the correct version number (e.g., `cdk-nextjs-0.3.9-alpha.1.tgz`).

## Alternative Commands

- `pnpm package` - Runs the package task from projen (may require CI environment)
- `pnpm bundle` - Only bundles the Lambda functions without full build

## Build Outputs

- `lib/` - Compiled TypeScript files
- `dist/` - jsii artifacts
- `assets/` - Bundled Lambda functions
- `*.tgz` - NPM package tarballs

## Troubleshooting

1. **Build timeout**: The build process can take several minutes. If it times out, check if the artifacts were created and proceed with packaging.

2. **Version reset**: Always verify the version in `package.json` before running `pnpm pack`.

3. **Missing artifacts**: If the `.tgz` file isn't created, ensure all build steps completed successfully by checking the `lib/` and `dist/` directories.