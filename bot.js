const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Define intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// File to store user voice time data
const DATA_FILE = path.join(__dirname, "user_time_data.json");

// Load or initialize data
let userTotalTime = {};
if (fs.existsSync(DATA_FILE)) {
    try {
        userTotalTime = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (error) {
        console.error("⚠️ Error loading user data:", error);
        userTotalTime = {};
    }
}

// Users currently in voice channels (tracks when they joined)
const usersInVoice = {};

// Save user time data
const saveUserTime = () => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userTotalTime, null, 4));
};

// Ensure user data exists
const ensureUserHistory = (userId) => {
    if (!userTotalTime[userId]) {
        userTotalTime[userId] = { total_time: 0, history: {} };
    }
};

// ✅ Event: When a user joins or leaves a voice channel
client.on("voiceStateUpdate", (oldState, newState) => {
    const userId = newState.member.id;
    ensureUserHistory(userId);

    // 🎤 User joins a voice channel (or switches)
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

            // Update history
            userTotalTime[userId].total_time += timeSpent;
            userTotalTime[userId].history[today] = (userTotalTime[userId].history[today] || 0) + timeSpent;

            delete usersInVoice[userId]; // Remove from active tracking
            saveUserTime();
            console.log(`🚪 ${newState.member.displayName} left voice. Time added: ${timeSpent.toFixed(2)}s`);
        }
    }
});

// ✅ Command Handling for `!` Commands
client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!") || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "alltime") {
        const user = message.mentions.users.first() || message.author;
        ensureUserHistory(user.id);

        const totalSeconds = userTotalTime[user.id].total_time || 0;
        const today = new Date().toISOString().split("T")[0];
        const dailySeconds = userTotalTime[user.id].history[today] || 0;

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
        ensureUserHistory(user.id);

        const today = new Date();
        const weekDays = [...Array(7)].map((_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            return d.toISOString().split("T")[0];
        });

        let report = `📅 **${user.username}'s Weekly Voice Time:**\n`;
        weekDays.forEach(day => {
            const time = userTotalTime[user.id].history[day] || 0;
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
