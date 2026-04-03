#!/usr/bin/env bash
# Build script for Samsung Tizen

echo "Building standalone React frontend for Tizen..."
npm run build

echo "Packaging Tizen app using tizen-studio cli..."
# The profile name and certificate should be configured in tizen-studio
# tizen package -t wgt -s <MyProfile> -- dist
echo "tizen package -t wgt -- dist"

echo "Done. The output will be a .wgt file ready for deployment via the Tizen Device Manager."
