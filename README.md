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

### test curl to leaderboard

bash

```
curl -X POST "http://localhost:3000/api/data" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User 1",
    "level": 3,
    "functionDetails": {
      "geradeausBewegen": 5,
      "linksDrehen": 2,
      "rechtsDrehen": 1,
      "if": 1,
      "while": 0
    },
    "totalFunctions": 9,
    "completionTimeMs": 123456,
    "completionTimeFormatted": "00:02:03",
    "timestamp": "12:34:56"
  }'
```

powershell

```
$body = @{
  name = "Test User 2"
  level = 4
  functionDetails = @{
    geradeausBewegen = 7
    linksDrehen = 3
    rechtsDrehen = 2
    if = 0
    while = 1
  }
  totalFunctions = 13
  completionTimeMs = 98765
  completionTimeFormatted = "00:01:38"
  timestamp = "14:22:10"
} | ConvertTo-Json

curl.exe -X POST "http://localhost:3000/api/data" `
  -H "Content-Type: application/json" `
  -d $body
```
