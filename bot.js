const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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
const TEXT_CHANNEL_ID = "1324427183246282815"; // For tracking messages
const DATABASE_CHANNEL_ID = "1335732990323593246"; // For storing data

// 🔹 Set the Owner Role ID
const OWNER_ROLE_ID = "1108295271101759499"; // Replace with the actual role ID

// Track users currently in voice channels
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

// ✅ Format time into HH:mm:ss with two-digit seconds
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60); // Ensure seconds are integers
    const formattedSeconds = String(secs).padStart(2, "0"); // Ensure two-digit seconds
    return `${hours}h ${minutes}m ${formattedSeconds}s`;
}

// ✅ Create an embed with a paginated dropdown menu of users with the Owner role
async function showOwnerProfiles(interaction, page = 1) {
    const guild = interaction.guild;

    // Fetch members with the Owner role using the role ID
    const membersWithRole = guild.members.cache.filter((member) => member.roles.cache.has(OWNER_ROLE_ID));
    if (membersWithRole.size === 0) {
        return interaction.reply({
            content: "❌ No members found with the Owner role.",
            ephemeral: true,
        });
    }

    const pageSize = 25; // Maximum of 25 options per dropdown
    const totalPages = Math.ceil(membersWithRole.size / pageSize);

    // Calculate the members to display on the current page
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageMembers = Array.from(membersWithRole.values()).slice(start, end);

    // Create a dropdown menu with the current page's members
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`owner_select_page_${page}`)
        .setPlaceholder("Select an Owner to view their stats");

    pageMembers.forEach((member) => {
        const userId = member.id;
        const displayName = member.nickname || member.user.username;
        selectMenu.addOptions({
            label: displayName,
            value: userId,
        });
    });

    // Add pagination buttons
    const prevButton = new ButtonBuilder()
        .setCustomId("prev_page")
        .setLabel("⬅️ Previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1);

    const nextButton = new ButtonBuilder()
        .setCustomId("next_page")
        .setLabel("➡️ Next")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages);

    const paginationRow = new ActionRowBuilder().addComponents(prevButton, nextButton);

    // Create the embed
    const embed = new EmbedBuilder()
        .setTitle("👥 A7 Admin Checker | By @A7madShooter")
        .setDescription(`Select a user from the dropdown to view their voice activity stats.\n*Page ${page} of ${totalPages}*`)
        .setColor("#0099ff");

    await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu), paginationRow],
        ephemeral: true,
    });
}

// ✅ Handle interactions
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    const customId = interaction.customId;

    // Handle owner selection from the dropdown
    if (customId.startsWith("owner_select_page_")) {
        const selectedUserId = interaction.values[0]; // Get the selected user ID
        const userData = await fetchUserData();
        const user = userData[selectedUserId];
        if (!user) {
            return interaction.reply({
                content: "❌ No data found for this user.",
                ephemeral: true,
            });
        }

        // Create buttons for timeframes
        const dayButton = new ButtonBuilder()
            .setCustomId(`day_${selectedUserId}`)
            .setLabel("📅 Day")
            .setStyle(ButtonStyle.Primary);
        const weekButton = new ButtonBuilder()
            .setCustomId(`week_${selectedUserId}`)
            .setLabel("🗓️ Week")
            .setStyle(ButtonStyle.Primary);
        const monthButton = new ButtonBuilder()
            .setCustomId(`month_${selectedUserId}`)
            .setLabel("🗓️ Month")
            .setStyle(ButtonStyle.Primary);
        const allTimeButton = new ButtonBuilder()
            .setCustomId(`alltime_${selectedUserId}`)
            .setLabel("⏳ All Time")
            .setStyle(ButtonStyle.Primary);

        const actionRow = new ActionRowBuilder().addComponents(dayButton, weekButton, monthButton, allTimeButton);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Select a Timeframe for ${user.username}`)
            .setDescription("Choose a timeframe to view voice activity stats.")
            .setColor("#0099ff")
            .setThumbnail(interaction.guild.members.cache.get(selectedUserId)?.user.displayAvatarURL({ dynamic: true }));

        await interaction.reply({
            embeds: [embed],
            components: [actionRow],
            ephemeral: true,
        });
    }

    // Handle pagination button clicks
    if (customId === "prev_page" || customId === "next_page") {
        const currentPage = parseInt(interaction.message.embeds[0].description.match(/Page (\d+)/)[1]);
        const newPage = customId === "prev_page" ? currentPage - 1 : currentPage + 1;
        await interaction.update(await showOwnerProfiles(interaction, newPage));
    }

    // Handle timeframe button clicks
    if (customId.startsWith("day_") || customId.startsWith("week_") ||
        customId.startsWith("month_") || customId.startsWith("alltime_")) {
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
        let timeframeData = "";

        if (customId.startsWith("day_")) {
            const today = new Date().toISOString().split("T")[0];
            timeframeLabel = "🕒 Today";
            timeframeData = formatTime(user.history[today] || 0);
        } else if (customId.startsWith("week_")) {
            timeframeLabel = "📅 Weekly Breakdown";
            const today = new Date();
            let weeklyBreakdown = "";
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const day = date.toISOString().split("T")[0];
                const dayName = date.toLocaleDateString("en-US", { weekday: "short" }); // e.g., "Mon"
                const dayTime = formatTime(user.history[day] || 0);
                weeklyBreakdown += `📆 **${dayName} (${day})**: ${dayTime}\n`;
            }
            timeframeData = weeklyBreakdown || "No data for the past 7 days.";
        } else if (customId.startsWith("month_")) {
            timeframeLabel = "🗓️ This Month";
            timeframeData = formatTime(calculateMonthlyTime(user.history));
        } else if (customId.startsWith("alltime_")) {
            timeframeLabel = "⏳ All Time";
            timeframeData = formatTime(user.total_time);
        }

        const embed = new EmbedBuilder()
            .setTitle(`📊 Voice Activity Stats for ${user.username}`)
            .setDescription(`Here are the voice activity stats for <@${userId}>:`)
            .addFields([{ name: timeframeLabel, value: timeframeData }])
            .setColor("#0099ff")
            .setThumbnail(interaction.guild.members.cache.get(userId)?.user.displayAvatarURL({ dynamic: true }));

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });
    }
});

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
    if (message.content === "!admin") {
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
