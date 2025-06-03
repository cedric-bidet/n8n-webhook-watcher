# n8n Webhook Watcher

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)

A lightweight, open-source utility that watches your n8n PostgreSQL database for workflow changes and triggers webhooks in real-time when workflows are created, updated, or deleted.

## 🚀 Features

- **Real-time monitoring** of n8n workflow changes
- **Configurable webhooks** with custom payloads
- **Automatic reconnection** on database connection loss
- **Environment-based configuration** via `.env` file
- **Graceful shutdown** with proper cleanup
- **Authentication support** for webhook endpoints
- **Debug mode** for troubleshooting
- **Production-ready** with error handling and logging

## 📋 Prerequisites

- Node.js >= 14.0.0
- PostgreSQL database (n8n instance)
- Access to n8n's PostgreSQL database

## 🛠️ Installation

### Option 1: Clone and Install

```bash
git clone https://github.com/yourusername/n8n-webhook-watcher.git
cd n8n-webhook-watcher
npm install
```

### Option 2: Global Installation (coming soon)

```bash
npm install -g n8n-webhook-watcher
```

## ⚙️ Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:

```env
# PostgreSQL Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=n8n
DB_USER=n8n_user
DB_PASSWORD=your_password
DB_SSL=false

# Webhook Configuration
WEBHOOK_URL=https://your-webhook-endpoint.com/workflow-changed
WEBHOOK_TIMEOUT=10000

# Optional: Authentication
WEBHOOK_AUTH_HEADER=Authorization
WEBHOOK_AUTH_VALUE=Bearer your-token

# Optional: Reconnection Settings
MAX_RECONNECT_ATTEMPTS=10
RECONNECT_DELAY=5000

# Optional: Debug Mode
DEBUG=false
```

### Configuration Options

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DB_HOST` | ✅ | PostgreSQL host | - |
| `DB_PORT` | ✅ | PostgreSQL port | - |
| `DB_NAME` | ✅ | n8n database name | - |
| `DB_USER` | ✅ | Database username | - |
| `DB_PASSWORD` | ✅ | Database password | - |
| `DB_SSL` | ❌ | Enable SSL connection | `false` |
| `WEBHOOK_URL` | ✅ | Your webhook endpoint URL | - |
| `WEBHOOK_TIMEOUT` | ❌ | Webhook timeout in ms | `10000` |
| `WEBHOOK_AUTH_HEADER` | ❌ | Authentication header name | - |
| `WEBHOOK_AUTH_VALUE` | ❌ | Authentication header value | - |
| `MAX_RECONNECT_ATTEMPTS` | ❌ | Max reconnection attempts | `10` |
| `RECONNECT_DELAY` | ❌ | Delay between reconnects (ms) | `5000` |
| `DEBUG` | ❌ | Enable debug logging | `false` |

## 🏃‍♂️ Usage

### Start the watcher

```bash
npm start
```

### Run in development mode

```bash
npm run dev
```

### Run as a service

You can use PM2 or systemd to run the watcher as a service:

```bash
# Using PM2
pm2 start index.js --name "n8n-webhook-watcher"

# Using systemd (create a service file)
sudo systemctl enable n8n-webhook-watcher
sudo systemctl start n8n-webhook-watcher
```

## 📡 Webhook Payload

When a workflow change is detected, the following payload is sent to your webhook URL:

```json
{
  "action": "insert|update|delete",
  "workflow": {
    "id": "workflow-uuid",
    "name": "My Workflow",
    "active": true,
    "updated_at": "2025-06-03T10:30:00.000Z"
  },
  "timestamp": "2025-06-03T10:30:00.000Z",
  "source": "n8n-webhook-watcher"
}
```

### Webhook Actions

- `insert`: New workflow created
- `update`: Existing workflow modified
- `delete`: Workflow deleted

## 🔧 How it Works

1. **Database Trigger**: Creates a PostgreSQL trigger on the `workflow_entity` table
2. **LISTEN/NOTIFY**: Uses PostgreSQL's LISTEN/NOTIFY mechanism for real-time events
3. **Webhook Dispatch**: Sends HTTP POST requests to your configured endpoint
4. **Auto-Reconnection**: Automatically reconnects if the database connection is lost

## 🐳 Docker Usage

Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  n8n-webhook-watcher:
    build: .
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=n8n
      - DB_USER=n8n
      - DB_PASSWORD=your_password
      - WEBHOOK_URL=https://your-webhook.com/endpoint
    depends_on:
      - postgres
    restart: unless-stopped
```

## 📊 Logging

The watcher provides comprehensive logging:

- ✅ Successful operations
- ❌ Errors and failures  
- 🔄 Reconnection attempts
- 📝 Workflow changes
- 📤 Webhook dispatches

Enable debug mode (`DEBUG=true`) for detailed payload logging.

## 🛡️ Security Considerations

- Use environment variables for sensitive data
- Enable SSL for database connections in production
- Secure your webhook endpoint with authentication
- Consider firewall rules for database access
- Use strong database passwords

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [n8n](https://n8n.io/) - The workflow automation platform
- [PostgreSQL](https://www.postgresql.org/) - The database system
- [Node.js](https://nodejs.org/) - The runtime environment

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/yourusername/n8n-webhook-watcher/issues) page
2. Create a new issue with detailed information
3. Join the discussion in existing issues

---

Made with ❤️ for the n8n community