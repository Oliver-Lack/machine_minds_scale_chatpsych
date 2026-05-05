#!/bin/bash
# Logs Docker container stats and logs to JSON

APP_LOG_FILE="/srv/chatpsych/data/server_logs/app_container.json"
NGINX_LOG_FILE="/srv/chatpsych/data/server_logs/nginx_proxy.json"

# Initialize log files if they don't exist
for file in "$APP_LOG_FILE" "$NGINX_LOG_FILE"; do
    if [ ! -f "$file" ]; then
        echo "[]" > "$file"
    fi
done

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

# Function to log container stats and recent logs
log_container() {
    local CONTAINER_NAME=$1
    local LOG_FILE=$2
    
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        # Get container stats
        STATS=$(docker stats --no-stream --format "{{json .}}" $CONTAINER_NAME)
        
        # Get last 10 log lines
        RECENT_LOGS=$(docker logs --tail 10 $CONTAINER_NAME 2>&1 | jq -Rs .)
        
        # Get container status
        STATUS=$(docker inspect --format='{{.State.Status}}' $CONTAINER_NAME)
        UPTIME=$(docker inspect --format='{{.State.StartedAt}}' $CONTAINER_NAME)
        
        # Create JSON entry
        JSON_ENTRY=$(echo "$STATS" | jq \
            --arg timestamp "$TIMESTAMP" \
            --arg status "$STATUS" \
            --arg uptime "$UPTIME" \
            --argjson logs "$RECENT_LOGS" \
            '. + {
                timestamp: $timestamp,
                container_status: $status,
                started_at: $uptime,
                recent_logs: $logs
            }')
        
        # Append to log file (keep last 5000 entries)
        jq --argjson entry "$JSON_ENTRY" '. += [$entry] | if length > 5000 then .[1:] else . end' "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
}

# Log app container (adjust container name if different)
log_container "chatpsych-app-1" "$APP_LOG_FILE" || log_container "chatpsych_app_1" "$APP_LOG_FILE"

# Log nginx proxy container
log_container "nginx-proxy" "$NGINX_LOG_FILE"
