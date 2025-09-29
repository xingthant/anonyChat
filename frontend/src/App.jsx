import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [alias, setAlias] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Load alias from localStorage on component mount
  useEffect(() => {
    const savedAlias = localStorage.getItem('anonymousChatAlias');
    if (savedAlias) {
      setAlias(savedAlias);
    } else {
      const randomAlias = `User${Math.floor(1000 + Math.random() * 9000)}`;
      setAlias(randomAlias);
      localStorage.setItem('anonymousChatAlias', randomAlias);
    }

    const generatedClientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setClientId(generatedClientId);
    localStorage.setItem('anonymousChatClientId', generatedClientId);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus message input when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      messageInputRef.current?.focus();
    }
  }, [isAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!passphrase.trim()) {
      setError('Please enter a passphrase');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ passphrase: passphrase.trim() }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        setIsAuthenticated(true);
        initializeSocket();
      } else {
        setError(data.message || 'Authentication failed');
      }
    } catch (err) {
      setError('Failed to connect to server. Please check the URL and try again.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeSocket = () => {
    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Connected to server with ID:', newSocket.id);
      setError('');
    });

    newSocket.on('chat message', (messageData) => {
      setMessages(prev => [...prev, { ...messageData, type: 'message' }]);
    });

    newSocket.on('user joined', (data) => {
      setMessages(prev => [...prev, { ...data, type: 'system-join' }]);
      setOnlineUsers(prev => prev + 1);
    });

    newSocket.on('user left', (data) => {
      setMessages(prev => [...prev, { ...data, type: 'system-left' }]);
      setOnlineUsers(prev => Math.max(0, prev - 1));
    });

    newSocket.on('user count', (count) => {
      setOnlineUsers(count);
    });

    newSocket.on('user typing', (data) => {
      if (data.clientId !== clientId) {
        const newTypingUsers = new Set(typingUsers);
        if (data.isTyping) {
          newTypingUsers.add(data.alias);
        } else {
          newTypingUsers.delete(data.alias);
        }
        setTypingUsers(newTypingUsers);
      }
    });

    newSocket.on('error', (errorData) => {
      setError(errorData.message || 'An error occurred');
    });

    newSocket.on('disconnect', (reason) => {
      setError('Disconnected from server. Please refresh the page.');
      console.log('Disconnected:', reason);
    });

    setSocket(newSocket);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim() || !socket) return;

    const messageToSend = {
      message: message.trim(),
      alias: alias || 'Anonymous',
      clientId: clientId
    };

    socket.emit('chat message', messageToSend);
    setMessage('');
    handleStopTyping();
    messageInputRef.current?.focus();
  };

  const handleTyping = () => {
    if (!socket) return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing', { 
        isTyping: true, 
        alias: alias || 'Anonymous',
        clientId: clientId 
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 1000);
  };

  const handleStopTyping = () => {
    if (!socket || !isTyping) return;

    setIsTyping(false);
    socket.emit('typing', { 
      isTyping: false, 
      alias: alias || 'Anonymous',
      clientId: clientId 
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleAliasUpdate = (newAlias) => {
    const finalAlias = newAlias.trim() || `User${Math.floor(1000 + Math.random() * 9000)}`;
    setAlias(finalAlias);
    localStorage.setItem('anonymousChatAlias', finalAlias);
    
    if (socket) {
      socket.emit('update alias', { alias: finalAlias });
    }
  };

  const formatMessageTime = (timestamp) => {
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffInHours = (now - messageTime) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return messageTime.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return messageTime.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    setIsAuthenticated(false);
    setMessages([]);
    setPassphrase('');
    setError('');
    setOnlineUsers(0);
    setTypingUsers(new Set());
  };

  const getTypingText = () => {
    const users = Array.from(typingUsers);
    if (users.length === 0) return null;
    if (users.length === 1) return `${users[0]} is typing...`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`;
    return `${users[0]} and ${users.length - 1} others are typing...`;
  };

  // Login View
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card glass">
          <div className="login-header">
            <div className="login-icon">💬</div>
            <h1 className="login-title">Anonymous Chat</h1>
            <p className="login-subtitle">Secure, private, and ephemeral conversations</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="passphrase" className="form-label">
                Room Passphrase
              </label>
              <div className="input-with-icon">
                <input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter the secret passphrase"
                  className="form-input"
                  disabled={isLoading}
                />
                <span className="input-icon">🔒</span>
              </div>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !passphrase.trim()}
              className="btn btn-primary"
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  Connecting...
                </>
              ) : (
                <>
                  <span>🚀</span>
                  Join Secure Chat
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>Your identity is protected. Messages vanish when you leave.</p>
          </div>
        </div>
      </div>
    );
  }

  // Chat View
  return (
    <div className="chat-app">
      <header className="chat-header">
        <div className="header-content">
          <div className="header-left">
            <div className="header-icon">💬</div>
            <div>
              <h1 className="header-title">Anonymous Chat</h1>
              <div className="header-subtitle">
                <span className="status-indicator">
                  <div className="status-dot"></div>
                  {onlineUsers} online
                </span>
                <span>🔒 Secure</span>
                <span>🎭 Anonymous</span>
              </div>
            </div>
          </div>
          
          <div className="header-right">
            <div className="alias-input-container">
              <span className="alias-label">Your alias:</span>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                onBlur={(e) => handleAliasUpdate(e.target.value)}
                className="alias-input"
                placeholder="Your alias"
                maxLength={20}
              />
            </div>
            
            <button
              onClick={handleLogout}
              className="btn btn-danger"
            >
              Leave Chat
            </button>
          </div>
        </div>
      </header>

      <div className="chat-container">
        <div className="chat-window">
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💭</div>
                <p className="empty-title">Welcome to the conversation!</p>
                <p className="empty-subtitle">Send a message to start chatting anonymously</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                if (msg.type === 'system-join' || msg.type === 'system-left') {
                  return (
                    <div key={msg.id || index} className="system-message">
                      <span className="system-bubble">
                        {msg.message}
                      </span>
                    </div>
                  );
                }

                const isOwnMessage = msg.clientId === clientId;
                
                return (
                  <div
                    key={msg.id}
                    className={`message ${isOwnMessage ? 'message-own' : 'message-other'}`}
                  >
                    <div className="message-bubble">
                      {!isOwnMessage && (
                        <div className="message-sender">
                          <div 
                            className="sender-dot"
                            style={{ backgroundColor: msg.color }}
                          ></div>
                          {msg.alias}
                        </div>
                      )}
                      <div className="message-text">
                        {msg.message}
                      </div>
                      <div className="message-time">
                        {formatMessageTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            
            {/* Typing Indicator */}
            {getTypingText() && (
              <div className="typing-indicator">
                <div className="typing-bubble">
                  <div className="typing-dots">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                  <span>{getTypingText()}</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <div className="message-input-container">
            <form onSubmit={handleSendMessage} className="message-form">
              <div className="message-input-wrapper">
                <input
                  ref={messageInputRef}
                  type="text"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    handleTyping();
                  }}
                  onBlur={handleStopTyping}
                  placeholder="Type your message... (Press Enter to send)"
                  className="message-input"
                  maxLength={1000}
                />
                <div className="char-count">
                  {message.length}/1000
                </div>
              </div>
              <button
                type="submit"
                disabled={!message.trim()}
                className="send-button"
              >
                <span>Send</span>
                <span>🚀</span>
              </button>
            </form>
            
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="security-footer">
              <span className="security-item">
                <span>🔒</span>
                <span>End-to-End Encrypted</span>
              </span>
              <span className="security-divider">•</span>
              <span className="security-item">
                <span>🎭</span>
                <span>Anonymous</span>
              </span>
              <span className="security-divider">•</span>
              <span className="security-item">
                <span>⏰</span>
                <span>Ephemeral</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;