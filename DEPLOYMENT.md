# Corkboard Pro Deployment Guide

This guide covers various deployment options for Corkboard Pro, from local development to production hosting.

## 🚀 Quick Deploy Options

### Railway (Recommended)

Railway provides the easiest deployment with automatic builds and scaling.

1. **Connect Repository**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login and deploy
   railway login
   railway up
   ```

2. **Environment Variables**
   ```bash
   NODE_ENV=production
   PORT=$PORT  # Automatically set by Railway
   ```

3. **Domain Setup**
   - Railway provides a subdomain automatically
   - Add custom domain in Railway dashboard
   - SSL certificates are managed automatically

### Vercel

Perfect for frontend-focused deployments with serverless functions.

1. **Deploy**
   ```bash
   npm install -g vercel
   vercel --prod
   ```

2. **Configuration** (`vercel.json`)
   ```json
   {
     "version": 2,
     "builds": [
       { "src": "server.js", "use": "@vercel/node" }
     ],
     "routes": [
       { "src": "/(.*)", "dest": "/server.js" }
     ],
     "env": {
       "NODE_ENV": "production"
     }
   }
   ```

### Heroku

Traditional PaaS with extensive addon ecosystem.

1. **Setup**
   ```bash
   # Install Heroku CLI
   heroku create your-app-name
   git push heroku main
   ```

2. **Procfile**
   ```
   web: npm start
   ```

3. **Environment Variables**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set SESSION_SECRET=your-secret-key
   ```

## 🐳 Docker Deployment

### Local Docker

1. **Build Image**
   ```bash
   docker build -t corkboard-pro .
   ```

2. **Run Container**
   ```bash
   docker run -d \
     --name corkboard-pro \
     -p 3000:3000 \
     -v $(pwd)/uploads:/app/uploads \
     -v $(pwd)/data:/app/data \
     corkboard-pro
   ```

### Docker Compose

```yaml
version: '3.8'

services:
  corkboard:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./uploads:/app/uploads
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DATABASE_URL=./data/corkboard.db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - corkboard
    restart: unless-stopped
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: corkboard-pro
spec:
  replicas: 3
  selector:
    matchLabels:
      app: corkboard-pro
  template:
    metadata:
      labels:
        app: corkboard-pro
    spec:
      containers:
      - name: corkboard-pro
        image: your-registry/corkboard-pro:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          value: "/data/corkboard.db"
        volumeMounts:
        - name: uploads
          mountPath: /app/uploads
        - name: data
          mountPath: /app/data
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: uploads
        persistentVolumeClaim:
          claimName: corkboard-uploads
      - name: data
        persistentVolumeClaim:
          claimName: corkboard-data
---
apiVersion: v1
kind: Service
metadata:
  name: corkboard-service
spec:
  selector:
    app: corkboard-pro
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

## 🔧 Server Configuration

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private must-revalidate;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # WebSocket Support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static Files
    location /uploads/ {
        alias /app/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Main Application
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### Apache Virtual Host

```apache
<VirtualHost *:443>
    ServerName your-domain.com
    DocumentRoot /var/www/corkboard

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/your-domain.crt
    SSLCertificateKeyFile /etc/ssl/private/your-domain.key

    # Proxy Configuration
    ProxyPreserveHost On
    ProxyRequests Off
    
    # WebSocket Support
    ProxyPass /socket.io/ ws://localhost:3000/socket.io/
    ProxyPassReverse /socket.io/ ws://localhost:3000/socket.io/
    
    # Main Application
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/corkboard_error.log
    CustomLog ${APACHE_LOG_DIR}/corkboard_access.log combined
</VirtualHost>
```

## 🗄️ Database Options

### SQLite (Default)

Perfect for small to medium deployments.

```javascript
// Configuration
const dbPath = process.env.DATABASE_URL || './corkboard.db';
const db = new sqlite3.Database(dbPath);

// Backup script
const backup = require('sqlite3-backup');
backup({
  source: './corkboard.db',
  destination: `./backups/corkboard-${Date.now()}.db`
});
```

### PostgreSQL

For larger deployments requiring advanced features.

```javascript
// Install: npm install pg
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Migration script
const createTables = `
  CREATE TABLE IF NOT EXISTS boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#8b6914',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
`;
```

### MongoDB

NoSQL option for flexible schema requirements.

```javascript
// Install: npm install mongodb
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URL);

