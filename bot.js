const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000; // Render expects this

// 🚀 Discord Bot Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 🔹 Replace with your Discord text channel ID
const TEXT_CHANNEL_ID = "1328094647938973768"; 

let lastSentMessageId = null; // Stores last message ID for updates

// 🔹 User data (Stored in memory, updated in Discord)
let userData = {
    timestamp: new Date().toISOString(),
    users: {} // Stores user activity data
};

// ✅ Function to Update Discord Message
async function updateDiscordChannel() {
    const channel = await client.channels.fetch(TEXT_CHANNEL_ID);
    if (!channel) return console.error("⚠️ Discord channel not found!");

    let formattedText = `📢 **Updated Data:**\n\`\`\`json\n${JSON.stringify(userData, null, 2)}\n\`\`\``;

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
    }
}

// ✅ Function to Simulate Data Changes Every 10 Seconds
async function simulateDataChange() {
    console.log("🔄 Simulating data change...");
    userData.timestamp = new Date().toISOString(); // Update timestamp
    await updateDiscordChannel();
    setTimeout(simulateDataChange, 10000); // Runs every 10 seconds
}

// ✅ Track User Activity in Voice Channels
client.on("voiceStateUpdate", async (oldState, newState) => {
    const userId = newState.member.id;
    const username = newState.member.user.username;
    
    if (newState.channel) {
        userData.users[userId] = {
            username: username,
            joined: new Date().toISOString(),
            status: "In Voice Channel"
        };
        console.log(`🎤 ${username} joined ${newState.channel.name}`);
    } else {
        if (userData.users[userId]) {
            userData.users[userId].status = "Left Voice Channel";
            userData.users[userId].left = new Date().toISOString();
            console.log(`🚪 ${username} left voice channel`);
        }
    }

    await updateDiscordChannel();
});

// ✅ Event: Bot is Ready
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await updateDiscordChannel(); // Send initial message
    await simulateDataChange();   // Start auto-updating
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
