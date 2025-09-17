### Recommend VsCode extension to edit sqlite

SQLite3 Editor

### intial deployment

fly launch

### with changes deployment for existing

fly deploy

### log

fly logs
OPTIONAL: -i 148e46debd2438

### to create gamedata sql database (only regired for the first time)

fly volumes create gamedata --region fra --size 1

### install fly on machine

windows with winget

Installation
winget install --id Fly-io.flyctl -e

After installation

Verify it works:
flyctl version

Log in:
flyctl auth login

(This opens your browser to authenticate with Fly.io.)

From your project folder:
flyctl launch

(Sets up your fly.toml config and app.)

Deploy:
flyctl deploy
