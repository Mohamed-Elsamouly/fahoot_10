const express = require('express');
const app = express();
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

// Constants
const MAX_SESSIONS = 100;
const PLAYERS_PER_SESSION = 4;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.use(express.static('public'));

const expressServer = app.listen(process.env.PORT || 4000, () => {
    console.log(`Server is running on port ${process.env.PORT || 4000}`);
});

const io = new Server(expressServer, {
    pingTimeout: 60000,
    cors: {
        origin: process.env.CORS_ORIGIN || "*"
    }
});

class GameSession {
    constructor() {
        this.players = [];
        this.playersScore = [];
        this.disconnectedPlayersCount = 0;
        this.createdAt = Date.now();
    }

    addPlayer(player) {
        if (this.players.length >= PLAYERS_PER_SESSION) {
            throw new Error('Session is full');
        }
        this.players.push(player);
    }

    isExpired() {
        return Date.now() - this.createdAt > SESSION_TIMEOUT;
    }
}

class SessionManager {
    constructor() {
        this.sessions = [];
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    cleanup() {
        this.sessions = this.sessions.filter(session => !session.isExpired());
    }

    createSession() {
        if (this.sessions.length >= MAX_SESSIONS) {
            throw new Error('Maximum sessions limit reached');
        }
        const session = new GameSession();
        this.sessions.push(session);
        return session;
    }
}

const sessionManager = new SessionManager();

io.on('connection', (socket) => {
    socket.on("find", async (data) => {
        try {
            if (!data.name || typeof data.name !== 'string') {
                throw new Error('Invalid player name');
            }

            let session = sessionManager.sessions.find(s => s.players.length < PLAYERS_PER_SESSION);
            if (!session) {
                session = sessionManager.createSession();
            }

            session.addPlayer({ name: data.name, socketId: socket.id });

            if (session.players.length === PLAYERS_PER_SESSION) {
                io.emit("find", { 
                    connected: true, 
                    sessionId: sessionManager.sessions.indexOf(session) 
                });
            }
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on("getScore", async (data, callback) => {
        try {
            const session = sessionManager.sessions[data.sessionId];
            if (!session) {
                throw new Error('Invalid session');
            }

            session.playersScore.push(data);

            if (session.playersScore.length === PLAYERS_PER_SESSION) {
                io.emit("getScore", {
                    sessionId: data.sessionId,
                    scores: session.playersScore.map(player => ({
                        name: player.name,
                        score: player.score
                    }))
                });

                // Clean up session data
                const sessionIndex = sessionManager.sessions.indexOf(session);
                if (sessionIndex !== -1) {
                    sessionManager.sessions.splice(sessionIndex, 1);
                }
            }

            if (callback) callback({ status: 'success' });
        } catch (error) {
            if (callback) callback({ status: 'error', message: error.message });
        }
    });

    socket.on('disconnect', () => {
        try {
            for (let session of sessionManager.sessions) {
                const playerIndex = session.players.findIndex(
                    p => p.socketId === socket.id
                );

                if (playerIndex !== -1) {
                    if (session.players.length < PLAYERS_PER_SESSION) {
                        session.players.splice(playerIndex, 1);
                    } else {
                        session.playersScore.push({
                            name: session.players[playerIndex].name,
                            score: 0
                        });
                        session.disconnectedPlayersCount++;

                        if (session.disconnectedPlayersCount === PLAYERS_PER_SESSION) {
                            const sessionIndex = sessionManager.sessions.indexOf(session);
                            sessionManager.sessions.splice(sessionIndex, 1);
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    expressServer.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
