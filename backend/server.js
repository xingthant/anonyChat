const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  credentials: true
};

const io = socketIo(server, {
  cors: corsOptions
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 3001;
const CHAT_ROOM_PASSCODE = process.env.CHAT_ROOM_PASSCODE || 'secret123';

// Store connected clients (in-memory only)
const connectedClients = new Map();
const typingUsers = new Map();

// Authentication endpoint
app.post('/api/login', (req, res) => {
  const { passphrase } = req.body;
  
  if (!passphrase) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Passphrase is required' 
    });
  }

  if (passphrase === CHAT_ROOM_PASSCODE) {
    return res.json({ 
      status: 'success', 
      message: 'Authentication successful' 
    });
  } else {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Invalid passphrase' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    connectedClients: connectedClients.size
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Generate a random color for the user's messages
  const userColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 65%)`;
  
  // Store client info
  connectedClients.set(socket.id, {
    id: socket.id,
    color: userColor,
    connectedAt: new Date(),
    alias: `User${Math.floor(1000 + Math.random() * 9000)}`
  });

  // Send current user count to all clients
  io.emit('user count', connectedClients.size);

  // Notify others about new user
  socket.broadcast.emit('user joined', {
    id: socket.id,
    message: 'A new user joined the chat',
    timestamp: new Date().toISOString()
  });

  // Handle chat messages
  socket.on('chat message', (data) => {
    try {
      const { message, alias, clientId } = data;
      
      // Validate message
      if (!message || message.trim() === '') {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      if (message.length > 1000) {
        socket.emit('error', { message: 'Message too long' });
        return;
      }

      // Update client alias if provided
      const client = connectedClients.get(socket.id);
      if (client && alias) {
        client.alias = alias;
        connectedClients.set(socket.id, client);
      }

      // Prepare message data
      const messageData = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        message: message.trim(),
        alias: alias || client?.alias || 'Anonymous',
        clientId: clientId || socket.id,
        timestamp: new Date().toISOString(),
        color: client?.color || userColor
      };

      // Broadcast to all clients
      io.emit('chat message', messageData);
      console.log(`Message broadcast from ${messageData.alias}: ${messageData.message}`);

    } catch (error) {
      console.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const { isTyping, alias, clientId } = data;
    
    if (isTyping) {
      typingUsers.set(socket.id, { alias, clientId });
    } else {
      typingUsers.delete(socket.id);
    }

    // Broadcast typing status to other users
    socket.broadcast.emit('user typing', {
      isTyping,
      alias,
      clientId
    });
  });

  // Handle alias updates
  socket.on('update alias', (data) => {
    const client = connectedClients.get(socket.id);
    if (client) {
      client.alias = data.alias;
      connectedClients.set(socket.id, client);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id} - Reason: ${reason}`);
    
    // Remove from typing users
    typingUsers.delete(socket.id);
    
    // Notify others about user leaving
    socket.broadcast.emit('user left', {
      id: socket.id,
      message: 'A user left the chat',
      timestamp: new Date().toISOString()
    });
    
    // Remove from connected clients
    connectedClients.delete(socket.id);
    
    // Update user count
    io.emit('user count', connectedClients.size);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔧 CORS enabled for: ${process.env.FRONTEND_URL || 'all origins'}`);
  console.log(`🔐 Passphrase protection: ${CHAT_ROOM_PASSCODE !== 'secret123' ? 'Custom' : 'Default'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});