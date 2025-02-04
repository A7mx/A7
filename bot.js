const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require("discord.js");
const axios = require("axios");
require("dotenv").config();
const express = require("express");
const app = express();
const PORT = process.env.PORT || 10000;

// 🔹 Discord Bot Initialization
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
const OWNER_ROLE_ID = "1108295271101759499"; // Replace with the actual Owner role ID

// 🔹 BattleMetrics Configuration
const BOT_TOKEN = process.env.botToken;
const WEBHOOK_URL = process.env.webhookUrl; // For cheater notifications
const API_KEY = process.env.apiKey;
const SERVER_ID = process.env.server_id1; // Server ID for Server #1

// Track users currently in voice channels
const usersInVoice = {};

// Local caches for flagged players
const flaggedPlayersCache = new Map(); // Tracks flagged players (key: playerId, value: notification message ID)

// Rate limiting variables
const MAX_API_CALLS_PER_MINUTE = 60; // Maximum allowed API calls per minute
let apiCallCount = 0; // Tracks the total number of API calls made in the current minute
let lastResetTime = Date.now(); // Tracks the last reset time for the global API call counter

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

    // Check if the user has the Owner role
    const member = newState.member || oldState.member;
    if (!member.roles.cache.has(OWNER_ROLE_ID)) return;

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
        if (timeSpent > 10) { // Ignore if user left instantly
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

// ✅ Create an embed with profile pictures of users with the Owner role
async function showOwnerProfiles(interaction) {
    const guild = interaction.guild;

    // Fetch members with the Owner role using the role ID
    const membersWithRole = guild.members.cache.filter((member) => member.roles.cache.has(OWNER_ROLE_ID));
    if (membersWithRole.size === 0) {
        return interaction.reply({
            content: "❌ No members found with the Owner role.",
            flags: 64, // Ephemeral response
        });
    }

    const userData = await fetchUserData();

    // Create an embed with profile pictures and buttons
    const embed = new EmbedBuilder()
        .setTitle("👥 A7 Admin Checker | By @A7madShooter")
        .setDescription("Click on a user's name to view their voice activity stats.")
        .setColor("#0099ff");

    const buttons = [];
    membersWithRole.forEach((member) => {
        const userId = member.id;
        const displayName = member.nickname || member.user.username; // Use nickname if available, otherwise username
        const isOnline = member.presence?.status === "online";

        // Add a button for each owner
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`user_${userId}`)
                .setLabel(displayName.substring(0, 80)) // Ensure label doesn't exceed 80 characters
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
                flags: 64, // Ephemeral response
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
            flags: 64, // Ephemeral response
        });
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

        await interaction.reply({
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
        await showOwnerProfiles(message);
    }
});

// ✅ BattleMetrics: Enforce global rate limiting
const enforceRateLimit = async () => {
    const now = Date.now();
    const resetInterval = 60000; // 1 minute in milliseconds
    // Reset the counter if the interval has passed
    if (now - lastResetTime >= resetInterval) {
        apiCallCount = 0;
        lastResetTime = now;
    }
    // Enforce rate limiting
    if (apiCallCount >= MAX_API_CALLS_PER_MINUTE) {
        console.log(`Reached the maximum API call limit (${MAX_API_CALLS_PER_MINUTE}/minute). Waiting...`);
        await new Promise(resolve => setTimeout(resolve, resetInterval - (now - lastResetTime)));
        apiCallCount = 0; // Reset the counter after waiting
    }
    apiCallCount++;
};

// ✅ BattleMetrics: Fetch all online players in the server
const getOnlinePlayers = async () => {
    let allPlayers = [];
    let nextPage = `https://api.battlemetrics.com/players?filter[servers]=${SERVER_ID}&filter[online]=true&fields[player]=name&page[size]=100&sort=-updatedAt`;
    try {
        while (nextPage) {
            await enforceRateLimit(); // Enforce rate limiting before making the API call
            const response = await axios.get(nextPage, {
                headers: {
                    Authorization: `Bearer ${API_KEY}`,
                },
            });
            if (!response.data || !response.data.data || response.data.data.length === 0) {
                break;
            }
            allPlayers = allPlayers.concat(response.data.data);
            nextPage = response.data.links?.next || null; // Check for next page
        }
        return allPlayers; // Return all players
    } catch (error) {
        console.error(`Error fetching players for Server #1:`, error.message);
        return [];
    }
};

