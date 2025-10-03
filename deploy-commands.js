const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('create')
    .setDescription('新しいタスクを作成します。'),
  new SlashCommandBuilder()
    .setName('list')
    .setDescription('このカテゴリの未完了タスク一覧を表示します。'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('スラッシュコマンドの登録を開始します...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );
    console.log('スラッシュコマンドが正常に登録されました。');
  } catch (error) {
    console.error(error);
  }
})();
