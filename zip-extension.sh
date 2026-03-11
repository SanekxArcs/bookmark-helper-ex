#!/bin/bash

# Extract version from manifest.json
VERSION=$(grep '"version":' manifest.json | cut -d'"' -f4)
FILE_NAME="bookmark-helper-v${VERSION}.zip"

echo "📦 Bundling version ${VERSION}..."

# Check if tar is available
if command -v tar >/dev/null 2>&1; then
    tar -caf "$FILE_NAME" \
        --exclude=".git*" \
        --exclude="node_modules" \
        --exclude="README.md" \
        --exclude="*.zip" \
        --exclude="*.crx" \
        --exclude="zip-extension.sh" \
        --exclude="bookmark-helper-ex" \
        *
    echo "✅ Created $FILE_NAME"
else
    echo "❌ Error: 'tar' not found. Please install zip or tar."
    exit 1
fi
