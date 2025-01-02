const express = require('express');
const app = express();

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Start the Express server
const expressServer = app.listen(process.env.PORT || 4000, () => {
    console.log(`Server is running on port ${process.env.PORT || 4000}`);
});

// Import and initialize Socket.IO with the Express server
const socketio = require('socket.io');
const io = socketio(expressServer);

let sessionIdCounter = 0;
let sessions = {}; // Use an object instead of an array

socket.on("find", (e) => {
    let session = Object.values(sessions).find(s => s.players.length < 4);

    if (!session) {
        session = { id: sessionIdCounter++, players: [], playersScore: [], disconnectedPlayersCount: 0 };
        sessions[session.id] = session;
        console.log("New session created:", session.id);
    }

    session.players.push({ name: e.name, socketId: socket.id });
    console.log(`Player ${e.name} added to session ${session.id}`);

    if (session.players.length === 4) {
        io.emit("find", { connected: true, sessionId: session.id });
        console.log("Players connected in session:", session.players.map(player => player.name));
    }
});

    // Listen for "getScore" event (player score submission)
    socket.on("getScore", (e) => {
        const session = sessions[e.sessionId];

        if (session) {
            session.playersScore.push(e);

            // If all 4 players in the session have submitted their scores
            if (session.playersScore.length === 4) {
                io.emit("getScore", {
                    sessionId: e.sessionId,
                    scores: session.playersScore.map(player => ({ name: player.name, score: player.score }))
                });
                console.log("Scores sent for session:", session.playersScore);
                session.players = []; // Reset players for the session
                session.playersScore = []; // Reset scores for the session
            }
        }
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        for (let session of sessions) {
            const disconnectedPlayerIndex = session.players.findIndex(player => player.socketId === socket.id);

            if (disconnectedPlayerIndex !== -1) {
                if (session.players.length < 4) {
                    // Remove the player from the session if the number of players is less than 4
                    session.players.splice(disconnectedPlayerIndex, 1);
                    console.log(`Player disconnected before 4 players were connected. Removed from the session.`);
                } else {
                    // Set the player's score to zero if the number of players is 4 or more
                    const disconnectedPlayer = session.players[disconnectedPlayerIndex];
                    session.playersScore.push({ name: disconnectedPlayer.name, score: 0 });
                    session.disconnectedPlayersCount++;
                    console.log(`Player disconnected after 4 players were connected. Score set to zero.`);
                }

                // Check if all 4 players in the session have disconnected
                if (session.disconnectedPlayersCount === 4) {
                    // Remove the session from the sessions array
                    sessions.splice(sessions.indexOf(session), 1);
                    console.log("All 4 players disconnected in session. Session removed.");
                }
                break; // Exit the loop once the player is found and handled
            }
        }
    });
});
