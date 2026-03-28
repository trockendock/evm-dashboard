#!/bin/bash
cd "$(dirname "$0")"
npm install --silent 2>/dev/null
npm run dev
