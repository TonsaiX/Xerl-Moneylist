const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} = require('discord.js');
const config = require('./config');
const { initDatabase } = require('./lib/db');
const { registerCommands } = require('./registerCommands');
const { handleInteractionCreate } = require('./handlers/interactionCreate');
const { handlePendingProofMessage } = require('./handlers/messageCreate');

const app = express();
app.get('/', (_req, res) => res.send('OK'));
const server = app.listen(config.port, () => {
  console.log(`HTTP server listening on port ${config.port}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteractionCreate(client, interaction);
  } catch (error) {
    console.error('Unhandled InteractionCreate error:', error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handlePendingProofMessage(client, message);
  } catch (error) {
    console.error('Unhandled MessageCreate error:', error);
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

(async () => {
  try {
    if (!config.token || !config.clientId || !config.databaseUrl) {
      throw new Error('Missing required env: DISCORD_TOKEN, DISCORD_CLIENT_ID, DATABASE_URL');
    }

    await initDatabase();
    console.log('Database initialized');

    await registerCommands();
    await client.login(config.token);
  } catch (error) {
    console.error('Startup error:', error);
    server.close(() => process.exit(1));
  }
})();
