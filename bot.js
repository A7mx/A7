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
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
    ],
});

// 🔹 Set your Discord text channel IDs
const TEXT_CHANNEL_ID = "1328094647938973768"; // For tracking messages
const DATABASE_CHANNEL_ID = "1334150400143523872"; // For storing data

// 🔹 Set the Owner Role ID
const OWNER_ROLE_ID = "642829799512866872"; // Replace with the actual role ID

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

// ✅ Format time into HH:mm:ss with two-digit seconds (ensure seconds are integers)
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60); // Ensure seconds are integers
    const formattedSeconds = String(secs).padStart(2, "0"); // Ensure two-digit seconds
    return `${hours}h ${minutes}m ${formattedSeconds}s`;
}

// ✅ Create an embed with profile pictures of users with the Owner role
async function showOwnerProfiles(interaction) {
    const guild = interaction.guild;

    // Fetch members with the Owner role using the role ID
    const membersWithRole = guild.members.cache.filter((member) => member.roles.cache.has(OWNER_ROLE_ID));
    if (membersWithRole.size === 0) {
        return interaction.reply("❌ No members found with the Owner role.");
    }

    const userData = await fetchUserData();

    // Create an embed with profile pictures and buttons
    const embed = new EmbedBuilder()
        .setTitle("👥 Owners in the Server")
        .setDescription("Click on a user's name to view their voice activity stats.")
        .setColor("#0099ff");

    const buttons = [];
    membersWithRole.forEach((member) => {
        const userId = member.id;
        const username = member.user.username;
        const isOnline = member.presence?.status === "online";

        // Add a button for each owner
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`user_${userId}`)
                .setLabel(username)
                .setStyle(isOnline ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
    });

    // Split buttons into rows (max 5 buttons per row)
    const actionRows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
        actionRows.push(row);
    }

    await interaction.reply({
        embeds: [embed],
        components: actionRows,
    });
}

// ✅ Handle button clicks to show user stats
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    // Handle user profile button clicks
    if (customId.startsWith("user_")) {
        const userId = customId.split("_")[1];
        const userData = await fetchUserData();
        const user = userData[userId];

        if (!user) {
            return interaction.reply({
                content: "❌ No data found for this user.",
                ephemeral: true,
            });
        }

        // Create three new buttons for Day, Week, Month, and All Time
        const dayButton = new ButtonBuilder()
            .setCustomId(`day_${userId}`)
            .setLabel("📅 Day")
            .setStyle(ButtonStyle.Primary);

        const weekButton = new ButtonBuilder()
            .setCustomId(`week_${userId}`)
            .setLabel("🗓️ Week")
            .setStyle(ButtonStyle.Primary);

        const monthButton = new ButtonBuilder()
            .setCustomId(`month_${userId}`)
            .setLabel("🗓️ Month")
            .setStyle(ButtonStyle.Primary);

        const allTimeButton = new ButtonBuilder()
            .setCustomId(`alltime_${userId}`)
            .setLabel("⏳ All Time")
            .setStyle(ButtonStyle.Primary);

        const actionRow = new ActionRowBuilder().addComponents(dayButton, weekButton, monthButton, allTimeButton);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Select a Timeframe for ${user.username}`)
            .setDescription("Choose a timeframe to view voice activity stats.")
            .setColor("#0099ff")
            .setThumbnail(interaction.guild.members.cache.get(userId)?.user.displayAvatarURL({ dynamic: true }));

        await interaction.reply({
            embeds: [embed],
            components: [actionRow],
            ephemeral: true,
        });
    }

    // Handle timeframe button clicks
    if (customId.startsWith("day_") || customId.startsWith("week_") || customId.startsWith("month_") || customId.startsWith("alltime_")) {
        const userId = customId.split("_")[1];
        const userData = await fetchUserData();
        const user = userData[userId];

        if (!user) {
            return interaction.reply({
                content: "❌ No data found for this user.",
                ephemeral: true,
            });
        }

        let timeframeLabel = "";
        let timeframeTime = 0;

        if (customId.startsWith("day_")) {
            const today = new Date().toISOString().split("T")[0];
            timeframeLabel = "🕒 Today";
            timeframeTime = user.history[today] || 0;
        } else if (customId.startsWith("week_")) {
            timeframeLabel = "📅 This Week";
            timeframeTime = calculateWeeklyTime(user.history);
        } else if (customId.startsWith("month_")) {
            timeframeLabel = "🗓️ This Month";
            timeframeTime = calculateMonthlyTime(user.history);
        } else if (customId.startsWith("alltime_")) {
            timeframeLabel = "⏳ All Time";
            timeframeTime = user.total_time;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📊 Voice Activity Stats for ${user.username}`)
            .setDescription(`Here are the voice activity stats for <@${userId}>:`)
            .addFields([{ name: timeframeLabel, value: formatTime(timeframeTime), inline: true }])
            .setColor("#0099ff")
            .setThumbnail(interaction.guild.members.cache.get(userId)?.user.displayAvatarURL({ dynamic: true }));

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });
    }
});

// ✅ Calculate weekly time from history
function calculateWeeklyTime(history) {
    const today = new Date();
    let totalSeconds = 0;
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const day = date.toISOString().split("T")[0];
        totalSeconds += history[day] || 0;
    }
    return totalSeconds;
}

// ✅ Calculate monthly time from history
function calculateMonthlyTime(history) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let totalSeconds = 0;

    for (const day in history) {
        const date = new Date(day);
        if (date >= startOfMonth) {
            totalSeconds += history[day];
        }
    }
    return totalSeconds;
}

// ✅ Command to trigger the profile display
client.on("messageCreate", async (message) => {
    if (message.content === "!owners") {
        await showOwnerProfiles(message);
    }
});

// ✅ Start Bot
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
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
