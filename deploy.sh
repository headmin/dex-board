#!/bin/bash
export NVM_DIR="$HOME/.config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 2>/dev/null || nvm use 20
echo "Node: $(node --version)"
npm run deploy "$@"
