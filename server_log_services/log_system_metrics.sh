#!/bin/bash
# Logs CPU and Memory metrics to JSON

LOG_FILE="/srv/chatpsych/data/server_logs/server_metrics.json"

# Initialize log file if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
    echo "[]" > "$LOG_FILE"
fi

# Collect metrics
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
MEMORY_TOTAL=$(free -m | awk 'NR==2{print $2}')
MEMORY_USED=$(free -m | awk 'NR==2{print $3}')
MEMORY_PERCENT=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | xargs)

# Create JSON entry
JSON_ENTRY=$(jq -n \
    --arg timestamp "$TIMESTAMP" \
    --arg cpu "$CPU_USAGE" \
    --arg mem_total "$MEMORY_TOTAL" \
    --arg mem_used "$MEMORY_USED" \
    --arg mem_percent "$MEMORY_PERCENT" \
    --arg load "$LOAD_AVG" \
    '{
        timestamp: $timestamp,
        cpu_usage_percent: ($cpu | tonumber),
        memory_mb: {
            total: ($mem_total | tonumber),
            used: ($mem_used | tonumber),
            percent: ($mem_percent | tonumber)
        },
        load_average: $load,
        hostname: $ENV.HOSTNAME
    }')

# Append to log file (keep last 10000 entries)
jq --argjson entry "$JSON_ENTRY" '. += [$entry] | if length > 10000 then .[1:] else . end' "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