// ✅ BattleMetrics: Fetch player flags for a specific player
const getPlayerFlags = async (playerId) => {
    const url = `https://api.battlemetrics.com/players/${playerId}`;
    const headers = {
        Authorization: `Bearer ${API_KEY}`,
    };
    const params = {
        include: 'playerFlag',
        'fields[playerFlag]': 'name,description',
    };
    try {
        await enforceRateLimit(); // Enforce rate limiting before making the API call
        const response = await axios.get(url, { headers, params });
        if (!response.data || !response.data.included || response.data.included.length === 0) {
            return [];
        }
        return response.data.included.filter(item => item.type === 'playerFlag');
    } catch (error) {
        console.error(`Error fetching player flags for player ID ${playerId}:`, error.message);
        return [];
    }
};

// ✅ BattleMetrics: Fetch detailed player information (including SteamID)
const getPlayerDetails = async (playerId) => {
    const url = `https://api.battlemetrics.com/players/${playerId}`;
    const headers = {
        Authorization: `Bearer ${API_KEY}`,
    };
    try {
        await enforceRateLimit(); // Enforce rate limiting before making the API call
        const response = await axios.get(url, { headers });
        if (!response.data || !response.data.data) {
            return null;
        }
        const playerData = response.data.data.attributes;
        const identifiers = playerData.identifiers || []; // Extract identifiers array
        const steamId = identifiers.find(id => id.startsWith('steam:')) || 'N/A'; // Find Steam ID
        return { ...playerData, steamId };
    } catch (error) {
        console.error(`Error fetching player details for player ID ${playerId}:`, error.message);
        return null;
    }
};

// ✅ BattleMetrics: Send Discord notification for flagged players
const sendDiscordNotification = async (playerName, playerId, flagName, flagDescription, steamProfileUrl, steamAvatarUrl, steamId) => {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`details_${playerId}`)
                .setLabel('View Details')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`dismiss_${playerId}`)
                .setLabel('Dismiss')
                .setStyle(ButtonStyle.Danger)
        );
    const data = {
        embeds: [
            {
                title: `⚠️ Possible Cheater Detected on Server #1`,
                description: `Player **${playerName}** has the flag: **${flagName}**.\n\nDescription: ${flagDescription}`,
                url: steamProfileUrl, // Link to the player's Steam profile
                thumbnail: {
                    url: steamAvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png', // Default avatar if none is provided
                },
                fields: [
                    { name: 'Steam Profile', value: `[Click Here](${steamProfileUrl})`, inline: true },
                    { name: 'Player ID', value: `\`${playerId}\``, inline: true },
                    { name: 'SteamID', value: `\`${steamId}\``, inline: true }, // Include SteamID
                ],
                color: 16711680, // Red color for warnings
                footer: {
                    text: `Server #1 | Powered by A7 Servers`,
                },
            },
        ],
        components: [row],
    };
    try {
        const response = await axios.post(WEBHOOK_URL, data);
        if (response.status === 204) {
            console.log(`Notification sent for player: ${playerName}`);
            return response.headers['x-message-id']; // Return the message ID for tracking
        }
    } catch (error) {
        console.error(`Failed to send Discord notification:`, error.message);
    }
};

// ✅ BattleMetrics: Remove Discord notification for players who left the server
const removeDiscordNotification = async (messageId) => {
    const deleteUrl = `${WEBHOOK_URL}/messages/${messageId}`;
    try {
        await axios.delete(deleteUrl);
        console.log(`Removed notification with message ID: ${messageId}`);
    } catch (error) {
        console.error(`Failed to remove notification with message ID ${messageId}:`, error.message);
    }
};

