const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000; // Prevent Render shutdown

// 🚀 Discord Bot Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// 🔹 Replace with your Discord text channel ID
const TEXT_CHANNEL_ID = "1328094647938973768"; 

let lastSentMessageId = null; // Stores last message ID for updates
const usersInVoice = {}; // Tracks when users join voice channels

// ✅ Function to Fetch Latest Message from Discord Channel (Database)
async function fetchLatestMessage() {
    try {
        const channel = await client.channels.fetch(TEXT_CHANNEL_ID);
        if (!channel) return console.error("⚠️ Discord channel not found!");

        const messages = await channel.messages.fetch({ limit: 10 });
        for (const message of messages.values()) {
            if (message.author.id === client.user.id) {
                lastSentMessageId = message.id;
                const content = message.content.replace(/```json|```/g, "").trim();
                
                try {
                    const parsedData = JSON.parse(content);
                    return parsedData;
                } catch (error) {
                    console.error("⚠️ JSON Parse Error: Message content is invalid JSON.");
                    return {};
                }
            }
        }
    } catch (error) {
        console.error("⚠️ Error fetching message:", error);
    }
    return {}; // Default empty data
}

// ✅ Function to Update or Create the Discord Message
async function updateDiscordChannel(userData) {
    const channel = await client.channels.fetch(TEXT_CHANNEL_ID);
    if (!channel) return console.error("⚠️ Discord channel not found!");

    let formattedText = `📢 **Updated User Data:**\n\`\`\`json\n${JSON.stringify(userData, null, 2)}\n\`\`\``;

    try {
        if (lastSentMessageId) {
            const lastMessage = await channel.messages.fetch(lastSentMessageId);
            await lastMessage.edit(formattedText);
            console.log("✅ Updated existing message.");
        } else {
            const sentMessage = await channel.send(formattedText);
            lastSentMessageId = sentMessage.id;
            console.log("✅ Sent new message.");
        }
    } catch (error) {
        console.error("⚠️ Error sending message:", error);
        lastSentMessageId = null; // Reset message ID if it was deleted
    }
}

// ✅ Event: User Joins/Leaves Voice Channel
client.on("voiceStateUpdate", async (oldState, newState) => {
    let userData = await fetchLatestMessage();

    const userId = newState.member.id;
    const username = newState.member.user.username;
    const today = new Date().toISOString().split("T")[0];

    if (!userData[userId]) {
        userData[userId] = { total_time: 0, history: {} };
    }

    // 🎤 User joins a voice channel (Start tracking)
    if (newState.channel) {
        if (!usersInVoice[userId]) {
            usersInVoice[userId] = Date.now(); // Store join time
            console.log(`🎤 ${username} joined ${newState.channel.name}`);
        }
    }

    // 🚪 User leaves voice channel (Update time)
    if (!newState.channel && usersInVoice[userId]) {
        const timeSpent = (Date.now() - usersInVoice[userId]) / 1000; // Time in seconds
        usersInVoice[userId] = null; // Reset tracking

        userData[userId].total_time += timeSpent;
        userData[userId].history[today] = (userData[userId].history[today] || 0) + timeSpent;

        console.log(`🚪 ${username} left voice channel. Time added: ${Math.floor(timeSpent / 60)} min`);

        await updateDiscordChannel(userData);
    }
});

// ✅ `!alltime` Command: Show User's Total Time
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!") || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    let userData = await fetchLatestMessage();
    
    if (command === "alltime") {
        const user = message.mentions.users.first() || message.author;
        if (!userData[user.id]) return message.reply(`❌ No data found for ${user.username}.`);

        const totalSeconds = userData[user.id].total_time || 0;
        message.channel.send(`🕒 **${user.username}'s Total Voice Time:** ${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`);
    }

    if (command === "checkweek") {
        const user = message.mentions.users.first() || message.author;
        if (!userData[user.id]) return message.reply(`❌ No data found for ${user.username}.`);

        let report = `📅 **${user.username}'s Weekly Voice Time:**\n`;
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const day = date.toISOString().split("T")[0];
            report += `📆 **${day}:** ${Math.floor((userData[user.id].history[day] || 0) / 3600)}h\n`;
        }

        message.channel.send(report);
    }
});

// ✅ Event: Bot is Ready
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await fetchLatestMessage();
    await updateDiscordChannel(await fetchLatestMessage());
});

// ✅ Start a simple Express Web Server (Prevents Render from stopping)
app.get("/", (req, res) => {
    res.send("Bot is running!");
});

app.listen(PORT, () => {
    console.log(`✅ Web server running on port ${PORT}`);
});

// ✅ Start the bot
client.login(process.env.DISCORD_BOT_TOKEN);
