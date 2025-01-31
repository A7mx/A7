const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// 🔹 Set your Discord text channel ID (for tracking messages)
const TEXT_CHANNEL_ID = "1328094647938973768"; 
let lastSentMessageId = null;
const usersInVoice = {};

// ✅ Fetch the latest bot message (Fixes errors)
async function fetchLatestMessage() {
    try {
        const channel = await client.channels.fetch(TEXT_CHANNEL_ID);
        if (!channel) return console.error("⚠️ Channel not found!");

        const messages = await channel.messages.fetch({ limit: 10 });
        for (const message of messages.values()) {
            if (message.author.id === client.user.id) {
                lastSentMessageId = message.id;
                return parseMessageData(message.content);
            }
        }
    } catch (error) {
        console.error("⚠️ Error fetching message:", error);
    }
    return {};
}

// ✅ Convert normal text into a data object
function parseMessageData(content) {
    const lines = content.split("\n");
    let data = {};

    for (let line of lines) {
        const match = line.match(/^🆔 (\d+) - (.+): Total Time: (\d+)h (\d+)m, Today: (\d+)h (\d+)m$/);
        if (match) {
            const userId = match[1];
            const username = match[2];
            const totalHours = parseInt(match[3]);
            const totalMinutes = parseInt(match[4]);
            const todayHours = parseInt(match[5]);
            const todayMinutes = parseInt(match[6]);

            data[userId] = {
                username,
                total_time: totalHours * 3600 + totalMinutes * 60,
                history: {
                    [new Date().toISOString().split("T")[0]]: todayHours * 3600 + todayMinutes * 60
                }
            };
        }
    }
    return data;
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
            { name: `🆔 ${user.username}`, value: `🕒 **Total:** ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m\n📅 **Today:** ${Math.floor(todaySeconds / 3600)}h ${Math.floor((todaySeconds % 3600) / 60)}m`, inline: false }
        ]);
    }
    return embed;
}

// ✅ Send or update a message in the Discord text channel
async function updateDiscordChannel(userData) {
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
    let userData = await fetchLatestMessage();

    const userId = newState.member.id;
    const username = newState.member.user.username;
    const today = new Date().toISOString().split("T")[0];

    if (!userData[userId]) {
        userData[userId] = { username, total_time: 0, history: {} };
    }

    // 🎤 User joins voice (Start timer)
    if (newState.channel && !usersInVoice[userId]) {
        usersInVoice[userId] = Date.now();
        console.log(`🎤 ${username} joined ${newState.channel.name}`);
    }

    // 🚪 User leaves voice (Stop timer and update time)
    if (!newState.channel && usersInVoice[userId]) {
        const timeSpent = (Date.now() - usersInVoice[userId]) / 1000; 
        delete usersInVoice[userId]; 

        if (timeSpent > 10) { // Ignore if user left instantly
            userData[userId].total_time += timeSpent;
            userData[userId].history[today] = (userData[userId].history[today] || 0) + timeSpent;

            console.log(`🚪 ${username} left voice channel. Time added: ${Math.floor(timeSpent / 60)} min`);
            await updateDiscordChannel(userData);
        }
    }
});

// ✅ Handle Button Clicks
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    let userData = await fetchLatestMessage();
    const userId = interaction.user.id;

    if (interaction.customId === "alltime") {
        if (!userData[userId]) return interaction.reply({ content: `❌ No data found for ${interaction.user.username}.`, ephemeral: true });
        const totalSeconds = userData[userId].total_time || 0;
        interaction.reply({ content: `🕒 **${interaction.user.username}'s Total Voice Time:** ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`, ephemeral: true });
    }

    if (interaction.customId === "checkweek") {
        let report = `📅 **${interaction.user.username}'s Weekly Voice Time:**\n`;
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const day = date.toISOString().split("T")[0];
            report += `📆 **${day}:** ${Math.floor((userData[userId]?.history[day] || 0) / 3600)}h\n`;
        }
        interaction.reply({ content: report, ephemeral: true });
    }

    if (interaction.customId === "search") {
        interaction.reply({ content: "🔍 Mention a user with `!alltime @username` to check their stats.", ephemeral: true });
    }
});

// ✅ Start Bot
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await fetchLatestMessage();
    await updateDiscordChannel(await fetchLatestMessage());
});

client.login(process.env.DISCORD_BOT_TOKEN);
