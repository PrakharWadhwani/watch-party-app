import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import VideoPlayer from './VideoPlayer.jsx'; // Using your player
import axios from 'axios';
import './App.css'; // Your original App.css

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
console.log("Using SERVER_URL:", SERVER_URL); // <-- ADDED LOG

// --- THIS IS THE CONNECTION FIX ---
const socket = io(SERVER_URL, {
  transports: ['polling'] // Force it to NOT use WebSockets
});
// --- END OF FIX ---

function App() {
  const [room, setRoom] = useState('');
  const [joined, setJoined] = useState(false);
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [hostId, setHostId] = useState(null);
  const [myId, setMyId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // isHost will be calculated right before rendering
  // const isHost = myId === hostId; // Moved calculation lower

  useEffect(() => {
    socket.on('connect', () => {
      const connectedId = socket.id; // Store in a variable first
      setMyId(connectedId);
      console.log('Connect Event: Set myId to:', connectedId); // <-- MODIFIED LOG
    });

    socket.on('video-set', (src) => {
      console.log('Video set to:', src);
      setVideoSrc(src);
      setPlaying(false);
    });

    socket.on('room-state', (state) => {
      console.log('Raw received room state:', state); // <-- ADDED LOG
      setVideoSrc(state.videoSrc);
      setPlaying(state.playing);
      setHostId(state.host);
      console.log('Room State Event: Set hostId to:', state.host); // <-- ADDED LOG
    });

    socket.on('new-host', (id) => {
      console.log('New host event received:', id); // <-- ADDED LOG
      setHostId(id);
      console.log('New Host Event: Set hostId to:', id); // <-- ADDED LOG
    });

    socket.on('chat-message', (msg) => {
      setMessages((prevMessages) => [...prevMessages, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleJoin = () => {
    if (room) {
      socket.emit('join', room);
      setJoined(true);
    }
  };

  const handleBecomeHost = () => {
    socket.emit('become-host');
  };

  const handleSetVideoUrl = () => {
    // We calculate isHost here based on the *current* state
    const currentIsHost = myId === hostId;
    if (!currentIsHost) return;
    socket.emit('set-video', videoUrl);
  };

  const handleSetVideoFile = async () => {
    // We calculate isHost here based on the *current* state
    const currentIsHost = myId === hostId;
    if (!currentIsHost || !videoFile) return;

    console.log('Step 1: Upload button clicked. Starting upload...');
    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const res = await axios.post(`${SERVER_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('Step 2: Upload successful. Server responded:', res.data);

      if (res.data && res.data.videoPath) {
        const fullVideoPath = `${SERVER_URL}${res.data.videoPath}`;

        console.log('Step 3: Emitting "set-video" to server');
        socket.emit('set-video', fullVideoPath);

      } else {
        console.error('CRITICAL ERROR: "videoPath" was not in server response.');
      }
    } catch (err) {
      console.error('CRITICAL ERROR: An error occurred during the set-video process.', err);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socket.emit('chat-message', chatInput);
      setChatInput('');
    }
  };

  // --- Calculate isHost right before rendering ---
  console.log('Render Check - Values:', { myId, hostId }); // <-- ADDED LOG
  const isHost = myId != null && hostId != null && myId === hostId; // Check for nulls too
  console.log('Render Check - Result:', { isHost }); // <-- ADDED LOG
  // ---

  if (!joined) {
    return (
      <div className="room-controls">
        <h2>Join a Watch Party</h2>
        <input
          type="text"
          placeholder="Enter room name"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        />
        <button onClick={handleJoin}>Join Room</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="status-bar">
          <p>Room: <strong>{room}</strong> | My ID: {myId} | Host ID: {hostId}
            {isHost && <strong> (You are the host)</strong>}
          </p>
        </div>

        <div className="player-wrapper">
          <VideoPlayer
            src={videoSrc}
          />
        </div>

        <div className="video-controls">
          <h3>Video Controls</h3>
          <div className="video-controls-grid">
            <div>
              <label>Set Video from URL:</label>
              <input
                type="text"
                placeholder="https://example.com/video.mp4"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={!isHost} // Uses the isHost calculated just before render
              />
              <button onClick={handleSetVideoUrl} disabled={!isHost}>
                Set URL
              </button>
            </div>
            <div>
              <label>Set Video from File:</label>
              <input
                type="file"
                accept="video/*"
                // --- THIS IS THE TYPO FIX ---
                onChange={(e) => setVideoFile(e.target.files[0])}
                // --- END OF FIX ---
                disabled={!isHost} // Uses the isHost calculated just before render
              />
              <button onClick={handleSetVideoFile} disabled={!isHost || !videoFile}>
                Upload & Set
              </button>
            </div>
          </div>
          <button onClick={handleBecomeHost} disabled={isHost}>
            Become Host
          </button>
        </div>
      </div>

      <div className="sidebar">
        <h3>Chat</h3>
        <div className="chat-box">
          <div className="messages">
            {messages.map((msg, index) => (
              <div key={index} className="message">
                <span className="sender">User {msg.id.substring(0, 5)}:</span>
                <p>{msg.message}</p>
              </div>
            ))}
          </div>
          <form className="chat-input" onSubmit={handleSendChat}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;