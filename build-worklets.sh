#!/bin/bash

rm -rf public/worklets

./node_modules/.bin/esbuild "src/worklets/**/*.worklet.ts" \
  --bundle \
  --format=esm \
  --platform=browser \
  --target=es2020 \
  --outdir=public/worklets \
  --entry-names=[name] \
  --tsconfig=tsconfig.worklets.json \
  --sourcemap \
  --minify