const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://anony-chat-one.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS to all routes
app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

const io = socketIo(server, {
  cors: {
    origin: [
      'https://anony-chat-one.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Environment variables
const PORT = process.env.PORT || 3001;
const CHAT_ROOM_PASSCODE = process.env.CHAT_ROOM_PASSCODE || 'secret123';

// Store connected clients
const connectedClients = new Map();
const typingUsers = new Map();

// Authentication endpoint
app.post('/api/login', (req, res) => {
  // Set CORS headers explicitly for this endpoint
  res.header('Access-Control-Allow-Origin', 'https://anony-chat-one.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
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
  res.header('Access-Control-Allow-Origin', 'https://anony-chat-one.vercel.app');
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    connectedClients: connectedClients.size,
    cors: 'Enabled for anony-chat-one.vercel.app'
  });
});

// Test endpoint to verify CORS
app.get('/api/test-cors', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'https://anony-chat-one.vercel.app');
  res.json({ 
    message: 'CORS is working!',
    timestamp: new Date().toISOString(),
    allowedOrigin: 'https://anony-chat-one.vercel.app'
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  const userColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 65%)`;
  
  connectedClients.set(socket.id, {
    id: socket.id,
    color: userColor,
    connectedAt: new Date(),
    alias: `User${Math.floor(1000 + Math.random() * 9000)}`
  });

  io.emit('user count', connectedClients.size);

  socket.broadcast.emit('user joined', {
    id: socket.id,
    message: 'A new user joined the chat',
    timestamp: new Date().toISOString()
  });

  // Handle chat messages
  socket.on('chat message', (data) => {
    try {
      const { message, alias, clientId } = data;
      
      if (!message || message.trim() === '') {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      if (message.length > 1000) {
        socket.emit('error', { message: 'Message too long' });
        return;
      }

      const client = connectedClients.get(socket.id);
      if (client && alias) {
        client.alias = alias;
        connectedClients.set(socket.id, client);
      }

      const messageData = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        message: message.trim(),
        alias: alias || client?.alias || 'Anonymous',
        clientId: clientId || socket.id,
        timestamp: new Date().toISOString(),
        color: client?.color || userColor
      };

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
    
    typingUsers.delete(socket.id);
    
    socket.broadcast.emit('user left', {
      id: socket.id,
      message: 'A user left the chat',
      timestamp: new Date().toISOString()
    });
    
    connectedClients.delete(socket.id);
    io.emit('user count', connectedClients.size);
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔧 CORS enabled for: https://anony-chat-one.vercel.app`);
  console.log(`🔐 Passphrase protection: ${CHAT_ROOM_PASSCODE !== 'secret123' ? 'Custom' : 'Default'}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
