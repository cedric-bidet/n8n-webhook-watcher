#!/usr/bin/env node

/**
 * n8n Workflow Webhook Watcher
 * 
 * An open-source utility that watches n8n PostgreSQL database for workflow changes
 * and triggers webhooks when workflows are created, updated, or deleted.
 * 
 * @author Your Name
 * @license MIT
 */

const { Client } = require('pg');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

class N8nWebhookWatcher {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 10;
    this.reconnectDelay = parseInt(process.env.RECONNECT_DELAY) || 5000;
  }

  async setupDatabaseTrigger() {
    try {
      console.log('🔧 Setting up database trigger...');

      // Create the notification function
      const createFunctionQuery = `
        CREATE OR REPLACE FUNCTION notify_workflow_change() 
        RETURNS TRIGGER AS $$
        BEGIN
          PERFORM pg_notify('workflow_changed', 
            json_build_object(
              'action', TG_OP,
              'workflow_id', COALESCE(NEW.id, OLD.id),
              'workflow_name', COALESCE(NEW.name, OLD.name),
              'active', COALESCE(NEW.active, OLD.active),
              'updated_at', COALESCE(NEW."updatedAt", OLD."updatedAt"),
              'timestamp', NOW()
            )::text
          );
          RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
      `;

      await this.client.query(createFunctionQuery);

      // Drop existing trigger if it exists
      const dropTriggerQuery = `
        DROP TRIGGER IF EXISTS n8n_workflow_change_trigger ON workflow_entity;
      `;
      
      await this.client.query(dropTriggerQuery);

      // Create the trigger
      const createTriggerQuery = `
        CREATE TRIGGER n8n_workflow_change_trigger
          AFTER INSERT OR UPDATE OR DELETE ON workflow_entity
          FOR EACH ROW EXECUTE FUNCTION notify_workflow_change();
      `;

      await this.client.query(createTriggerQuery);
      
      console.log('✅ Database trigger created successfully');
    } catch (error) {
      console.error('❌ Error setting up database trigger:', error.message);
      throw error;
    }
  }

  async connect() {
    try {
      console.log('🔗 Connecting to PostgreSQL database...');
      
      this.client = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      });

      await this.client.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      console.log('✅ Connected to database successfully');
      
      // Setup database trigger
      await this.setupDatabaseTrigger();
      
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async startListening() {
    try {
      console.log('👂 Starting to listen for workflow changes...');
      
      // Start listening for notifications
      await this.client.query('LISTEN workflow_changed');
      
      // Set up notification handler
      this.client.on('notification', async (msg) => {
        if (msg.channel === 'workflow_changed') {
          await this.handleWorkflowChange(msg.payload);
        }
      });

      // Handle connection errors
      this.client.on('error', async (err) => {
        console.error('❌ Database connection error:', err.message);
        this.isConnected = false;
        await this.handleReconnection();
      });

      // Handle connection end
      this.client.on('end', async () => {
        console.log('⚠️  Database connection ended');
        this.isConnected = false;
        await this.handleReconnection();
      });

      console.log('🚀 Webhook watcher is running and listening for changes...');
      console.log(`📡 Webhook URL: ${process.env.WEBHOOK_URL}`);
      console.log('Press Ctrl+C to stop');
      
    } catch (error) {
      console.error('❌ Error starting listener:', error.message);
      throw error;
    }
  }

  async handleWorkflowChange(payload) {
    try {
      const data = JSON.parse(payload);
      
      console.log(`📝 Workflow ${data.action}: ${data.workflow_name} (ID: ${data.workflow_id})`);
      
      // Prepare webhook payload
      const webhookPayload = {
        action: data.action.toLowerCase(),
        workflow: {
          id: data.workflow_id,
          name: data.workflow_name,
          active: data.active,
          updated_at: data.updated_at
        },
        timestamp: data.timestamp,
        source: 'n8n-webhook-watcher'
      };

      // Add custom headers if specified
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n-webhook-watcher/1.0.0'
      };

      if (process.env.WEBHOOK_AUTH_HEADER && process.env.WEBHOOK_AUTH_VALUE) {
        headers[process.env.WEBHOOK_AUTH_HEADER] = process.env.WEBHOOK_AUTH_VALUE;
      }

      // Send webhook
      const response = await axios.post(process.env.WEBHOOK_URL, webhookPayload, {
        headers,
        timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000
      });

      console.log(`✅ Webhook sent successfully (Status: ${response.status})`);
      
      if (process.env.DEBUG === 'true') {
        console.log('📤 Webhook payload:', JSON.stringify(webhookPayload, null, 2));
      }

    } catch (error) {
      console.error('❌ Error handling workflow change:', error.message);
      
      if (error.response) {
        console.error(`   HTTP Status: ${error.response.status}`);
        console.error(`   Response: ${error.response.data}`);
      }
    }
  }

  async handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached. Exiting...');
      process.exit(1);
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    
    try {
      await this.connect();
      await this.startListening();
    } catch (error) {
      console.error('❌ Reconnection failed:', error.message);
      await this.handleReconnection();
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.client && this.isConnected) {
      try {
        await this.client.query('UNLISTEN workflow_changed');
        await this.client.end();
        console.log('✅ Database connection closed');
      } catch (error) {
        console.error('❌ Error during cleanup:', error.message);
      }
    }
  }

  async start() {
    try {
      console.log('🚀 Starting n8n Webhook Watcher...');
      console.log('═'.repeat(50));
      
      await this.connect();
      await this.startListening();
      
    } catch (error) {
      console.error('❌ Failed to start watcher:', error.message);
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
function setupGracefulShutdown(watcher) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      console.log(`\n📡 Received ${signal} signal`);
      await watcher.cleanup();
      process.exit(0);
    });
  });
}

