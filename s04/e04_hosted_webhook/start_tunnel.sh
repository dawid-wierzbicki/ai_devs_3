#!/bin/bash

echo "Starting Cloudflare Tunnel..."
cloudflared tunnel --url http://localhost:3000 2>&1 | tee /tmp/cloudflared_output.log &

# Wait for the URL to appear
sleep 10

# Extract the URL from the log
TUNNEL_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' /tmp/cloudflared_output.log | head -1)

if [ -n "$TUNNEL_URL" ]; then
    echo "🚀 Tunnel URL: $TUNNEL_URL"
    echo "$TUNNEL_URL" > /tmp/tunnel_url.txt
else
    echo "❌ Could not extract tunnel URL"
fi 