const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const express = require("express");
require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 10000;

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// 🔹 Set your Discord text channel IDs
const TEXT_CHANNEL_ID = "1328094647938973768"; // For tracking messages
const DATABASE_CHANNEL_ID = "1334150400143523872"; // For storing data
let lastSentMessageId = null;
const usersInVoice = {};

// ✅ Fetch or initialize user data from the database channel
async function fetchUserData() {
    try {
        const channel = await client.channels.fetch(DATABASE_CHANNEL_ID);
        if (!channel) return console.error("⚠️ Database channel not found!");

        const messages = await channel.messages.fetch({ limit: 1 });
        if (messages.size === 0) {
            // No messages in the database channel, create a new one
            const sentMessage = await channel.send("```json\n{}\n```");
            return {};
        }

        const latestMessage = messages.first();
        const content = latestMessage.content.trim();
        if (content.startsWith("```json") && content.endsWith("```")) {
            const jsonContent = content.slice(7, -3).trim();
            return JSON.parse(jsonContent);
        }
    } catch (error) {
        console.error("⚠️ Error fetching user data:", error);
    }
    return {};
}

// ✅ Save user data to the database channel
async function saveUserData(userData) {
    try {
        const channel = await client.channels.fetch(DATABASE_CHANNEL_ID);
        if (!channel) return console.error("⚠️ Database channel not found!");

        const messages = await channel.messages.fetch({ limit: 1 });
        const jsonContent = "```json\n" + JSON.stringify(userData, null, 2) + "\n```";

        if (messages.size === 0) {
            // No messages in the database channel, create a new one
            await channel.send(jsonContent);
        } else {
            const latestMessage = messages.first();
            await latestMessage.edit(jsonContent);
        }
        console.log("✅ Saved user data to the database channel.");
    } catch (error) {
        console.error("⚠️ Error saving user data:", error);
    }
}

// ✅ Format data into a Discord embed
function formatDataEmbed(userData) {
    let embed = new EmbedBuilder()
        .setTitle("📢 **Voice Activity Tracking**")
        .setColor("#0099ff")
        .setFooter({ text: "🔄 This message auto-updates with real-time data" });
    for (const userId in userData) {
        const user = userData[userId];
        const totalSeconds = user.total_time;
        const today = new Date().toISOString().split("T")[0];
        const todaySeconds = user.history[today] || 0;
        embed.addFields([
            {
                name: `🆔 ${user.username}`,
                value: `🕒 **Total:** ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m ${totalSeconds % 60}s\n📅 **Today:** ${Math.floor(todaySeconds / 3600)}h ${Math.floor((todaySeconds % 3600) / 60)}m ${todaySeconds % 60}s`,
                inline: false,
            },
        ]);
    }
    return embed;
}

// ✅ Send or update a message in the Discord text channel
async function updateDiscordChannel() {
    const userData = await fetchUserData();
    const channel = await client.channels.fetch(TEXT_CHANNEL_ID);
    if (!channel) return console.error("⚠️ Channel not found!");
    let embed = formatDataEmbed(userData);
    let buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("alltime").setLabel("📊 Check Total Time").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("checkweek").setLabel("📅 Weekly Stats").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("search").setLabel("🔍 Search User").setStyle(ButtonStyle.Success)
    );
    try {
        if (lastSentMessageId) {
            const lastMessage = await channel.messages.fetch(lastSentMessageId);
            await lastMessage.edit({ embeds: [embed], components: [buttons] });
            console.log("✅ Updated existing message.");
        } else {
            const sentMessage = await channel.send({ embeds: [embed], components: [buttons] });
            lastSentMessageId = sentMessage.id;
            console.log("✅ Sent new message.");
        }
    } catch (error) {
        console.error("⚠️ Error sending message:", error);
        lastSentMessageId = null;
    }
}

// ✅ Track users joining/leaving voice channels
client.on("voiceStateUpdate", async (oldState, newState) => {
    const userId = newState.member?.id || oldState.member?.id;
    const username = newState.member?.user?.username || oldState.member?.user?.username;
    if (!userId || !username) return;

    let userData = await fetchUserData();

    // 🎤 User joins voice (Start timer)
    if (newState.channel && !usersInVoice[userId]) {
        usersInVoice[userId] = Date.now();
        console.log(`🎤 ${username} joined ${newState.channel.name}`);
    }

    // 🚪 User leaves voice (Stop timer and update time)
    if ((!newState.channel && oldState.channel) && usersInVoice[userId]) {
        const timeSpent = (Date.now() - usersInVoice[userId]) / 1000;
        delete usersInVoice[userId];
        if (timeSpent > 10) {
            // Ignore if user left instantly
            if (!userData[userId]) {
                userData[userId] = {
                    username,
                    total_time: 0,
                    history: {},
                };
            }
            const today = new Date().toISOString().split("T")[0];
            userData[userId].total_time += timeSpent;
            userData[userId].history[today] = (userData[userId].history[today] || 0) + timeSpent;
            await saveUserData(userData);
            console.log(`🚪 ${username} left voice channel. Time added: ${Math.floor(timeSpent / 60)} min`);
            await updateDiscordChannel();
        }
    }
});

// ✅ Handle Button Clicks
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    const userData = await fetchUserData();
    const userId = interaction.user.id;
    if (interaction.customId === "alltime") {
        if (!userData[userId])
            return interaction.reply({
                content: `❌ No data found for ${interaction.user.username}.`,
                ephemeral: true,
            });
        const totalSeconds = userData[userId].total_time || 0;
        interaction.reply({
            content: `🕒 **${interaction.user.username}'s Total Voice Time:** ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m ${totalSeconds % 60}s`,
            ephemeral: true,
        });
    }
    if (interaction.customId === "checkweek") {
        let report = `📅 **${interaction.user.username}'s Weekly Voice Time:**\n`;
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const day = date.toISOString().split("T")[0];
            report += `📆 **${day}:** ${Math.floor((userData[userId]?.history[day] || 0) / 3600)}h ${Math.floor(((userData[userId]?.history[day] || 0) % 3600) / 60)}m ${(userData[userId]?.history[day] || 0) % 60}s\n`;
        }
        interaction.reply({ content: report, ephemeral: true });
    }
    if (interaction.customId === "search") {
        interaction.reply({
            content: "🔍 Mention a user with `!alltime @username` to check their stats.",
            ephemeral: true,
        });
    }
});

// ✅ Handle Commands (e.g., !alltime @username)
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!alltime")) return;

    const args = message.content.split(" ");
    if (args.length < 2) {
        return message.reply("❌ Usage: `!alltime @username`");
    }

    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
        return message.reply("❌ Please mention a valid user.");
    }

    const userData = await fetchUserData();
    const userId = mentionedUser.id;
    if (!userData[userId]) {
        return message.reply(`❌ No data found for ${mentionedUser.username}.`);
    }

    const totalSeconds = userData[userId].total_time || 0;
    message.reply(
        `🕒 **${mentionedUser.username}'s Total Voice Time:** ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m ${totalSeconds % 60}s`
    );
});

// ✅ Start Bot
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await updateDiscordChannel();
});

// ✅ Dummy Express server to satisfy Render's port requirement
app.get("/", (req, res) => {
    res.send("Bot is running!");
});

app.listen(PORT, () => {
    console.log(`🌐 Server is running on port ${PORT}`);
});

// Log in to Discord
client.login(process.env.DISCORD_BOT_TOKEN);
