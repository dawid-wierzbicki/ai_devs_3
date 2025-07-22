# 🚀 Webhook Deployment Guide

## Quick Options (Recommended for Testing)

### 1. 🔧 ngrok (Easiest)
```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/download

# Run your webhook locally
npm run dev:hosted-webhook

# In a new terminal
ngrok http 3000
# Copy the https URL (e.g., https://abc123.ngrok.io)
```

### 2. 🌐 Cloudflare Tunnel (Free)
```bash
# Install cloudflared
brew install cloudflared  # macOS

# Run your webhook locally
npm run dev:hosted-webhook

# In a new terminal
cloudflared tunnel --url http://localhost:3000
# Copy the generated URL
```

### 3. 📦 localtunnel (npm)
```bash
# Install globally
npm install -g localtunnel

# Run your webhook locally
npm run dev:hosted-webhook

# In a new terminal
lt --port 3000 --subdomain your-webhook-name
# Use: https://your-webhook-name.loca.lt
```

## Cloud Deployment Options

### 4. 🚂 Railway (Easy Cloud)
1. Go to [railway.app](https://railway.app)
2. Connect your GitHub repo
3. Add environment variables: `GEMINI_API_KEY`, `CENTRALA_API_KEY`
4. Deploy automatically

### 5. ⚡ Vercel (Serverless)
```bash
# Install Vercel CLI
npm i -g vercel

# From webhook directory
cd s04/e04_hosted_webhook
vercel

# Add environment variables in Vercel dashboard
```

### 6. 🐳 Docker (Any Cloud)
```bash
# Build image
docker build -t webhook-pilot .

# Run locally
docker run -p 3000:3000 --env-file .env webhook-pilot

# Deploy to any cloud (AWS, GCP, DigitalOcean, etc.)
```

### 7. 🔥 Heroku (Classic)
```bash
# Install Heroku CLI and login
heroku create your-webhook-name

# Set environment variables
heroku config:set GEMINI_API_KEY=your_key
heroku config:set CENTRALA_API_KEY=your_key

# Deploy
git push heroku main
```

## Testing Your Webhook

Once deployed, test with:
```bash
curl -X POST https://your-webhook-url.com \
  -H "Content-Type: application/json" \
  -d '{"instruction":"polecialem jedno pole w prawo i jedno w dol"}'

# Should return: {"description":"wiatrak"}
```

## Environment Variables Needed

- `GEMINI_API_KEY`: Your Google Gemini API key
- `CENTRALA_API_KEY`: Your Centrala API key
- `PORT`: (Optional) Port number (defaults to 3000)

## 💡 Recommendation

For **quick testing**: Use **ngrok** or **Cloudflare Tunnel**
For **production**: Use **Railway** or **Vercel** 