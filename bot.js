const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Web server to keep Render active
app.get("/", (req, res) => {
    res.send("✅ Discord bot is running!");
});

app.listen(PORT, () => {
    console.log(`✅ Web server running on port ${PORT}`);
});

// Initialize Discord Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ** JSONBin.io API Details **
const DATA_FILE_URL = "https://api.jsonbin.io/v3/b/679c853fad19ca34f8f75ef5";
const JSONBIN_API_KEY = "YOUR_JSONBIN_SECRET_KEY";  // Replace with your JSONBin.io Secret Key

// Fetch Data from JSONBin.io
async function loadUserData() {
    try {
        const response = await axios.get(DATA_FILE_URL, {
            headers: { "X-Master-Key": JSONBIN_API_KEY }
        });
        console.log("📂 Fetched User Data:", response.data.record); // Debugging Log
        return response.data.record || {};
    } catch (error) {
        console.error("⚠️ Error loading user data:", error);
        return {};
    }
}

// Save Data to JSONBin.io
async function saveUserData(userTotalTime) {
    try {
        await axios.put(DATA_FILE_URL, userTotalTime, {
            headers: {
                "X-Master-Key": JSONBIN_API_KEY,
                "Content-Type": "application/json"
            }
        });
        console.log("✅ Data successfully updated in JSONBin.io");
    } catch (error) {
        console.error("⚠️ Error saving user data:", error);
    }
}

// Users currently in voice channels (tracks when they joined)
const usersInVoice = {};

// Ensure user data exists
const ensureUserHistory = (userTotalTime, userId) => {
    if (!userTotalTime[userId] || typeof userTotalTime[userId] !== "object") {
        userTotalTime[userId] = { total_time: 0, history: {} };
    }
};

// ✅ Event: When a user joins or leaves a voice channel
client.on("voiceStateUpdate", async (oldState, newState) => {
    const userId = newState.member.id;
    let userTotalTime = await loadUserData();
    ensureUserHistory(userTotalTime, userId);

    // 🎤 User joins a voice channel
    if (newState.channel) {
        if (!usersInVoice[userId]) {
            usersInVoice[userId] = Date.now(); // Start tracking time
            console.log(`🎤 ${newState.member.displayName} joined ${newState.channel.name}`);
        }
    }

    // 🚪 User leaves all voice channels
    if (!newState.channel) {
        if (usersInVoice[userId]) {
            const timeSpent = (Date.now() - usersInVoice[userId]) / 1000; // Convert to seconds
            const today = new Date().toISOString().split("T")[0];

            // Ensure user history exists
            ensureUserHistory(userTotalTime, userId);
            userTotalTime[userId].total_time += timeSpent;
            userTotalTime[userId].history[today] = (userTotalTime[userId].history[today] || 0) + timeSpent;

            delete usersInVoice[userId]; // Remove from active tracking
            await saveUserData(userTotalTime); // Save updated data
            console.log(`🚪 ${newState.member.displayName} left voice. Time added: ${timeSpent.toFixed(2)}s`);
        }
    }
});

// ✅ Command Handling for `!` Commands
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!") || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    let userTotalTime = await loadUserData();

    if (command === "alltime") {
        const user = message.mentions.users.first() || message.author;
        ensureUserHistory(userTotalTime, user.id);

        const totalSeconds = userTotalTime[user.id]?.total_time || 0;
        const today = new Date().toISOString().split("T")[0];
        const dailySeconds = userTotalTime[user.id]?.history[today] || 0;

        const formatTime = (seconds) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            return `${h}h ${m}m ${s}s`;
        };

        message.channel.send(`🕒 **${user.username}'s Voice Time**\n📅 **Today:** ${formatTime(dailySeconds)}\n🔢 **All Time:** ${formatTime(totalSeconds)}`);
    }

    if (command === "checkweek") {
        const user = message.mentions.users.first() || message.author;
        ensureUserHistory(userTotalTime, user.id);

        const today = new Date();
        const weekDays = [...Array(7)].map((_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            return d.toISOString().split("T")[0];
        });

        let report = `📅 **${user.username}'s Weekly Voice Time:**\n`;
        weekDays.forEach(day => {
            const time = userTotalTime[user.id]?.history[day] || 0;
            report += `📆 **${day}:** ${Math.floor(time / 3600)}h ${Math.floor((time % 3600) / 60)}m\n`;
        });

        message.channel.send(report);
    }
});

// ✅ Event: Bot is Ready
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// ✅ Start the bot
client.login(process.env.DISCORD_BOT_TOKEN);
