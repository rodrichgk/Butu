#!/usr/bin/env bash
# Build script for LG webOS

echo "Building standalone React frontend for webOS..."
npm run build

echo "Packaging webOS app using ares-package (webOS CLI)..."
# Ensure you have 'appinfo.json' prepared in dist/ or explicitly inject it
echo "ares-package ./dist -o ./webos_build"

echo "Done. The output will be an .ipk file ready for deployment via ares-install."