const collections = {
  boards: client.db('corkboard').collection('boards'),
  cards: client.db('corkboard').collection('cards')
};
```

## 📊 Monitoring & Logging

### Health Checks

The application includes built-in health monitoring:

```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version,
    memory: process.memoryUsage(),
    database: db ? 'connected' : 'disconnected'
  });
});
```

### Logging with Winston

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'corkboard-pro' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### Prometheus Metrics

```javascript
const promClient = require('prom-client');

// Create metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new promClient.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections'
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

## 🔐 Security Configuration

### Environment Variables

```bash
# Required
NODE_ENV=production
PORT=3000

# Security
SESSION_SECRET=your-256-bit-secret-key
JWT_SECRET=another-secret-key
CORS_ORIGIN=https://yourdomain.com

# Database
DATABASE_URL=./corkboard.db

# File Upload
MAX_FILE_SIZE=5242880
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/gif,application/pdf

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# HTTPS
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

### SSL/TLS Configuration

```javascript
const https = require('https');
const fs = require('fs');

if (process.env.NODE_ENV === 'production' && process.env.SSL_CERT_PATH) {
  const options = {
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH)
  };
  
  https.createServer(options, app).listen(443, () => {
    console.log('HTTPS Server running on port 443');
  });
}
```

## 📈 Performance Optimization

### Caching Strategy

```javascript
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

// Cache middleware
const cache = (duration) => {
  return async (req, res, next) => {
    const key = req.originalUrl;
    const cached = await client.get(key);
    
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    res.sendResponse = res.json;
    res.json = (body) => {
      client.setex(key, duration, JSON.stringify(body));
      res.sendResponse(body);
    };
    
    next();
  };
};

// Use caching
app.get('/api/boards', cache(300), getBoardsHandler);
```

### CDN Configuration

```javascript
// Static file serving with CDN headers
app.use('/static', express.static('public', {
  maxAge: '1y',
  etag: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'public, immutable');
  }
}));
```

## 🔄 CI/CD Pipeline

### GitHub Actions

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Build application
      run: npm run build
    
    - name: Deploy to Railway
      uses: railwayapp/railway-deploy-action@v1
      with:
        railway_token: ${{ secrets.RAILWAY_TOKEN }}
        service: corkboard-pro
```

### GitLab CI

```yaml
stages:
  - test
  - build
  - deploy

variables:
  NODE_ENV: production

test:
  stage: test
  image: node:18-alpine
  script:
    - npm ci
    - npm test
  only:
    - branches

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main

deploy:
  stage: deploy
  image: alpine:latest
  script:
    - apk add --no-cache curl
    - curl -X POST $WEBHOOK_URL
  only:
    - main
```

## 🚨 Troubleshooting

### Common Deployment Issues

1. **Port Already in Use**
   ```bash
   # Find process using port
   lsof -i :3000
   
   # Kill process
   kill -9 <PID>
   ```

2. **Database Connection Issues**
   ```bash
   # Check file permissions
   ls -la corkboard.db
   
   # Fix permissions
   chmod 644 corkboard.db
   ```

3. **File Upload Problems**
   ```bash
   # Check uploads directory
   mkdir -p uploads
   chmod 755 uploads
   ```

4. **Memory Issues**
   ```javascript
   // Monitor memory usage
   setInterval(() => {
     const used = process.memoryUsage();
     console.log(`Memory usage: ${Math.round(used.heapUsed / 1024 / 1024)} MB`);
   }, 30000);
   ```

### Log Analysis

```bash
# View recent logs
tail -f combined.log

# Search for errors
grep -i error combined.log

# Count requests by status
awk '{print $9}' access.log | sort | uniq -c

# Find slow requests
awk '$10 > 1000 {print $0}' access.log
```

## 📋 Deployment Checklist

### Pre-deployment
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] Backup strategy implemented
- [ ] Monitoring setup
- [ ] Load testing completed

### Post-deployment
- [ ] Health check passing
- [ ] WebSocket connections working
- [ ] File uploads functional
- [ ] Real-time features operational
- [ ] Performance metrics normal
- [ ] Error rates acceptable
- [ ] Backup verification

### Security Checklist
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Input validation active
- [ ] File type restrictions
- [ ] CORS properly configured
- [ ] Secrets management setup

---

For additional deployment support, check the main [README.md](README.md) or open an issue on GitHub.