const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    ApplicationCommandOptionType,
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

// 🔹 Set the admin Role ID
const admin_ROLE_ID = "1108295271101759499"; // Replace with the actual role ID

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

// ✅ Track users joining/leaving voice channels
client.on("voiceStateUpdate", async (oldState, newState) => {
    const userId = newState.member?.id || oldState.member?.id;
    const username = newState.member?.user?.username || oldState.member?.user?.username;
    if (!userId || !username) return;

    let userData = await fetchUserData();

    // 🎤 User joins voice (Start timer)
    if (newState.channel && !usersInVoice[userId]) {
        usersInVoice[userId] = Date.now();
        console.log(`🎤 ${username} joined ${newState.channel.name}`);
    }

    // 🚪 User leaves voice (Stop timer and update time)
    if ((!newState.channel && oldState.channel) && usersInVoice[userId]) {
        const timeSpent = (Date.now() - usersInVoice[userId]) / 1000;
        delete usersInVoice[userId];
        if (timeSpent > 10) {
            // Ignore if user left instantly
            if (!userData[userId]) {
                userData[userId] = {
                    username,
                    total_time: 0,
                    history: {},
                };
            }
            const today = new Date().toISOString().split("T")[0];
            userData[userId].total_time += timeSpent;
            userData[userId].history[today] = (userData[userId].history[today] || 0) + timeSpent;
            await saveUserData(userData);
            console.log(`🚪 ${username} left voice channel. Time added: ${Math.floor(timeSpent / 60)} min`);
        }
    }
});

// ✅ Handle slash command for searching admins
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand() && !interaction.isAutocomplete()) return;

    const { commandName, options } = interaction;

    // Handle autocomplete for the search command
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const guild = interaction.guild;

        // Fetch members with the admin role
        const membersWithRole = guild.members.cache.filter((member) => member.roles.cache.has(admin_ROLE_ID));
        const filteredMembers = Array.from(membersWithRole.values())
            .filter((member) => {
                const displayName = member.nickname || member.user.username;
                return displayName.toLowerCase().includes(focusedValue.toLowerCase());
            })
            .map((member) => ({
                name: member.nickname || member.user.username,
                value: member.id,
            }));

        // Limit to 25 suggestions (Discord's maximum)
        await interaction.respond(filteredMembers.slice(0, 25));
        return;
    }

    // Handle the search command
    if (commandName === "search") {
        const userId = options.getString("name");
        const userData = await fetchUserData();
        const user = userData[userId];

        if (!user) {
            return interaction.reply({
                content: "❌ No data found for this user.",
                ephemeral: true,
            });
        }

        // Create buttons for timeframes
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
    if (interaction.isButton() && (interaction.customId.startsWith("day_") ||
        interaction.customId.startsWith("week_") ||
        interaction.customId.startsWith("month_") ||
        interaction.customId.startsWith("alltime_"))) {
        const userId = interaction.customId.split("_")[1];
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

        if (interaction.customId.startsWith("day_")) {
            const today = new Date().toISOString().split("T")[0];
            timeframeLabel = "🕒 Today";
            timeframeData = formatTime(user.history[today] || 0);
        } else if (interaction.customId.startsWith("week_")) {
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
        } else if (interaction.customId.startsWith("month_")) {
            timeframeLabel = "🗓️ This Month";
            timeframeData = formatTime(calculateMonthlyTime(user.history));
        } else if (interaction.customId.startsWith("alltime_")) {
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

// ✅ Register slash commands
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Define the search command
    const searchCommand = new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search for an admin by name or nickname.")
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("The name or nickname of the admin to search for.")
                .setRequired(true)
                .setAutocomplete(true)
        );

    // Register the command globally
    await client.application.commands.create(searchCommand);
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
