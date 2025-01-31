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
        GatewayIntentBits.MessageContent
    ]
});

// 🔹 Replace with your Discord text channel ID
const TEXT_CHANNEL_ID = "1328094647938973768"; 

let lastSentMessageId = null; // Stores last message ID for updates

// 🔹 User data (Stored in memory, updated in Discord)
let userData = {
    "194999993143263241": {
        "total_time": 2063.6601571292877,
        "history": {
            "2025-01-29": 1914.7335412502289,
            "2025-01": 1914.7335412502289,
            "2025-01-30": 31.397
        }
    },
    "1296571757108658304": {
        "total_time": 953.7574205875396,
        "history": {
            "2025-01-29": 867.5824205875397,
            "2025-01": 867.5824205875397,
            "2025-01-30": 86.175
        }
    }
};

// ✅ Function to Update Discord Message
async function updateDiscordChannel() {
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
    }
}

// ✅ Function to Simulate Data Changes Every 10 Seconds
async function simulateDataChange() {
    console.log("🔄 Checking for updates...");
    
    // Simulating data change (for testing)
    const userIds = Object.keys(userData);
    const randomUser = userIds[Math.floor(Math.random() * userIds.length)];
    userData[randomUser].total_time += Math.random() * 50; // Increment random value

    await updateDiscordChannel(); // Update Discord message
    setTimeout(simulateDataChange, 10000); // Runs every 10 seconds
}

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
