# Munkey: Database Service

Subproject for the background service which manages access to the PouchDB database, and manages network syncing.

This service runs in the background, and can be started and stopped at any time.
Munkey clients interact with this service through IPC to perform operations.

## Setting Up


### Step 1: Package Local Dependencies

**PRE-1.0 DISCLAIMER:** While it's understood that this is a tedious, verbose way to keep our dependencies up-to-date, this is only a temporary workaround.
A better dependency resolution process is planned, possibly publishing to a private repo,
but any solutions require the API of our libraries to be stable enough for a v1.0 release.

#### Resolving Dependencies

The following process must be repeated for *every library* listed in the `lib/` folder of the main repo.

0. Ensure that the following build-time tools are installed:

| Dependency | Version |
| ---------- | ------- |
| Python     | 3.0+    |
| Node.js    | v15.0+  |
| NPM        | v7.0+   |

Python is required because all built scripts are implemented as Python scripts.
Bash is garbage -- all my homies hate Bash.

1. From the repository root, `cd` into the library directory.
   Substitute `<library-name>` with the library to package.
```shell
$ cd lib/<library-name>
```
2. Package the dependency to be included.
   The package is built and cleaned up automatically.
```shell
$ npm pack
```

#### TL;DR
(Using `munkey-rpc` as an example)

```shell
# From repository root:
$ cd lib/munkey-rpc
$ npm pack
```

The result of this process is a `.tgz` file in the root of the dependency dir, which is already included by the dependent projects.
Note that this process is not required for the other C# projects, as NuGet's package management is several orders of magnitude more sensible than npm's.

### Step 2:

From this directory, install dependencies (including local dependencies from [Step 1](#Step 1: Package Local Dependencies)), then build the project.
For each local dependency, you'll need to "install" the resulting `.tgz` file.

(Just to reiterate again: this is a *temporary* workaround, and will be updated as soon as the lib APIs are released).

```shell
# For each package:
$ npm install --save --no-audit ../lib/<package-name>/<.tgz-file-from-step-1>
```

Once all local dependencies are resolved, you can build the program. Phew!

```shell
$ npm run build
```

The resulting executable can be found in `bin/`, and can be executed by node.

```shell
$ node bin/munkey.js
```

