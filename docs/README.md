

- [Overview](#overview)
	- [Background](#background)
- [Usage](#usage)
- [Bug Reports and Feature Requests](#bug-reports-and-feature-requests)
- [Appendix](#appendix)
	- [Feature Comparison](#feature-comparison)

# Overview

This extension provides a `git mv` operation using a native file save dialog.  
When a file is moved, any editors referring to the original path are reopened with the new file path.

## Background

VSCode's built-in `Git: Rename` command performs a `git mv` under the hood and automatically updates open editors. However, it does not support directory name completion, nor does it allow creating new folders, making it unsuitable for moving files across directories.

On the other hand, running `git mv` from a terminal allows for tab completion, reducing the risk of mistyped paths. But this leaves VSCode with editors pointing to deleted files, and still requires a manual `mkdir` if the destination folder doesn't exist.

This extension solves both issues by allowing `git mv` operations through the file save dialog.
This provides:

- directory browsing and creation  
- error-free path selection using a native UI  
- automatic reopening of all affected editors with the new file path

As a result, it prevents mistakes like editing and saving an old buffer after a file rename.

# Usage

1. Focus the editor of the file you'd like to move with `git mv`
2. Open the Command Palette and type `git mv`
3. Select `git mv: with file save dialog`
4. Choose a destination file name from the save dialog


# Bug Reports and Feature Requests

If you encounter any bugs or have any suggestions, please let us know by [submitting an issue on our GitHub page](https://github.com/tettekete/vscode-git-mv-with-save-dialog-extension/issues).


# Appendix

## Feature Comparison

|                      | `git mv` (CLI) | `Git: Rename` (VSCode) | `git mv: with save dialog` (this extension) |
|----------------------|:-------------:|:----------------------:|:-------------------------------------------:|
| Updates open editors |       ❌       |           ✅           |                     ✅                      |
| Create directories   |       ❌       |           ❌           |                     ✅                      |
| Move across folders  |      ✅[^1]     |        ⚠️[^2]         |                     ✅                      |

[^1]: Practical if you're comfortable with the CLI  
[^2]: Tab completion is not supported in the input field, making it error-prone
