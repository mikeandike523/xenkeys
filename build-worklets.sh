#!/bin/bash

./node_modules/.bin/esbuild "src/worklets/**/*.ts" \
  --bundle \
  --format=esm \
  --platform=browser \
  --target=es2020 \
  --outdir=public/worklets \
  --entry-names=[name] \
  --tsconfig=tsconfig.worklets.json \
  --sourcemap \
  --minify