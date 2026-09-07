#!/bin/bash

# Extract version from manifest.json
VERSION=$(grep '"version":' manifest.json | cut -d'"' -f4)
FILE_NAME="bookmark-helper-v${VERSION}.zip"

echo "📦 Bundling version ${VERSION}..."

rm -f "$FILE_NAME"

EXCLUDES=(
    ".git*"
    "node_modules"
    "README.md"
    "*.zip"
    "*.crx"
    "zip-extension.sh"
    "bookmark-helper-ex"
)

is_excluded() {
    local item="$1"
    for pattern in "${EXCLUDES[@]}"; do
        case "$item" in
            $pattern) return 0 ;;
        esac
    done
    return 1
}

if command -v zip >/dev/null 2>&1; then
    ZIP_ARGS=()
    for pattern in "${EXCLUDES[@]}"; do
        ZIP_ARGS+=(-x "$pattern" -x "$pattern/*")
    done
    zip -r -q "$FILE_NAME" . "${ZIP_ARGS[@]}"
    echo "✅ Created $FILE_NAME"
elif command -v powershell.exe >/dev/null 2>&1; then
    # Git Bash's tar can't write real zip files, so stage the included
    # files in a temp folder and let Windows produce a proper zip.
    TMP_DIR=$(mktemp -d)
    for item in *; do
        is_excluded "$item" && continue
        cp -r "$item" "$TMP_DIR/"
    done

    WIN_TMP_DIR=$(cygpath -w "$TMP_DIR")
    WIN_OUT_FILE=$(cygpath -w "$(pwd)/$FILE_NAME")

    powershell.exe -NoProfile -Command \
        "Compress-Archive -Path '${WIN_TMP_DIR}\\*' -DestinationPath '${WIN_OUT_FILE}' -Force"

    rm -rf "$TMP_DIR"
    echo "✅ Created $FILE_NAME"
else
    echo "❌ Error: neither 'zip' nor 'powershell.exe' found. Please install zip."
    exit 1
fi
