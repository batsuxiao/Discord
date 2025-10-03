// ライブラリの読み込み
const { Client, GatewayIntentBits, Partials, Collection, Events, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('./db.js'); // データベース接続
require('dotenv').config(); // .envファイルから設定を読み込む

// Botクライアントの作成
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

const REMINDER_CHANNEL_NAME = "今日の予定";

// -------------------- Botのメインロジック --------------------

// Bot起動時の処理
client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag}としてログインしました。`);
  // 1分ごとにリマインダーをチェック
  setInterval(checkReminders, 60 * 1000);
  // 1時間ごとに完了済みタスクをチェック
  setInterval(deleteCompletedTasks, 60 * 60 * 1000);
});


// インタラクション（コマンド、ボタン等）発生時の処理
client.on(Events.InteractionCreate, async interaction => {
  try {
    // スラッシュコマンド
    if (interaction.isChatInputCommand()) {
      handleCommand(interaction);
    }
    // セレクトメニュー
    else if (interaction.isStringSelectMenu()) {
      handleSelectMenu(interaction);
    }
    // モーダル送信
    else if (interaction.isModalSubmit()) {
      handleModalSubmit(interaction);
    }
    // ボタン
    else if (interaction.isButton()) {
      handleButton(interaction);
    }
  } catch (error) {
    console.error('インタラクション処理中にエラーが発生しました:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'コマンドの処理中にエラーが発生しました。', ephemeral: true }).catch(console.error);
    }
  }
});


// -------------------- ハンドラ関数 --------------------

// スラッシュコマンドの処理
async function handleCommand(interaction) {
  if (interaction.commandName === 'create') {
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('category_select')
          .setPlaceholder('タスクのカテゴリを選択してください')
          .addOptions(
            { label: '買い物', emoji: '🛒', value: '買い物' },
            { label: 'すること', emoji: '📝', value: 'すること' },
          ),
      );
    await interaction.reply({ content: 'どのカテゴリのタスクを作成しますか？', components: [row], ephemeral: true });
  }

  if (interaction.commandName === 'list') {
    const categoryMap = { "買い物": "買い物", "すること": "すること" };
    const category = categoryMap[interaction.channel.name];

    if (!category) {
      return interaction.reply({ content: 'このチャンネルはタスクカテゴリに対応していません。', ephemeral: true });
    }

    const getTasksStmt = db.prepare(`
        SELECT content, priority FROM tasks 
        WHERE guild_id = ? AND category = ? AND status = 'incomplete'
        ORDER BY CASE WHEN priority = 0 THEN 99 ELSE priority END ASC
    `);
    const tasks = getTasksStmt.all(interaction.guild.id, category);

    if (tasks.length === 0) {
      const embed = new EmbedBuilder().setTitle(`【${category}】のタスク一覧`).setDescription("現在、未完了のタスクはありません！🎉").setColor('Green');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const priorityMap = { 0: "未設定", 1: "高", 2: "中", 3: "低" };
    const embed = new EmbedBuilder().setTitle(`【${category}】のタスク一覧`).setDescription("優先度順に表示しています。").setColor('Orange');
    tasks.forEach(task => {
      embed.addFields({ name: `優先度: ${priorityMap[task.priority]}`, value: `- ${task.content}`, inline: false });
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// セレクトメニューの処理
async function handleSelectMenu(interaction) {
  if (interaction.customId === 'category_select') {
    const category = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`task_modal_${category}`)
      .setTitle(`【${category}】タスクの詳細`);
    
    const contentInput = new TextInputBuilder().setCustomId('task_content').setLabel("タスクの内容").setStyle(TextInputStyle.Paragraph).setRequired(true);
    const dueDateInput = new TextInputBuilder().setCustomId('task_due_date').setLabel("実行日 (任意: YYYY-MM-DD形式)").setStyle(TextInputStyle.Short).setPlaceholder("例: 2025-12-31").setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(contentInput), new ActionRowBuilder().addComponents(dueDateInput));
    await interaction.showModal(modal);
  }
}

// モーダル送信の処理
async function handleModalSubmit(interaction) {
  const category = interaction.customId.replace('task_modal_', '');
  const content = interaction.fields.getTextInputValue('task_content');
  const dueDateStr = interaction.fields.getTextInputValue('task_due_date');

  let dueDate = null;
  if (dueDateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr) || isNaN(new Date(dueDateStr))) {
        return interaction.reply({ content: 'エラー: 実行日の形式が正しくありません。`YYYY-MM-DD`形式で入力してください。', ephemeral: true });
    }
    dueDate = dueDateStr;
  }
  
  const targetChannel = interaction.guild.channels.cache.find(ch => ch.name === category);
  if (!targetChannel) {
    return interaction.reply({ content: `エラー: #${category} チャンネルが見つかりません。`, ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`新しいタスク: ${category}`)
    .setDescription(content)
    .setColor('Blue')
    .addFields(
      { name: "優先度", value: "未設定", inline: false },
      { name: "ステータス", value: "未完了 🏃", inline: false }
    )
    .setTimestamp();
  
  if (dueDate) {
    embed.addFields({ name: "実行日", value: dueDate, inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('task_complete').setLabel('完了').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('priority_1').setLabel('優先度: 高').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('priority_2').setLabel('優先度: 中').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('priority_3').setLabel('優先度: 低').setStyle(ButtonStyle.Secondary),
  );

  const message = await targetChannel.send({ embeds: [embed], components: [row] });
  
  const insertStmt = db.prepare('INSERT INTO tasks (guild_id, message_id, channel_id, content, category, due_date) VALUES (?, ?, ?, ?, ?, ?)');
  insertStmt.run(interaction.guild.id, message.id, targetChannel.id, content, category, dueDate);

  await interaction.reply({ content: `\`#${category}\` にタスクを作成しました！`, ephemeral: true });
}

// ボタンの処理
async function handleButton(interaction) {
  const { customId, message } = interaction;
  
  if (customId.startsWith('priority_')) {
    const priority = parseInt(customId.split('_')[1], 10);
    const updateStmt = db.prepare('UPDATE tasks SET priority = ? WHERE message_id = ?');
    updateStmt.run(priority, message.id);
  } else if (customId === 'task_complete') {
    const updateStmt = db.prepare("UPDATE tasks SET status = 'complete', completed_at = ? WHERE message_id = ?");
    updateStmt.run(new Date().toISOString(), message.id);
  }
  
  await updateTaskMessage(interaction);
}

// タスクメッセージを更新する共通関数
async function updateTaskMessage(interaction) {
  const { message } = interaction;
  const getTaskStmt = db.prepare('SELECT * FROM tasks WHERE message_id = ?');
  const task = getTaskStmt.get(message.id);

  if (!task) {
    return interaction.update({ content: 'このタスクは削除されたようです。', embeds: [], components: [] });
  }
  
  const priorityMap = { 0: "未設定", 1: "高", 2: "中", 3: "低" };
  const statusMap = { "incomplete": "未完了 🏃", "complete": "完了 ✅" };
  const colorMap = { "incomplete": 'Blue', "complete": 'Green' };

  const newEmbed = new EmbedBuilder()
    .setTitle(`タスク: ${task.category}`)
    .setDescription(task.content)
    .setColor(colorMap[task.status])
    .addFields(
      { name: "優先度", value: priorityMap[task.priority], inline: false },
      { name: "ステータス", value: statusMap[task.status], inline: false }
    )
    .setTimestamp(new Date(message.embeds[0].timestamp));

  if (task.due_date) {
    newEmbed.addFields({ name: "実行日", value: task.due_date, inline: false });
  }
  if (task.status === 'complete') {
    newEmbed.setFooter({ text: 'このタスクは24時間後に自動で削除されます。' });
  }
  
  const isCompleted = task.status === 'complete';
  const newRow = new ActionRowBuilder();
  message.components[0].components.forEach(component => {
    newRow.addComponents(ButtonBuilder.from(component).setDisabled(isCompleted));
  });

  await interaction.update({ embeds: [newEmbed], components: [newRow] });
}


// -------------------- 定期実行タスク --------------------

// リマインダーチェック
function checkReminders() {
    const now = new Date();
    // JST (UTC+9) での現在時刻を取得
    const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

    if (jstNow.getHours() === 7 && jstNow.getMinutes() === 0) {
        const todayStr = jstNow.toISOString().slice(0, 10); // YYYY-MM-DD
        
        const getTasksStmt = db.prepare("SELECT * FROM tasks WHERE due_date = ? AND status = 'incomplete' AND reminded = 0");
        const tasks = getTasksStmt.all(todayStr);

        if (tasks.length === 0) return;

        console.log(`${tasks.length}件のタスクをリマインドします...`);
        const updateRemindedStmt = db.prepare('UPDATE tasks SET reminded = 1 WHERE id = ?');
        
        tasks.forEach(async (task) => {
            const guild = await client.guilds.fetch(task.guild_id).catch(() => null);
            if (!guild) return;
            const channel = guild.channels.cache.find(ch => ch.name === REMINDER_CHANNEL_NAME);
            if (!channel) return;
            
            const embed = new EmbedBuilder()
                .setTitle("今日が実行日のタスクです！")
                .setDescription(`**カテゴリ**: ${task.category}\n**内容**: ${task.content}`)
                .setColor('Gold')
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
            updateRemindedStmt.run(task.id);
        });
    }
}

// 完了済みタスクの削除
function deleteCompletedTasks() {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const getTasksStmt = db.prepare("SELECT * FROM tasks WHERE status = 'complete' AND completed_at <= ?");
    const tasks = getTasksStmt.all(threshold);

    if (tasks.length === 0) return;
    
    console.log(`${tasks.length}件の完了済みタスクを削除します...`);
    const deleteStmt = db.prepare('DELETE FROM tasks WHERE id = ?');

    tasks.forEach(async (task) => {
        try {
            const guild = await client.guilds.fetch(task.guild_id).catch(() => null);
            if (!guild) { deleteStmt.run(task.id); return; }
            const channel = await guild.channels.fetch(task.channel_id).catch(() => null);
            if (!channel) { deleteStmt.run(task.id); return; }
            const message = await channel.messages.fetch(task.message_id).catch(() => null);
            if (message) await message.delete();
        } catch (error) {
            console.error(`メッセージ削除中にエラー: ${error.message}`);
        } finally {
            deleteStmt.run(task.id);
        }
    });
}

// Botにログイン
client.login(process.env.DISCORD_TOKEN);