// ✅ BattleMetrics: Check players and handle notifications for Server #1
const checkPlayersForServer = async () => {
    console.log(`Starting scan for all online players in Server #1...`);
    const players = await getOnlinePlayers();
    if (players.length === 0) {
        console.log(`No online players to check for Server #1.`);
        return;
    }
    console.log(`Processing ${players.length} online players in Server #1...`);
    // Track current online players
    const currentOnlinePlayers = new Set();
    for (const player of players) {
        const playerName = player.attributes.name;
        const playerId = player.id;
        const steamProfileUrl = player.attributes.profile || 'https://steamcommunity.com/'; // Default Steam profile URL
        const steamAvatarUrl = player.attributes.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'; // Default avatar
        const lastSeenTimestamp = player.attributes.lastSeen ? player.attributes.lastSeen * 1000 : Date.now(); // Convert to milliseconds or use current time
        const lastSeen = new Date(lastSeenTimestamp);
        console.log(`Checking player: ${playerName} (ID: ${playerId})`);
        console.log(`Steam Profile: ${steamProfileUrl}`);
        console.log(`Steam Avatar: ${steamAvatarUrl}`);
        console.log(`Last Seen: ${lastSeen.toLocaleString()}`);
        // Skip if the player was last seen more than 5 minutes ago (to avoid stale data)
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (lastSeenTimestamp < fiveMinutesAgo) {
            console.log(`Skipping player ${playerName} (ID: ${playerId}) due to stale data.`);
            continue;
        }
        // Verify the player belongs to the specified server
        const playerServerId = player.relationships?.server?.data?.id;
        if (playerServerId !== SERVER_ID) {
            console.log(`Skipping player ${playerName} (ID: ${playerId}) as they are not in the specified server.`);
            continue;
        }
        // Add the player to the current online players set
        currentOnlinePlayers.add(playerId);
        // Skip if the player lacks required attributes
        if (!playerName || !playerId) {
            console.log(`Skipping player due to missing attributes: ${playerName} (ID: ${playerId})`);
            continue;
        }
        const flags = await getPlayerFlags(playerId); // Call the getPlayerFlags function
        if (flags.length > 0) {
            for (const flag of flags) {
                const flagName = flag.attributes.name;
                const flagDescription = flag.attributes.description || 'No description provided.';
                console.log(`Player ${playerName} on Server #1 has flag: ${flagName}`);
                // Case-insensitive flag matching
                if (flagName.trim().toLowerCase() === 'possible cheater') {
                    // Fetch detailed player information (including SteamID)
                    const playerDetails = await getPlayerDetails(playerId);
                    const steamId = playerDetails?.steamId || 'N/A';
                    // If the player is not already flagged, send a notification
                    if (!flaggedPlayersCache.has(playerId)) {
                        const messageId = await sendDiscordNotification(
                            playerName,
                            playerId,
                            flagName,
                            flagDescription,
                            steamProfileUrl,
                            steamAvatarUrl,
                            steamId // Include SteamID in the notification
                        );
                        flaggedPlayersCache.set(playerId, messageId); // Store the player ID and message ID
                        console.log(`Added player ${playerName} (ID: ${playerId}) to the flagged cache.`);
                    }
                }
            }
        }
    }
    // Identify players who are no longer online and remove their notifications
    for (const [playerId, messageId] of flaggedPlayersCache.entries()) {
        if (!currentOnlinePlayers.has(playerId)) {
            await removeDiscordNotification(messageId);
            flaggedPlayersCache.delete(playerId);
            console.log(`Removed notification for player ID ${playerId} as they are no longer online.`);
        }
    }
    console.log(`Finished scanning all players in Server #1.`);
};

// ✅ BattleMetrics: Periodically check players for Server #1
const checkServers = async () => {
    const now = Date.now();
    const resetInterval = 60000; // 1 minute in milliseconds
    // Reset the API call counter if the interval has passed
    if (now - lastResetTime >= resetInterval) {
        apiCallCount = 0;
        lastResetTime = now;
    }
    // Check players for Server #1
    await checkPlayersForServer();
    // Stop checking if the global API call limit is reached
    if (apiCallCount >= MAX_API_CALLS_PER_MINUTE) {
        console.log(`Reached the maximum API call limit (${MAX_API_CALLS_PER_MINUTE}/minute). Pausing checks until the next minute.`);
    }
};

// ✅ Start Bot
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    checkServers(); // Perform an initial check
    setInterval(checkServers, 60 * 1000); // Check every minute
});

// ✅ Dummy Express server to satisfy Render's port requirement
app.get("/", (req, res) => {
    res.send("Bot is running!");
});
app.listen(PORT, () => {
    console.log(`🌐 Server is running on port ${PORT}`);
});

// Log in to Discord
client.login(BOT_TOKEN).catch(error => {
    console.error('Failed to log in to Discord:', error.message);
});
