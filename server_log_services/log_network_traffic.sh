#!/bin/bash
# Logs network traffic metrics to JSON

LOG_FILE="/srv/chatpsych/data/server_logs/network_traffic.json"

# Initialize log file if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
    echo "[]" > "$LOG_FILE"
fi

# Collect network metrics
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)

# Get RX/TX bytes
RX_BYTES=$(cat /sys/class/net/$INTERFACE/statistics/rx_bytes)
TX_BYTES=$(cat /sys/class/net/$INTERFACE/statistics/tx_bytes)

# Get connection counts
TCP_CONNECTIONS=$(ss -tan | grep ESTAB | wc -l)
HTTP_CONNECTIONS=$(ss -tan | grep ':80\|:443' | grep ESTAB | wc -l)

# Create JSON entry
JSON_ENTRY=$(jq -n \
    --arg timestamp "$TIMESTAMP" \
    --arg interface "$INTERFACE" \
    --arg rx "$RX_BYTES" \
    --arg tx "$TX_BYTES" \
    --arg tcp "$TCP_CONNECTIONS" \
    --arg http "$HTTP_CONNECTIONS" \
    '{
        timestamp: $timestamp,
        interface: $interface,
        bytes: {
            received: ($rx | tonumber),
            transmitted: ($tx | tonumber)
        },
        connections: {
            tcp_established: ($tcp | tonumber),
            http_https: ($http | tonumber)
        },
        hostname: $ENV.HOSTNAME
    }')

# Append to log file (keep last 10000 entries)
jq --argjson entry "$JSON_ENTRY" '. += [$entry] | if length > 10000 then .[1:] else . end' "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