// Check .env file and validate configuration
function checkEnvironmentSetup() {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  // Check if .env file exists
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    
    if (fs.existsSync(envExamplePath)) {
      console.error('💡 Found .env.example file. Please copy it to .env and configure your settings:');
      console.error('   cp .env.example .env');
    } else {
      console.error('💡 Please create a .env file with the following variables:');
      console.error(`
# Required variables:
DB_HOST=your_postgres_host
DB_PORT=5432
DB_NAME=your_n8n_database
DB_USER=your_db_user
DB_PASSWORD=your_db_password
WEBHOOK_URL=https://your-webhook-endpoint.com/workflow-changed

# Optional variables:
DB_SSL=false
WEBHOOK_TIMEOUT=10000
MAX_RECONNECT_ATTEMPTS=10
RECONNECT_DELAY=5000
DEBUG=false
      `);
    }
    
    process.exit(1);
  }

  // Load and validate environment variables
  dotenv.config({ path: envPath });
  
  const requiredVars = [
    'DB_HOST',
    'DB_PORT', 
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'WEBHOOK_URL'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName] || process.env[varName].trim() === '');
  const hasDefaults = requiredVars.filter(varName => {
    const value = process.env[varName];
    return value && (
      value.includes('your_') ||
      value.includes('localhost') && varName !== 'DB_HOST' ||
      value.includes('your-webhook-endpoint.com') ||
      value === 'n8n_user' ||
      value === 'your_password'
    );
  });

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables in .env file:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease configure these variables in your .env file.');
    process.exit(1);
  }

  if (hasDefaults.length > 0) {
    console.error('⚠️  Found default/placeholder values in .env file:');
    hasDefaults.forEach(varName => {
      console.error(`   - ${varName}=${process.env[varName]}`);
    });
    console.error('\nPlease update these values with your actual configuration.');
    process.exit(1);
  }

  // Validate URL format
  try {
    new URL(process.env.WEBHOOK_URL);
  } catch (error) {
    console.error('❌ Invalid WEBHOOK_URL format. Please provide a valid URL.');
    process.exit(1);
  }

  // Validate numeric values
  const numericVars = ['DB_PORT', 'WEBHOOK_TIMEOUT', 'MAX_RECONNECT_ATTEMPTS', 'RECONNECT_DELAY'];
  const invalidNumeric = numericVars.filter(varName => {
    const value = process.env[varName];
    return value && isNaN(parseInt(value));
  });

  if (invalidNumeric.length > 0) {
    console.error('❌ Invalid numeric values in .env file:');
    invalidNumeric.forEach(varName => {
      console.error(`   - ${varName}=${process.env[varName]} (should be a number)`);
    });
    process.exit(1);
  }

  console.log('✅ Environment configuration validated successfully');
}

// Main execution
if (require.main === module) {
  checkEnvironmentSetup();
  
  const watcher = new N8nWebhookWatcher();
  setupGracefulShutdown(watcher);
  watcher.start();
}

module.exports = N8nWebhookWatcher;