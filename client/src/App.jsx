import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import VideoPlayer from './VideoPlayer.jsx'; // Using your player
import axios from 'axios';
import './App.css'; // Your original App.css

const SERVER_URL = 'http://localhost:5000';

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

  const isHost = myId === hostId;

  useEffect(() => {
    socket.on('connect', () => {
      setMyId(socket.id);
      console.log('Connected with ID:', socket.id);
    });

    socket.on('video-set', (src) => {
      console.log('Video set to:', src);
      setVideoSrc(src);
      setPlaying(false);
    });

    socket.on('room-state', (state) => {
      console.log('Received room state:', state);
      setVideoSrc(state.videoSrc);
      setPlaying(state.playing);
      setHostId(state.host);
    });

    socket.on('new-host', (id) => {
      console.log('New host:', id);
      setHostId(id);
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
    if (!isHost) return;
    socket.emit('set-video', videoUrl);
  };

  const handleSetVideoFile = async () => {
    if (!isHost || !videoFile) return;

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
                disabled={!isHost}
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
                disabled={!isHost}
              />
              <button onClick={handleSetVideoFile} disabled={!isHost || !videoFile}>
                Upload & Set
              </button>
            </div>
          </div>
          <button onClick={handleBecomeHost} disabled={!isHost}>
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