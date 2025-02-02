const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");
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

// 🔹 Set the Admin Role ID
const ADMIN_ROLE_ID = "1108295271101759499"; // Replace with the actual role ID

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

// ✅ Format time into HH:mm:ss with two-digit seconds (ensure seconds are integers)
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60); // Ensure seconds are integers
    const formattedSeconds = String(secs).padStart(2, "0"); // Ensure two-digit seconds
    return `${hours}h ${minutes}m ${formattedSeconds}s`;
}

// ✅ Create an embed with a searchable dropdown menu of users with the Admin role
async function showAdminProfiles(interaction, query = "", page = 1) {
    const guild = interaction.guild;

    // Fetch members with the Admin role using the role ID
    const membersWithRole = guild.members.cache.filter((member) => member.roles.cache.has(ADMIN_ROLE_ID));
    if (membersWithRole.size === 0) {
        return interaction.reply({
            content: "❌ No members found with the Admin role.",
            flags: 64, // Ephemeral response
        });
    }

    // Filter members based on the query
    const filteredMembers = Array.from(membersWithRole.values()).filter((member) => {
        const displayName = member.nickname || member.user.username;
        return displayName.toLowerCase().includes(query.toLowerCase());
    });

    if (filteredMembers.length === 0) {
        return interaction.reply({
            content: "❌ No matching admins found.",
            flags: 64, // Ephemeral response
        });
    }

    const pageSize = 25; // Maximum of 25 options per dropdown
    const totalPages = Math.ceil(filteredMembers.length / pageSize);

    // Calculate the members to display on the current page
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageMembers = filteredMembers.slice(start, end);

    // Create a dropdown menu with the current page's members
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`admin_select_page_${page}`)
        .setPlaceholder("Select an Admin to view their stats");

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

    // Add a button for searching
    const searchButton = new ButtonBuilder()
        .setCustomId("search_admin")
        .setLabel("🔍 Search Admins")
        .setStyle(ButtonStyle.Primary);

    const actionRow = new ActionRowBuilder().addComponents(searchButton);

    // Create the embed
    const embed = new EmbedBuilder()
        .setTitle("👥 A7 Admin Checker | By @A7madShooter")
        .setDescription(`Select an admin from the dropdown to view their voice activity stats.\n*Page ${page} of ${totalPages}*`)
        .setColor("#0099ff");

    await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu), paginationRow, actionRow],
        flags: 64, // Ephemeral response
    });
}

// ✅ Handle interactions
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    const customId = interaction.customId;

    // Defer the reply to allow time for processing
    await interaction.deferReply({ flags: 64 });

    // Handle admin selection from the dropdown
    if (customId.startsWith("admin_select_page_")) {
        const selectedUserId = interaction.values[0]; // Get the selected user ID
        const userData = await fetchUserData();
        const user = userData[selectedUserId];
        if (!user) {
            return interaction.editReply({
                content: "❌ No data found for this user.",
                flags: 64, // Ephemeral response
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

        await interaction.editReply({
            embeds: [embed],
            components: [actionRow],
            flags: 64, // Ephemeral response
        });
    }

    // Handle pagination button clicks
    if (customId === "prev_page" || customId === "next_page") {
        const currentPage = parseInt(interaction.message.embeds[0].description.match(/Page (\d+)/)[1]);
        const newPage = customId === "prev_page" ? currentPage - 1 : currentPage + 1;
        await interaction.editReply(await showAdminProfiles(interaction, "", newPage));
    }

    // Handle search button click
    if (customId === "search_admin") {
        const modal = new ModalBuilder()
            .setCustomId("search_modal")
            .setTitle("Search Admins");

        const searchInput = new TextInputBuilder()
            .setCustomId("search_query")
            .setLabel("Enter a name or nickname to search:")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(searchInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    }

    // Handle modal submission
    if (interaction.isModalSubmit() && interaction.customId === "search_modal") {
        const query = interaction.fields.getTextInputValue("search_query");
        await showAdminProfiles(interaction, query);
    }

    // Handle timeframe button clicks
    if (customId.startsWith("day_") || customId.startsWith("week_") ||
        customId.startsWith("month_") || customId.startsWith("alltime_")) {
        const userId = customId.split("_")[1];
        const userData = await fetchUserData();
        const user = userData[userId];
        if (!user) {
            return interaction.editReply({
                content: "❌ No data found for this user.",
                flags: 64, // Ephemeral response
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

        await interaction.editReply({
            embeds: [embed],
            flags: 64, // Ephemeral response
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
        await showAdminProfiles(message);
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
