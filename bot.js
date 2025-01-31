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

// ✅ Format time into HH:mm:ss with two-digit seconds
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = String(seconds % 60).padStart(2, "0"); // Ensure two-digit seconds
    return `${hours}h ${minutes}m ${secs}s`;
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
        .setDescription("Click on a profile picture to view their voice activity stats.")
        .setColor("#0099ff");

    const buttons = [];
    membersWithRole.forEach((member) => {
        const userId = member.id;
        const username = member.user.username;

        // Add a button for each owner
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`profile_${userId}`)
                .setLabel(username)
                .setStyle(ButtonStyle.Secondary)
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
    if (customId.startsWith("profile_")) {
        const userId = customId.split("_")[1];
        const userData = await fetchUserData();
        const user = userData[userId];

        if (!user) {
            return interaction.reply({
                content: "❌ No data found for this user.",
                ephemeral: true,
            });
        }

        const today = new Date().toISOString().split("T")[0];
        const todayTime = formatTime(user.history[today] || 0);
        const weeklyTime = calculateWeeklyTime(user.history);
        const totalTime = formatTime(user.total_time);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Voice Activity Stats for ${user.username}`)
            .setDescription(`Here are the voice activity stats for <@${userId}>:`)
            .addFields([
                { name: "🕒 Today", value: todayTime, inline: true },
                { name: "📅 This Week", value: weeklyTime, inline: true },
                { name: "⏳ All Time", value: totalTime, inline: true },
            ])
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
    return formatTime(totalSeconds);
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
