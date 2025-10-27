const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Ensure 'videos' directory exists
const videoDir = path.join(__dirname, 'videos');
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir);
}

// Store room state in memory
const roomState = {};

// CORS setup for Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins
    methods: ['GET', 'POST'],
  },
});
// CORS setup for Express
app.use(cors());

// --- THIS IS THE CORRECTED POSITION & BLOCK ---
// Serve static video files with correct content types
// This MUST be before other app.get() routes
app.use('/videos', express.static(path.join(__dirname, 'videos'), {
  setHeaders: (res, filePath) => {
    // This header allows the video to be embedded on other origins (like localhost:5173)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // This block ensures videos play in the browser, not download
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp4') {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (ext === '.webm') {
      res.setHeader('Content-Type', 'video/webm');
    } else if (ext === '.ogg') {
      res.setHeader('Content-Type', 'video/ogg');
    } else if (ext === '.mkv') {
      res.setHeader('Content-Type', 'video/x-matroska');
    }
  }
}));
// --- END OF FIX ---

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'videos/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    console.log('Received file mimetype:', file.mimetype); 
    const allowedExts = ['.mp4', '.webm', '.ogg', '.wmv', '.mkv'];
    
    const isVideoMime = file.mimetype.startsWith('video/');
    const ext = path.extname(file.originalname).toLowerCase();
    const isVideoExt = allowedExts.includes(ext);

    if (isVideoMime || isVideoExt) {
      cb(null, true);
    } else {
      console.error(`Rejected file: ${file.originalname}, mimetype: ${file.mimetype}, ext: ${ext}`);
      cb(new Error('Not an allowed video file type!'), false);
    }
  },
});

// --- API Routes ---
app.get('/', (req, res) => {
  res.send('Watch Party Server is running!');
});

app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded or invalid file type.');
  }
  const videoPath = `/videos/${req.file.filename}`;
  res.json({ videoPath: videoPath });
});

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  const getRoom = () => {
    return Array.from(socket.rooms)[1];
  };

  socket.on('join', (room) => {
    // --- THIS IS THE DEBUGGING LINE ---
    console.log(`User ${socket.id} trying to join room: '${room}'`);
    // --- END OF NEW LINE ---

    const currentRoom = getRoom();
    if (currentRoom) {
      socket.leave(currentRoom);
    }
    socket.join(room);
    console.log(`User ${socket.id} joined room ${room}`);

    if (!roomState[room]) {
      console.log(`Creating new room: '${room}'`);
      roomState[room] = {
        videoSrc: null,
        playing: false,
        currentTime: 0,
        host: socket.id, 
      };
    } else {
      console.log(`Joining existing room: '${room}'`);
    }
    socket.emit('room-state', roomState[room]);
    io.to(room).emit('new-host', roomState[room].host);
  });

  socket.on('become-host', () => {
    const room = getRoom();
    if (!room || !roomState[room]) return;
    roomState[room].host = socket.id;
    io.to(room).emit('new-host', roomState[room].host);
  });

  socket.on('set-video', (videoSrc) => {
    const room = getRoom();
    if (!room || !roomState[room] || roomState[room].host !== socket.id) return;
    
    console.log(`Host ${socket.id} set video for room '${room}' to: ${videoSrc}`);
    
    roomState[room].videoSrc = videoSrc;
    roomState[room].playing = false;
    roomState[room].currentTime = 0;
    io.to(room).emit('video-set', videoSrc);
  });

  socket.on('play', (currentTime) => {
    const room = getRoom();
    if (!room || !roomState[room] || roomState[room].host !== socket.id) return;
    roomState[room].playing = true;
    roomState[room].currentTime = currentTime;
    socket.broadcast.to(room).emit('played', currentTime);
  });

  socket.on('pause', (currentTime) => {
    const room = getRoom();
    if (!room || !roomState[room] || roomState[room].host !== socket.id) return;
    roomState[room].playing = false;
    roomState[room].currentTime = currentTime;
    socket.broadcast.to(room).emit('paused', currentTime);
  });

  socket.on('seek', (currentTime) => {
    const room = getRoom();
    if (!room || !roomState[room] || roomState[room].host !== socket.id) return;
    roomState[room].currentTime = currentTime;
    socket.broadcast.to(room).emit('seeked', currentTime);
  });

  socket.on('chat-message', (message) => {
    const room = getRoom();
    if (!room) return;
    io.to(room).emit('chat-message', { id: socket.id, message });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const room = getRoom();
    if (!room || !roomState[room]) return;

    if (roomState[room].host === socket.id) {
      console.log(`Host ${socket.id} disconnected from room '${room}'`);
      const clients = io.sockets.adapter.rooms.get(room);
      if (clients && clients.size > 0) {
        const newHostId = Array.from(clients)[0];
        roomState[room].host = newHostId;
        console.log(`New host for room '${room}' is: ${newHostId}`);
        io.to(room).emit('new-host', newHostId);
      } else {
        console.log(`Room '${room}' is empty. Deleting state.`);
        delete roomState[room];
      }
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});