require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.GUILD_ID || '',
  databaseUrl: process.env.DATABASE_URL,
  port: Number(process.env.PORT || 3000),
};
