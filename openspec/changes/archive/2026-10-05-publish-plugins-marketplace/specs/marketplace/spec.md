# Spec Delta

## Purpose

The marketplace is the public distribution point for the plugins in this repository: the manifest Claude Code reads, the identity plugins are installed under, and the guarantees a public reader gets about what the tree contains.

## ADDED Requirements

### Requirement: Marketplace identity
The marketplace manifest at `.claude-plugin/marketplace.json` SHALL be named `plugins` and SHALL name the GitHub account `sufyanMansuriZn` as its owner. The marketplace name SHALL match the repository name, so the install namespace, the GitHub URL and the local directory all read the same.

#### Scenario: Plugin id
- **WHEN** a plugin from this marketplace is installed
- **THEN** its id is `<plugin-name>@plugins`

#### Scenario: Manifest fields
- **WHEN** the manifest is read
- **THEN** `name` is `plugins` and `owner.name` is `sufyanMansuriZn`

### Requirement: Installable from GitHub
The marketplace SHALL be addable with `claude plugin marketplace add sufyanMansuriZn/plugins`, and every plugin listed in the manifest SHALL be installable from it by `<plugin-name>@plugins`.

#### Scenario: Fresh machine
- **WHEN** a user with no prior registration runs `claude plugin marketplace add sufyanMansuriZn/plugins` and then `claude plugin install session-bar@plugins`
- **THEN** both commands succeed and `session-bar` appears in `/plugin` as installed from `plugins`

#### Scenario: Manifest entries resolve
- **WHEN** the manifest lists a plugin with a relative `source`
- **THEN** that path exists in the repository and holds a `.claude-plugin/plugin.json`

### Requirement: README documents the marketplace
The repository root SHALL contain a `README.md` that states what the repository is, gives the two commands to add the marketplace and install a plugin, and lists every plugin in the manifest with a one-line description.

#### Scenario: Plugin listed
- **WHEN** a plugin is present in the manifest
- **THEN** the README names it and describes it in one line

#### Scenario: Install commands present
- **WHEN** a reader opens the README
- **THEN** it shows `claude plugin marketplace add sufyanMansuriZn/plugins` and a `claude plugin install <plugin-name>@plugins` example

### Requirement: No machine-specific or private content
The tracked tree SHALL contain no absolute paths under a user's home directory, no credentials, and no session memory. The `.remember/` directory SHALL be ignored by git.

#### Scenario: Path scan
- **WHEN** the tracked files are searched for `/home/` followed by a username
- **THEN** no match is found

#### Scenario: Session memory stays local
- **WHEN** `.remember/` exists in the working tree and `git add -A` is run
- **THEN** nothing under `.remember/` is staged

### Requirement: No license granted
The repository SHALL NOT contain a LICENSE file. The code is public to read, and all rights are reserved.

#### Scenario: Root listing
- **WHEN** the repository root is listed
- **THEN** no file named `LICENSE`, `LICENSE.md` or `COPYING` is present
