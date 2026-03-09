const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
for (const file of files) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: commands,
      });
      console.log(`Registered ${commands.length} guild command(s) to ${config.guildId}`);
      return;
    }

    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`Registered ${commands.length} global command(s)`);
  } catch (error) {
    console.error('Register commands failed');
    console.error('clientId:', config.clientId);
    console.error('guildId:', config.guildId || '(global)');
    console.error('code:', error.code);
    console.error('status:', error.status);
    console.error('message:', error.rawError?.message || error.message);
    throw error;
  }
}

module.exports = { registerCommands };
