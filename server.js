const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize database
const db = new sqlite3.Database('./corkboard.db');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8b6914',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    owner_id TEXT,
    is_public BOOLEAN DEFAULT 0,
    share_token TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    board_id TEXT,
    title TEXT,
    body TEXT,
    details TEXT,
    color TEXT DEFAULT '#fef3c7',
    x INTEGER DEFAULT 0,
    y INTEGER DEFAULT 0,
    z_index INTEGER DEFAULT 1,
    tags TEXT,
    due_date DATE,
    is_flipped BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    card_id TEXT,
    filename TEXT,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS board_collaborators (
    board_id TEXT,
    user_id TEXT,
    role TEXT DEFAULT 'viewer',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
  )`);
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|txt|md/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and text files are allowed'));
    }
  }
});

// API Routes

// Get all boards
app.get('/api/boards', (req, res) => {
  db.all('SELECT * FROM boards ORDER BY updated_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get board with cards
app.get('/api/boards/:id', (req, res) => {
  const boardId = req.params.id;
  
  db.get('SELECT * FROM boards WHERE id = ?', [boardId], (err, board) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    db.all('SELECT * FROM cards WHERE board_id = ? ORDER BY z_index', [boardId], (err, cards) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Parse tags for each card
      cards.forEach(card => {
        card.tags = card.tags ? JSON.parse(card.tags) : [];
      });
      
      res.json({ ...board, cards });
    });
  });
});

// Create board
app.post('/api/boards', (req, res) => {
  const { name, color } = req.body;
  const boardId = uuidv4();
  const shareToken = uuidv4();
  
  db.run('INSERT INTO boards (id, name, color, share_token) VALUES (?, ?, ?, ?)',
    [boardId, name, color || '#8b6914', shareToken], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: boardId, name, color, share_token: shareToken });
  });
});

// Update board
app.put('/api/boards/:id', (req, res) => {
  const { name, color } = req.body;
  const boardId = req.params.id;
  
  db.run('UPDATE boards SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, color, boardId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Delete board
app.delete('/api/boards/:id', (req, res) => {
  const boardId = req.params.id;
  
  db.run('DELETE FROM boards WHERE id = ?', [boardId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// Create card
app.post('/api/cards', (req, res) => {
  const { board_id, title, body, details, color, x, y, z_index, tags, due_date } = req.body;
  const cardId = uuidv4();
  
  db.run(`INSERT INTO cards (id, board_id, title, body, details, color, x, y, z_index, tags, due_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [cardId, board_id, title, body, details, color, x, y, z_index, JSON.stringify(tags || []), due_date],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const newCard = {
        id: cardId,
        board_id,
        title,
        body,
        details,
        color,
        x,
        y,
        z_index,
        tags: tags || [],
        due_date
      };
      
      // Broadcast to all clients in the board room
      io.to(`board-${board_id}`).emit('card-created', newCard);
      
      res.json(newCard);
    });
});

// Update card
app.put('/api/cards/:id', (req, res) => {
  const cardId = req.params.id;
  const updates = req.body;
  
  // Build dynamic update query
  const fields = Object.keys(updates).filter(key => key !== 'id');
  const setClause = fields.map(field => `${field} = ?`).join(', ');
  const values = fields.map(field => {
    if (field === 'tags') {
      return JSON.stringify(updates[field] || []);
    }
    return updates[field];
  });
  values.push(cardId);
  
  db.run(`UPDATE cards SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    values, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Get the board_id for broadcasting
    db.get('SELECT board_id FROM cards WHERE id = ?', [cardId], (err, card) => {
      if (!err && card) {
        io.to(`board-${card.board_id}`).emit('card-updated', { id: cardId, ...updates });
      }
    });
    
    res.json({ success: true });
  });
});

// Delete card
app.delete('/api/cards/:id', (req, res) => {
  const cardId = req.params.id;
  
  // Get the board_id before deletion
  db.get('SELECT board_id FROM cards WHERE id = ?', [cardId], (err, card) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.run('DELETE FROM cards WHERE id = ?', [cardId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (card) {
        io.to(`board-${card.board_id}`).emit('card-deleted', cardId);
      }
      
      res.json({ success: true });
    });
  });
});

// Upload attachment
app.post('/api/cards/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const cardId = req.params.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Process image if it's an image file
    if (file.mimetype.startsWith('image/')) {
      const processedPath = `./uploads/processed-${file.filename}`;
      await sharp(file.path)
        .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(processedPath);
      
      // Replace original with processed image
      fs.unlinkSync(file.path);
      fs.renameSync(processedPath, file.path);
    }
    
    const attachmentId = uuidv4();
    
    db.run(`INSERT INTO attachments (id, card_id, filename, original_name, mime_type, size)
            VALUES (?, ?, ?, ?, ?, ?)`,
      [attachmentId, cardId, file.filename, file.originalname, file.mimetype, file.size],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        res.json({
          id: attachmentId,
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: `/uploads/${file.filename}`
        });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get board by share token
app.get('/api/shared/:token', (req, res) => {
  const token = req.params.token;
  
  db.get('SELECT * FROM boards WHERE share_token = ?', [token], (err, board) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    db.all('SELECT * FROM cards WHERE board_id = ? ORDER BY z_index', [board.id], (err, cards) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      cards.forEach(card => {
        card.tags = card.tags ? JSON.parse(card.tags) : [];
      });
      
      res.json({ ...board, cards });
    });
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Join board room
  socket.on('join-board', (boardId) => {
    socket.join(`board-${boardId}`);
    socket.to(`board-${boardId}`).emit('user-joined', socket.id);
  });
  
  // Leave board room
  socket.on('leave-board', (boardId) => {
    socket.leave(`board-${boardId}`);
    socket.to(`board-${boardId}`).emit('user-left', socket.id);
  });
  
  // Handle card position updates for real-time dragging
  socket.on('card-position-update', (data) => {
    socket.to(`board-${data.boardId}`).emit('card-position-update', data);
  });
  
  // Handle cursor position for collaborative editing
  socket.on('cursor-update', (data) => {
    socket.to(`board-${data.boardId}`).emit('cursor-update', {
      ...data,
      userId: socket.id
    });
  });
  
  // Handle typing indicators
  socket.on('typing-start', (data) => {
    socket.to(`board-${data.boardId}`).emit('typing-start', {
      ...data,
      userId: socket.id
    });
  });
  
  socket.on('typing-stop', (data) => {
    socket.to(`board-${data.boardId}`).emit('typing-stop', {
      ...data,
      userId: socket.id
    });
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve the main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, () => {
  console.log(`Corkboard Pro server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
      process.exit(0);
    });
  });
});